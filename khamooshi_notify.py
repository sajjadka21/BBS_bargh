#!/usr/bin/env python3
"""
Daily power-outage (khamooshi) checker for khamooshi.maztozi.ir -- FETCHER ONLY
================================================================================

This script's ONLY job is: fetch today's outage list for every configured
city, diff it against what was seen last time (state_<city>.json), and if
there's anything new, push a Telegram notification (with the city-picker
buttons attached).

It does NOT handle button presses or search replies -- that's entirely the
job of the separate, always-on khamooshi_bot.py (see README.md for why they
are split like this: this script runs on a schedule via GitHub Actions and
its working directory gets reset/cleaned on every run, which would wipe out
any state a live bot needs to keep between runs).

Meant to run a few times a day via GitHub Actions (self-hosted runner).

Requirements
------------
    pip install requests beautifulsoup4 jdatetime PySocks --break-system-packages
"""

import os
import re
from datetime import datetime

import requests
from bs4 import BeautifulSoup
import jdatetime

from khamooshi_common import (
    CITIES, BASE_URL, DIRECT_PROXIES, TELEGRAM_CHAT_ID,
    load_json, save_json, state_file_for, city_menu_keyboard, tg_send_message,
)

DATA_DIR = os.path.dirname(__file__)

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

    state_path = state_file_for(DATA_DIR, city["key"])
    previous = load_json(state_path, [])
    previous_keys = {row_key(r) for r in previous}
    new_rows = [r for r in rows if row_key(r) not in previous_keys]

    save_json(state_path, rows)
    return rows, new_rows


# --------------------------------- MAIN -----------------------------------

def main():
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
