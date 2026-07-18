#!/usr/bin/env python3
"""
Daily power-outage (khamooshi) checker for khamooshi.maztozi.ir -- multi-city
==============================================================================

Tracks 2+ شهرستان/امور برق combos and sends everything to the SAME Telegram
chat. Every notification about a *new* outage also comes with two inline
buttons ("نمایش بابلسر" / "نمایش ساری") that let you pull up the full,
already-fetched current list for either city on demand -- pressing a button
does NOT trigger a new website fetch, it just reads what's already stored
in that city's state file.

Because this runs as a scheduled GitHub Actions job (not a live/long-running
bot), button presses are only answered the *next* time the job runs (per the
cron schedule in .github/workflows/notify.yml), not instantly.

Flow on every run:
  1. Poll Telegram getUpdates (since the last processed update_id) to see if
     you pressed a "نمایش ..." button since the last run. If so, reply with
     that city's full current list (from its state file -- no re-fetch).
  2. For every configured city, fetch today's outage list, diff against its
     stored state, and if there are new items, send them to the chat (with
     the same "نمایش ..." buttons attached).

Requirements
------------
    pip install requests beautifulsoup4 jdatetime --break-system-packages
"""

import os
import re
import json
from datetime import datetime

import requests
from bs4 import BeautifulSoup
import jdatetime

# ----------------------------- CONFIG -----------------------------------
BASE_URL = "https://khamooshi.maztozi.ir/"

# Every city/area combo to track. area_id = "-1" means "همه‌ی امور برق"
# (no area filter -- the "-- انتخاب نمایید --" placeholder option).
CITIES = [
    {"key": "babolsar", "label": "بابلسر", "city_id": "990090351", "area_id": "85"},
    {"key": "sari",     "label": "ساری",   "city_id": "1",          "area_id": "-1"},
]

TELEGRAM_BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "PUT_YOUR_BOT_TOKEN_HERE")
TELEGRAM_CHAT_ID = os.environ.get("TELEGRAM_CHAT_ID", "PUT_YOUR_CHAT_ID_HERE")

DATA_DIR = os.path.dirname(__file__)
OFFSET_FILE = os.path.join(DATA_DIR, "offset.json")

TELEGRAM_API = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}"

HEADERS_COMMON = {
    "accept": "*/*",
    "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
    "origin": BASE_URL.rstrip("/"),
    "referer": BASE_URL,
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "x-requested-with": "XMLHttpRequest",
    "x-microsoftajax": "Delta=true",
}

# --------------------------- JSON HELPERS --------------------------------

def load_json(path, default):
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    return default


def save_json(path, obj):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)


def state_file_for(city_key):
    return os.path.join(DATA_DIR, f"state_{city_key}.json")


def city_by_key(key):
    for c in CITIES:
        if c["key"] == key:
            return c
    return None


# --------------------------- TELEGRAM SIDE --------------------------------

def tg_get_updates(offset):
    r = requests.get(f"{TELEGRAM_API}/getUpdates", params={"offset": offset, "timeout": 0}, timeout=20)
    r.raise_for_status()
    return r.json().get("result", [])


def tg_send_message(chat_id, text, with_buttons=True):
    data = {"chat_id": chat_id, "text": text, "parse_mode": "HTML"}
    if with_buttons:
        data["reply_markup"] = json.dumps(city_buttons_keyboard())
    r = requests.post(f"{TELEGRAM_API}/sendMessage", data=data, timeout=20)
    if not r.ok:
        print("sendMessage failed:", r.status_code, r.text)


def tg_answer_callback(callback_query_id, text=""):
    requests.post(f"{TELEGRAM_API}/answerCallbackQuery",
                  data={"callback_query_id": callback_query_id, "text": text}, timeout=20)


def city_buttons_keyboard():
    row = [{"text": f"نمایش {c['label']}", "callback_data": f"show:{c['key']}"} for c in CITIES]
    return {"inline_keyboard": [row]}


def format_city_list(label, rows):
    if not rows:
        return f"فعلاً هیچ خاموشی ثبت‌شده‌ای برای <b>{label}</b> نداریم."
    lines = [f"📋 لیست فعلی خاموشی‌های <b>{label}</b> ({len(rows)} مورد):\n"]
    for r in rows:
        lines.append(f"📍 {r['address']}\n🕒 {r['from']} تا {r['to']} — {r['date']} ({r['type']})\n")
    return "\n".join(lines)


def process_button_presses():
    """Check for any 'نمایش شهر' button presses since last run and answer them
    using whatever is already stored in that city's state file (no re-fetch)."""
    offset_data = load_json(OFFSET_FILE, {"offset": 0})
    offset = offset_data["offset"]
    updates = tg_get_updates(offset)

    for update in updates:
        offset = update["update_id"] + 1

        if "callback_query" in update:
            cq = update["callback_query"]
            chat_id = str(cq["message"]["chat"]["id"])
            data = cq.get("data", "")
            tg_answer_callback(cq["id"])
            if data.startswith("show:"):
                key = data.split(":", 1)[1]
                city = city_by_key(key)
                if city:
                    rows = load_json(state_file_for(key), [])
                    tg_send_message(chat_id, format_city_list(city["label"], rows))

    save_json(OFFSET_FILE, {"offset": offset})


# --------------------------- SITE SCRAPING --------------------------------

def get_fresh_tokens(session: requests.Session):
    resp = session.get(BASE_URL, timeout=20)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "html.parser")

    def hidden(name):
        tag = soup.find("input", {"id": name})
        return tag["value"] if tag and tag.has_attr("value") else ""

    return {
        "__VIEWSTATE": hidden("__VIEWSTATE"),
        "__VIEWSTATEGENERATOR": hidden("__VIEWSTATEGENERATOR"),
        "__EVENTVALIDATION": hidden("__EVENTVALIDATION"),
    }


def parse_delta_response(text: str) -> dict:
    """Parse a Microsoft AJAX partial-postback 'delta' response into
    {panel_id: content} pairs. Format is repeated: <len>|<type>|<id>|<content>|"""
    panels = {}
    pos = 0
    n = len(text)
    while pos < n:
        pipe = text.find("|", pos)
        if pipe == -1:
            break
        try:
            length = int(text[pos:pipe])
        except ValueError:
            break
        pos = pipe + 1
        type_end = text.find("|", pos)
        pos = type_end + 1
        id_end = text.find("|", pos)
        pid = text[pos:id_end]
        pos = id_end + 1
        content = text[pos:pos + length]
        pos += length
        if pos < n and text[pos] == "|":
            pos += 1
        panels[pid] = content
    return panels


def search_outages(session: requests.Session, tokens: dict, city_id: str, area_id: str, date_from: str):
    data = {
        "ctl00$ScriptManager1": "ctl00$ContentPlaceHolder1$upOutage|ctl00$ContentPlaceHolder1$btnSearchOutage",
        "ctl00$ContentPlaceHolder1$txtSubscriberCode": "",
        "ctl00$ContentPlaceHolder1$outage": "rbIsAddress",
        "ctl00$ContentPlaceHolder1$ddlCity": city_id,
        "ctl00$ContentPlaceHolder1$ddlArea": area_id,
        "ctl00$ContentPlaceHolder1$txtPDateFrom": date_from,
        "ctl00$ContentPlaceHolder1$txtPDateTo": "",
        "ctl00$ContentPlaceHolder1$txtAddress": "",
        "__EVENTTARGET": "",
        "__EVENTARGUMENT": "",
        "__LASTFOCUS": "",
        "__VIEWSTATE": tokens["__VIEWSTATE"],
        "__VIEWSTATEGENERATOR": tokens["__VIEWSTATEGENERATOR"],
        "__EVENTVALIDATION": tokens["__EVENTVALIDATION"],
        "__ASYNCPOST": "true",
        "ctl00$ContentPlaceHolder1$btnSearchOutage": "جستجو",
    }
    resp = session.post(BASE_URL, headers=HEADERS_COMMON, data=data, timeout=20)
    resp.raise_for_status()
    return resp.text


def extract_rows(panel_html: str):
    soup = BeautifulSoup(panel_html, "html.parser")
    table = soup.find(id=re.compile("grdOutages"))
    rows = []
    if not table:
        return rows
    trs = table.find_all("tr")
    for tr in trs[1:]:  # skip header row
        cells = [td.get_text(strip=True) for td in tr.find_all("td")]
        if not cells or len(cells) < 4:
            continue
        rows.append({
            "address": cells[0],
            "type": cells[1] if len(cells) > 1 else "",
            "from": cells[2] if len(cells) > 2 else "",
            "to": cells[3] if len(cells) > 3 else "",
            "date": cells[4] if len(cells) > 4 else "",
        })
    return rows


def row_key(row):
    return f"{row['address']}|{row['date']}|{row['from']}|{row['to']}"


def check_city_outages(city, date_from):
    """Returns (all_rows, new_rows) for this city, updating its state file."""
    session = requests.Session()
    tokens = get_fresh_tokens(session)
    delta_text = search_outages(session, tokens, city["city_id"], city["area_id"], date_from)
    panels = parse_delta_response(delta_text)

    panel_html = panels.get("ctl00_ContentPlaceHolder1_upOutage", "")
    if not panel_html:
        panel_html = max(panels.values(), key=len, default="")

    rows = extract_rows(panel_html)

    state_path = state_file_for(city["key"])
    previous = load_json(state_path, [])
    previous_keys = {row_key(r) for r in previous}
    new_rows = [r for r in rows if row_key(r) not in previous_keys]

    save_json(state_path, rows)
    return rows, new_rows


# --------------------------------- MAIN -----------------------------------

def main():
    # 1) answer any button presses from the previous run first
    process_button_presses()

    # 2) fetch + diff every configured city, notify on anything new
    today_jalali = jdatetime.date.fromgregorian(date=datetime.now().date())
    date_from = today_jalali.strftime("%Y/%m/%d")

    for city in CITIES:
        rows, new_rows = check_city_outages(city, date_from)
        print(f"[{city['label']}] total={len(rows)} new={len(new_rows)}")
        if not new_rows:
            continue
        lines = [f"⚡️ <b>{len(new_rows)} خاموشی جدید در {city['label']}</b> ({date_from})\n"]
        for r in new_rows:
            lines.append(f"📍 {r['address']}\n🕒 {r['from']} تا {r['to']} — {r['date']} ({r['type']})\n")
        tg_send_message(TELEGRAM_CHAT_ID, "\n".join(lines))


if __name__ == "__main__":
    main()
