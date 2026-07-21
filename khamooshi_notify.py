#!/usr/bin/env python3
"""Fetch the current outage snapshots and synchronize them with Cloudflare.

This script runs on the self-hosted Windows GitHub Actions runner four times a
 day. Telegram handling, state storage, searching, and notifications are owned
by the Cloudflare Worker.
"""

from __future__ import annotations

import json
import os
import re
import sys
import time
from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo

import jdatetime
import requests
from bs4 import BeautifulSoup

from khamooshi_config import BASE_URL, CITIES

IRAN_TZ = ZoneInfo("Asia/Tehran")
SYNC_TIMEOUT_SECONDS = 30
SYNC_ATTEMPTS = 3

HEADERS_COMMON = {
    "accept": "*/*",
    "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
    "origin": BASE_URL.rstrip("/"),
    "referer": BASE_URL,
    "user-agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/126.0.0.0 Safari/537.36"
    ),
    "x-requested-with": "XMLHttpRequest",
    "x-microsoftajax": "Delta=true",
}


def required_env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def get_fresh_tokens(session: requests.Session) -> dict[str, str]:
    response = session.get(BASE_URL, timeout=20)
    response.raise_for_status()
    soup = BeautifulSoup(response.text, "html.parser")

    def hidden(name: str) -> str:
        tag = soup.find("input", {"id": name})
        return str(tag["value"]) if tag and tag.has_attr("value") else ""

    tokens = {
        "__VIEWSTATE": hidden("__VIEWSTATE"),
        "__VIEWSTATEGENERATOR": hidden("__VIEWSTATEGENERATOR"),
        "__EVENTVALIDATION": hidden("__EVENTVALIDATION"),
    }
    if not tokens["__VIEWSTATE"]:
        raise RuntimeError("The outage site did not return a valid VIEWSTATE token.")
    return tokens


def parse_delta_response(text: str) -> dict[str, str]:
    """Parse a Microsoft AJAX partial-postback response."""
    panels: dict[str, str] = {}
    position = 0
    length = len(text)

    while position < length:
        pipe = text.find("|", position)
        if pipe == -1:
            break
        try:
            content_length = int(text[position:pipe])
        except ValueError:
            break

        position = pipe + 1
        type_end = text.find("|", position)
        if type_end == -1:
            break
        position = type_end + 1

        id_end = text.find("|", position)
        if id_end == -1:
            break
        panel_id = text[position:id_end]
        position = id_end + 1

        content = text[position : position + content_length]
        position += content_length
        if position < length and text[position] == "|":
            position += 1

        panels[panel_id] = content

    return panels


def search_outages(
    session: requests.Session,
    tokens: dict[str, str],
    city_id: str,
    area_id: str,
    date_from: str,
) -> str:
    data = {
        "ctl00$ScriptManager1": (
            "ctl00$ContentPlaceHolder1$upOutage|"
            "ctl00$ContentPlaceHolder1$btnSearchOutage"
        ),
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
    response = session.post(
        BASE_URL,
        headers=HEADERS_COMMON,
        data=data,
        timeout=20,
    )
    response.raise_for_status()
    return response.text


def extract_rows(panel_html: str) -> list[dict[str, str]]:
    soup = BeautifulSoup(panel_html, "html.parser")
    table = soup.find(id=re.compile("grdOutages"))
    if not table:
        return []

    rows: list[dict[str, str]] = []
    for table_row in table.find_all("tr")[1:]:
        cells = [cell.get_text(" ", strip=True) for cell in table_row.find_all("td")]
        if len(cells) < 4:
            continue
        rows.append(
            {
                "address": cells[0],
                "type": cells[1] if len(cells) > 1 else "",
                "from": cells[2] if len(cells) > 2 else "",
                "to": cells[3] if len(cells) > 3 else "",
                "date": cells[4] if len(cells) > 4 else "",
            }
        )
    return rows


def fetch_city(city: dict[str, str], date_from: str) -> list[dict[str, str]]:
    # The outage website must be reached directly, without inheriting a
    # machine-wide VPN/proxy configuration used for other applications.
    session = requests.Session()
    session.trust_env = False

    tokens = get_fresh_tokens(session)
    delta_text = search_outages(
        session,
        tokens,
        city["city_id"],
        city["area_id"],
        date_from,
    )
    panels = parse_delta_response(delta_text)

    panel_html = panels.get("ctl00_ContentPlaceHolder1_upOutage", "")
    if not panel_html:
        panel_html = max(panels.values(), key=len, default="")
    return extract_rows(panel_html)


def post_snapshot(payload: dict[str, Any]) -> dict[str, Any]:
    sync_url = required_env("WORKER_SYNC_URL")
    sync_secret = required_env("WORKER_SYNC_SECRET")
    headers = {
        "authorization": f"Bearer {sync_secret}",
        "content-type": "application/json; charset=utf-8",
    }

    last_error: Exception | None = None
    for attempt in range(1, SYNC_ATTEMPTS + 1):
        try:
            response = requests.post(
                sync_url,
                headers=headers,
                data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
                timeout=SYNC_TIMEOUT_SECONDS,
            )
            response.raise_for_status()
            result = response.json()
            if not isinstance(result, dict) or not result.get("ok"):
                raise RuntimeError(f"Unexpected Worker response: {result!r}")
            return result
        except (requests.RequestException, ValueError, RuntimeError) as exc:
            last_error = exc
            if attempt < SYNC_ATTEMPTS:
                delay = attempt * 5
                print(
                    f"Sync attempt {attempt} failed: {exc}. Retrying in {delay}s...",
                    file=sys.stderr,
                )
                time.sleep(delay)

    raise RuntimeError(f"Could not synchronize with Worker: {last_error}")


def main() -> None:
    iran_now = datetime.now(IRAN_TZ)
    jalali_date = jdatetime.date.fromgregorian(date=iran_now.date()).strftime("%Y/%m/%d")

    city_snapshots: list[dict[str, Any]] = []
    for city in CITIES:
        rows = fetch_city(city, jalali_date)
        print(f"[{city['label']}] fetched {len(rows)} outage row(s).")
        city_snapshots.append(
            {
                "city_key": city["key"],
                "rows": rows,
            }
        )

    payload = {
        "source": "github-self-hosted-fetcher",
        "fetched_at": iran_now.isoformat(),
        "jalali_date": jalali_date,
        "cities": city_snapshots,
    }
    result = post_snapshot(payload)

    for city_result in result.get("cities", []):
        print(
            "[{city}] stored={stored} new={new} initial_sync={initial}".format(
                city=city_result.get("city_key", "?"),
                stored=city_result.get("stored_count", "?"),
                new=city_result.get("new_count", "?"),
                initial=city_result.get("initial_sync", "?"),
            )
        )


if __name__ == "__main__":
    main()
