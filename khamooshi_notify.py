#!/usr/bin/env python3
"""
Daily power-outage (khamooshi) checker for khamooshi.maztozi.ir -- multi-city
==============================================================================

Tracks 2+ شهرستان/امور برق combos and sends everything to the SAME Telegram
chat. Every "new outage" notification comes with one button per city
("نمایش بابلسر" / "نمایش ساری"). The flow is pure buttons, no commands:

    [نمایش بابلسر]  [نمایش ساری]
            |
            v  (pressing a city button)
    [🔍 جستجو]   [📋 نمایش همه]
       |                 |
       v                 v
  bot asks for a    every stored row for
  keyword; your     that city is sent as
  next message is   its OWN message (one
  used as the       block = one message)
  search term;
  matches are each
  sent as their own
  message too

Nothing here triggers a new website fetch -- every button/search reply is
answered purely from that city's already-stored state file.

Because this runs as a scheduled GitHub Actions job (not a live/long-running
bot), button presses and search replies are only answered the *next* time
the job runs (per the cron schedule in .github/workflows/notify.yml), not
instantly.

Flow on every run:
  1. Poll Telegram getUpdates (since the last processed update_id) for any
     button presses or pending search replies, and answer them.
  2. For every configured city, fetch today's outage list, diff against its
     stored state, and if there are new items, send them to the chat (with
     the city menu buttons attached).

Requirements
------------
    pip install requests beautifulsoup4 jdatetime PySocks --break-system-packages
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

# Telegram is blocked in Iran, so calls to api.telegram.org must go through a
# local VPN/proxy app (V2rayN, Nekoray, Clash, ...). The khamooshi site, on
# the other hand, must be reached DIRECTLY (no proxy) since it needs an
# Iranian-looking connection. Set TELEGRAM_PROXY to your app's local SOCKS5
# listen address (check your VPN app's settings for "Local Server" /
# "Inbound" / "Listen Port" -- commonly 127.0.0.1:10808 for SOCKS5).
TELEGRAM_PROXY = os.environ.get("TELEGRAM_PROXY", "socks5h://127.0.0.1:10808")
TELEGRAM_PROXIES = {"http": TELEGRAM_PROXY, "https": TELEGRAM_PROXY}

# Explicitly force NO proxy for the khamooshi site, overriding any
# system-wide HTTP_PROXY/HTTPS_PROXY env vars the VPN app might set.
DIRECT_PROXIES = {"http": None, "https": None}

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
    r = requests.get(f"{TELEGRAM_API}/getUpdates", params={"offset": offset, "timeout": 0},
                      proxies=TELEGRAM_PROXIES, timeout=20)
    r.raise_for_status()
    return r.json().get("result", [])


def _chunk_lines(lines, max_len=3500):
    """Group a list of text blocks into chunks whose total length stays
    under max_len, without ever splitting a block (so no HTML tag is cut
    in half)."""
    chunks = []
    current = []
    current_len = 0
    for line in lines:
        if current and current_len + len(line) > max_len:
            chunks.append("\n".join(current))
            current = []
            current_len = 0
        current.append(line)
        current_len += len(line)
    if current:
        chunks.append("\n".join(current))
    return chunks or [""]


PENDING_FILE = os.path.join(DATA_DIR, "pending_search.json")


def city_menu_keyboard():
    """Top-level: one button per city."""
    row = [{"text": f"نمایش {c['label']}", "callback_data": f"city:{c['key']}"} for c in CITIES]
    return {"inline_keyboard": [row]}


def city_action_keyboard(city_key):
    """After picking a city: search or show-everything."""
    return {"inline_keyboard": [[
        {"text": "🔍 جستجو", "callback_data": f"search:{city_key}"},
        {"text": "📋 نمایش همه", "callback_data": f"all:{city_key}"},
    ]]}


def tg_send_message(chat_id, lines, keyboard=None):
    """`lines` is a list of text blocks (e.g. one per outage row). Telegram
    caps messages at ~4096 chars, so we group blocks into chunks that stay
    under that limit. Only the LAST chunk gets any inline keyboard attached."""
    if isinstance(lines, str):
        lines = [lines]
    chunks = _chunk_lines(lines)
    for i, chunk in enumerate(chunks):
        is_last = (i == len(chunks) - 1)
        data = {"chat_id": chat_id, "text": chunk, "parse_mode": "HTML"}
        if keyboard and is_last:
            data["reply_markup"] = json.dumps(keyboard)
        r = requests.post(f"{TELEGRAM_API}/sendMessage", data=data, proxies=TELEGRAM_PROXIES, timeout=20)
        if not r.ok:
            print("sendMessage failed:", r.status_code, r.text)


def tg_send_each_row_separately(chat_id, rows, city_label):
    """Send every outage row as its OWN message (one bloc = one message)."""
    if not rows:
        tg_send_message(chat_id, [f"فعلاً هیچ خاموشی ثبت‌شده‌ای برای <b>{city_label}</b> نداریم."])
        return
    for r in rows:
        block = f"🏙 {city_label}\n📍 {r['address']}\n🕒 {r['from']} تا {r['to']} — {r['date']} ({r['type']})"
        tg_send_message(chat_id, [block])


def tg_answer_callback(callback_query_id, text=""):
    requests.post(f"{TELEGRAM_API}/answerCallbackQuery",
                  data={"callback_query_id": callback_query_id, "text": text},
                  proxies=TELEGRAM_PROXIES, timeout=20)


def city_search(city_key, query):
    """Case-insensitive substring search over ONE city's already-fetched
    state file (address field). Returns a list of matching rows."""
    query = query.strip().lower()
    if not query:
        return []
    rows = load_json(state_file_for(city_key), [])
    return [r for r in rows if query in r["address"].lower()]


def process_button_presses():
    """Check for any button presses (or a pending search reply) since the
    last run, and answer them using whatever is already stored in the state
    files (no re-fetch from the source site)."""
    offset_data = load_json(OFFSET_FILE, {"offset": 0})
    offset = offset_data["offset"]
    updates = tg_get_updates(offset)
    pending = load_json(PENDING_FILE, {})  # {chat_id: city_key} awaiting a search keyword

    for update in updates:
        offset = update["update_id"] + 1

        if "callback_query" in update:
            cq = update["callback_query"]
            chat_id = str(cq["message"]["chat"]["id"])
            data = cq.get("data", "")
            tg_answer_callback(cq["id"])

            if data.startswith("city:"):
                key = data.split(":", 1)[1]
                city = city_by_key(key)
                if city:
                    tg_send_message(chat_id, [f"برای <b>{city['label']}</b> چیکار کنم؟"],
                                     keyboard=city_action_keyboard(key))

            elif data.startswith("all:"):
                key = data.split(":", 1)[1]
                city = city_by_key(key)
                if city:
                    rows = load_json(state_file_for(key), [])
                    tg_send_each_row_separately(chat_id, rows, city["label"])

            elif data.startswith("search:"):
                key = data.split(":", 1)[1]
                city = city_by_key(key)
                if city:
                    pending[chat_id] = key
                    tg_send_message(chat_id, [f"🔍 کلمه‌ای که توی آدرس‌های <b>{city['label']}</b> دنبالش می‌گردی رو بفرست."])

        elif "message" in update:
            msg = update["message"]
            chat_id = str(msg["chat"]["id"])
            text = (msg.get("text") or "").strip()

            if text and chat_id in pending:
                key = pending.pop(chat_id)
                city = city_by_key(key)
                if city:
                    matches = city_search(key, text)
                    if not matches:
                        tg_send_message(chat_id, [f"🔍 برای «{text}» توی <b>{city['label']}</b> چیزی پیدا نشد."])
                    else:
                        for r in matches:
                            block = (f"🏙 {city['label']}\n📍 {r['address']}\n"
                                     f"🕒 {r['from']} تا {r['to']} — {r['date']} ({r['type']})")
                            tg_send_message(chat_id, [block])

    save_json(OFFSET_FILE, {"offset": offset})
    save_json(PENDING_FILE, pending)


# --------------------------- SITE SCRAPING --------------------------------

def get_fresh_tokens(session: requests.Session):
    resp = session.get(BASE_URL, proxies=DIRECT_PROXIES, timeout=20)
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
    resp = session.post(BASE_URL, headers=HEADERS_COMMON, data=data, proxies=DIRECT_PROXIES, timeout=20)
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
        lines = [f"⚡️ <b>{len(new_rows)} خاموشی جدید در {city['label']}</b> ({date_from})"]
        for r in new_rows:
            lines.append(f"📍 {r['address']}\n🕒 {r['from']} تا {r['to']} — {r['date']} ({r['type']})")
        tg_send_message(TELEGRAM_CHAT_ID, lines, keyboard=city_menu_keyboard())


if __name__ == "__main__":
    main()
