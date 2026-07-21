#!/usr/bin/env python3
"""Fetch today's outage snapshots and synchronize them with Cloudflare D1."""

from __future__ import annotations

import os
import re
import sys
import time
from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo

import jdatetime
import truststore

# Use the native Windows certificate store.
truststore.inject_into_ssl()

import requests

from khamooshi_config import CITIES, OUTAGES_API_URL


IRAN_TZ = ZoneInfo("Asia/Tehran")

FETCH_TIMEOUT_SECONDS = 30
SYNC_TIMEOUT_SECONDS = 30
SYNC_ATTEMPTS = 3
OUTAGE_DURATION_MINUTES = 120

ENGLISH_TO_PERSIAN_DIGITS = str.maketrans(
    "0123456789",
    "\u06F0\u06F1\u06F2\u06F3\u06F4\u06F5\u06F6\u06F7\u06F8\u06F9",
)
TIME_DIGITS_TO_ENGLISH = str.maketrans(
    "\u06F0\u06F1\u06F2\u06F3\u06F4\u06F5\u06F6\u06F7\u06F8\u06F9"
    "\u0660\u0661\u0662\u0663\u0664\u0665\u0666\u0667\u0668\u0669",
    "01234567890123456789",
)

PLANNED_TEXT = (
    "\u0628\u0631\u0646\u0627\u0645\u0647\u200c"
    "\u0631\u06cc\u0632\u06cc\u200c\u0634\u062f\u0647"
)
UNPLANNED_TEXT = "\u063a\u06cc\u0631\u0645\u0646\u062a\u0638\u0631\u0647"
UNKNOWN_TEXT = "\u0646\u0627\u0645\u0634\u062e\u0635"

API_HEADERS = {
    "Accept": "*/*",
    "Content-Type": "application/json",
    "Origin": "https://khamooshi.maztozi.ir",
    "Referer": "https://khamooshi.maztozi.ir/",
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/150.0.0.0 Safari/537.36"
    ),
}


def required_env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def clean_text(value: object) -> str:
    """Normalize whitespace, including CR/LF returned inside addresses."""
    if value is None:
        return ""
    return " ".join(str(value).split())


def derive_time_range(value: object) -> tuple[str, str]:
    """Return the site's displayed two-hour start/end range."""
    text = clean_text(value).translate(TIME_DIGITS_TO_ENGLISH)
    if not text:
        return "", ""

    range_match = re.fullmatch(
        r"(\d{1,2}):(\d{2})\s*(?:-|\u2013|\u2014|\u062a\u0627)\s*(\d{1,2}):(\d{2})",
        text,
    )
    if range_match:
        start_hour, start_minute, end_hour, end_minute = map(int, range_match.groups())
        if (
            0 <= start_hour <= 23
            and 0 <= start_minute <= 59
            and 0 <= end_hour <= 23
            and 0 <= end_minute <= 59
        ):
            return (
                f"{start_hour:02d}:{start_minute:02d}",
                f"{end_hour:02d}:{end_minute:02d}",
            )

    start_match = re.fullmatch(r"(\d{1,2}):(\d{2})", text)
    if not start_match:
        return text, ""

    start_hour, start_minute = map(int, start_match.groups())
    if not (0 <= start_hour <= 23 and 0 <= start_minute <= 59):
        return text, ""

    start_total = start_hour * 60 + start_minute
    end_total = (start_total + OUTAGE_DURATION_MINUTES) % (24 * 60)
    return (
        f"{start_hour:02d}:{start_minute:02d}",
        f"{end_total // 60:02d}:{end_total % 60:02d}",
    )


def persian_api_date(iran_now: datetime) -> tuple[str, str]:
    """Return (ASCII Jalali date, Persian-digit Jalali date)."""
    jalali = jdatetime.date.fromgregorian(date=iran_now.date())
    ascii_date = jalali.strftime("%Y/%m/%d")
    api_date = ascii_date.translate(ENGLISH_TO_PERSIAN_DIGITS)
    return ascii_date, api_date


def normalize_api_row(raw_row: object) -> dict[str, str] | None:
    if not isinstance(raw_row, dict):
        return None

    address = clean_text(raw_row.get("address"))
    if not address:
        return None

    planned_value = raw_row.get("is_planned")
    if planned_value is True:
        status_text = PLANNED_TEXT
    elif planned_value is False:
        status_text = UNPLANNED_TEXT
    else:
        status_text = UNKNOWN_TEXT

    reason = clean_text(raw_row.get("reason_outage"))
    outage_type = f"{status_text} - {reason}" if reason else status_text
    from_time, to_time = derive_time_range(raw_row.get("outage_time"))

    return {
        "address": address,
        "type": outage_type,
        "from": from_time,
        "to": to_time,
        "date": clean_text(raw_row.get("outage_date")),
    }


def fetch_city(
    session: requests.Session,
    city: dict[str, Any],
    api_date: str,
) -> list[dict[str, str]]:
    payload = {
        "fromDate": api_date,
        "toDate": api_date,
        "city": city["query_city"],
        "pgds": city.get("pgds", ""),
    }

    response = session.post(
        OUTAGES_API_URL,
        headers=API_HEADERS,
        json=payload,
        timeout=FETCH_TIMEOUT_SECONDS,
    )

    if not response.ok:
        raise RuntimeError(
            f"Outage API failed for {city['key']} "
            f"with HTTP {response.status_code}: {response.text[:1000]}"
        )

    try:
        data = response.json()
    except ValueError as exc:
        raise RuntimeError(
            f"Outage API returned invalid JSON for {city['key']}."
        ) from exc

    if not isinstance(data, dict):
        raise RuntimeError(
            f"Outage API returned an unexpected response for {city['key']}."
        )

    if data.get("success") is False:
        raise RuntimeError(
            f"Outage API rejected {city['key']}: "
            f"{clean_text(data.get('message')) or 'unknown error'}"
        )

    raw_rows = data.get("outageList")
    if not isinstance(raw_rows, list):
        raise RuntimeError(
            f"Outage API response for {city['key']} has no outageList array."
        )

    normalized_rows: list[dict[str, str]] = []
    for raw_row in raw_rows:
        normalized = normalize_api_row(raw_row)
        if normalized is not None:
            normalized_rows.append(normalized)

    return normalized_rows


def post_snapshot(payload: dict[str, Any]) -> dict[str, Any]:
    sync_url = required_env("WORKER_SYNC_URL")
    sync_secret = required_env("WORKER_SYNC_SECRET")

    headers = {
        "Authorization": f"Bearer {sync_secret}",
        "Content-Type": "application/json; charset=utf-8",
    }

    last_error: Exception | None = None

    for attempt in range(1, SYNC_ATTEMPTS + 1):
        try:
            response = requests.post(
                sync_url,
                headers=headers,
                json=payload,
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
                    f"Sync attempt {attempt} failed: {exc}. "
                    f"Retrying in {delay}s...",
                    file=sys.stderr,
                )
                time.sleep(delay)

    raise RuntimeError(f"Could not synchronize with Worker: {last_error}")


def main() -> None:
    iran_now = datetime.now(IRAN_TZ)
    jalali_date, api_date = persian_api_date(iran_now)

    print(f"Fetching Jalali date: {jalali_date}")

    session = requests.Session()

    # Do not inherit VPN/proxy environment variables when accessing the
    # Mazandaran outage API.
    session.trust_env = False

    city_snapshots: list[dict[str, Any]] = []

    for city in CITIES:
        rows = fetch_city(session, city, api_date)

        print(
            f"[{city['key']}] fetched {len(rows)} outage row(s) "
            f"using API city={city['query_city']}."
        )

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

        notification_error = city_result.get("notification_error")
        if notification_error:
            print(
                f"[{city_result.get('city_key', '?')}] "
                f"notification error: {notification_error}",
                file=sys.stderr,
            )


if __name__ == "__main__":
    main()