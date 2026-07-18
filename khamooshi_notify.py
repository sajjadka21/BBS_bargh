#!/usr/bin/env python3
"""
Daily power-outage (khamooshi) checker for khamooshi.maztozi.ir
=================================================================

What it does:
1. Loads the site's home page to get a fresh ASP.NET ViewState + a session cookie
   (this ASP.NET WebForms site requires a valid __VIEWSTATE/__EVENTVALIDATION
   pair that was issued together with the session cookie -- you can't reuse an
   old one).
2. Sends the same "search by address" async postback that the browser sends
   when you click the "جستجو" button, filtered by city + power-area + date.
3. Parses the Microsoft AJAX "delta" partial-postback response, pulls out the
   HTML of the results table, and extracts each outage row.
4. Compares the rows against what we saw last time (stored in state.json).
   Anything new gets sent to Telegram.
5. Meant to be run once (or a few times) a day via cron.

Configuration
-------------
Edit the CONFIG block below or set the corresponding environment variables.

CITY_ID / AREA_ID are the numeric values of the <select> dropdowns
(ddlCity / ddlArea) on the site. Yours (بابلسر / بابلسر) are already filled
in from the request you captured. If you want a different شهرستان/امور برق,
open the page, view source, find:
    <select id="ContentPlaceHolder1_ddlCity"> ... <option value="XXXX">شهر</option>
    <select id="ContentPlaceHolder1_ddlArea"> ... <option value="YY">امور</option>
and use those values instead.

Requirements
------------
    pip install requests beautifulsoup4 jdatetime --break-system-packages
"""

import os
import re
import json
import sys
from datetime import datetime

import requests
from bs4 import BeautifulSoup
import jdatetime

# ----------------------------- CONFIG -----------------------------------
BASE_URL = "https://khamooshi.maztozi.ir/"

CITY_ID = os.environ.get("KHAMOOSHI_CITY_ID", "990090351")   # شهرستان: بابلسر
AREA_ID = os.environ.get("KHAMOOSHI_AREA_ID", "85")           # امور برق: بابلسر

TELEGRAM_BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "PUT_YOUR_BOT_TOKEN_HERE")
TELEGRAM_CHAT_ID = os.environ.get("TELEGRAM_CHAT_ID", "PUT_YOUR_CHAT_ID_HERE")

STATE_FILE = os.path.join(os.path.dirname(__file__), "state.json")

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

# ----------------------------- HELPERS -----------------------------------

def get_fresh_tokens(session: requests.Session):
    """GET the home page and pull out the hidden ASP.NET fields we need."""
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
    {panel_id: content} pairs. Format is repeated:
        <len>|<type>|<id>|<content>|
    """
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
        ptype = text[pos:type_end]
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


def search_outages(session: requests.Session, tokens: dict, date_from: str):
    """Perform the async postback that clicking 'جستجو' triggers."""
    data = {
        "ctl00$ScriptManager1": "ctl00$ContentPlaceHolder1$upOutage|ctl00$ContentPlaceHolder1$btnSearchOutage",
        "ctl00$ContentPlaceHolder1$txtSubscriberCode": "",
        "ctl00$ContentPlaceHolder1$outage": "rbIsAddress",
        "ctl00$ContentPlaceHolder1$ddlCity": CITY_ID,
        "ctl00$ContentPlaceHolder1$ddlArea": AREA_ID,
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
    """Parse the outage table out of the returned panel HTML."""
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


def load_state():
    if os.path.exists(STATE_FILE):
        with open(STATE_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return []


def save_state(rows):
    with open(STATE_FILE, "w", encoding="utf-8") as f:
        json.dump(rows, f, ensure_ascii=False, indent=2)


def row_key(row):
    return f"{row['address']}|{row['date']}|{row['from']}|{row['to']}"


def send_telegram(text: str):
    if "PUT_YOUR" in TELEGRAM_BOT_TOKEN or "PUT_YOUR" in TELEGRAM_CHAT_ID:
        print("!! Telegram bot token / chat id not configured, skipping send.")
        print(text)
        return
    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
    for i in range(0, len(text), 4000):  # Telegram message length limit
        chunk = text[i:i + 4000]
        r = requests.post(url, data={
            "chat_id": TELEGRAM_CHAT_ID,
            "text": chunk,
            "parse_mode": "HTML",
        }, timeout=20)
        if not r.ok:
            print("Telegram send failed:", r.status_code, r.text, file=sys.stderr)


def main():
    today_jalali = jdatetime.date.fromgregorian(date=datetime.now().date())
    date_from = today_jalali.strftime("%Y/%m/%d")

    session = requests.Session()
    tokens = get_fresh_tokens(session)
    delta_text = search_outages(session, tokens, date_from)
    panels = parse_delta_response(delta_text)

    panel_html = panels.get("ctl00_ContentPlaceHolder1_upOutage", "")
    if not panel_html:
        # fall back: sometimes the id key differs slightly, just grab the biggest panel
        panel_html = max(panels.values(), key=len, default="")

    rows = extract_rows(panel_html)

    previous = load_state()
    previous_keys = {row_key(r) for r in previous}
    new_rows = [r for r in rows if row_key(r) not in previous_keys]

    if new_rows:
        lines = [f"⚡️ <b>{len(new_rows)} خاموشی جدید</b> ({date_from})\n"]
        for r in new_rows:
            lines.append(
                f"📍 {r['address']}\n"
                f"🕒 {r['from']} تا {r['to']} — {r['date']} ({r['type']})\n"
            )
        send_telegram("\n".join(lines))
    else:
        print(f"No new outages found ({date_from}). Total tracked: {len(rows)}")

    save_state(rows)


if __name__ == "__main__":
    main()
