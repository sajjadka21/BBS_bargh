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


def maybe_run_pending_discovery() -> None:
    if os.environ.get("AUTO_DISCOVER_MAZTOZI_SOURCES", "1").strip() in {"0", "false", "False"}:
        return
    try:
        from discover_maztozi_sources import run_pending_discoveries
        run_pending_discoveries()
    except Exception as exc:
        # Discovery is optional and must never stop the normal six-hour fetch.
        print(f"Maztozi source discovery warning: {exc}", file=sys.stderr)


def fetch_dynamic_cities() -> list[dict[str, Any]]:
    sync_url = required_env("WORKER_SYNC_URL").rstrip("/")
    base_url = sync_url[:-5] if sync_url.endswith("/sync") else sync_url
    headers = {"Authorization": f"Bearer {required_env('WORKER_SYNC_SECRET')}"}
    session = requests.Session()
    session.trust_env = False
    try:
        response = session.get(
            f"{base_url}/fetch-config",
            headers=headers,
            timeout=SYNC_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        body = response.json()
        cities = body.get("cities") if isinstance(body, dict) else None
        if not isinstance(cities, list) or not cities:
            raise RuntimeError("Worker returned no active city configuration.")
        normalized: list[dict[str, Any]] = []
        for city in cities:
            if not isinstance(city, dict):
                continue
            ids = city.get("source_city_ids")
            if not isinstance(ids, list):
                continue
            source_ids = sorted({int(value) for value in ids if str(value).isdigit() and int(value) > 0})
            key = str(city.get("key", "")).strip()
            label = str(city.get("label", "")).strip()
            if key and label and source_ids:
                normalized.append({
                    "key": key,
                    "label": label,
                    "source_city_ids": source_ids,
                    "pgds": str(city.get("pgds", "")),
                })
        if not normalized:
            raise RuntimeError("Worker city configuration contained no usable city.")
        return normalized
    except Exception as exc:
        print(
            f"Dynamic city configuration warning: {exc}. Using local fallback.",
            file=sys.stderr,
        )
        return CITIES


IRAN_TZ = ZoneInfo("Asia/Tehran")

FETCH_TIMEOUT_SECONDS = 30
FETCH_ATTEMPTS = 3
SYNC_TIMEOUT_SECONDS = 30
SYNC_ATTEMPTS = 3
OUTAGE_DURATION_MINUTES = 120

ENGLISH_TO_PERSIAN_DIGITS = str.maketrans(
    "0123456789",
    "۰۱۲۳۴۵۶۷۸۹",
)
TIME_DIGITS_TO_ENGLISH = str.maketrans(
    "۰۱۲۳۴۵۶۷۸۹"
    "٠١٢٣٤٥٦٧٨٩",
    "01234567890123456789",
)
PERSIAN_TEXT_TRANSLATION = str.maketrans(
    {
        "ي": "ی",
        "ى": "ی",
        "ك": "ک",
        "٠": "۰",
        "١": "۱",
        "٢": "۲",
        "٣": "۳",
        "٤": "۴",
        "٥": "۵",
        "٦": "۶",
        "٧": "۷",
        "٨": "۸",
        "٩": "۹",
        "0": "۰",
        "1": "۱",
        "2": "۲",
        "3": "۳",
        "4": "۴",
        "5": "۵",
        "6": "۶",
        "7": "۷",
        "8": "۸",
        "9": "۹",
    }
)

PLANNED_TEXT = "برنامه‌ریزی‌شده"
UNPLANNED_TEXT = "غیرمنتظره"
UNKNOWN_TEXT = "نامشخص"

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
    """Normalize Persian text, separators, letter/number spacing, and whitespace."""
    if value is None:
        return ""

    text = str(value).translate(PERSIAN_TEXT_TRANSLATION)
    text = text.replace("ـ", "")

    # Every underscore/dash variant (including repeated forms such as __ and --)
    # becomes exactly one plain hyphen with one space on each side.
    text = re.sub(r"\s*(?:[_\-‐‑‒–—−]+\s*)+\s*", " - ", text)

    # Separate Persian/Latin letters from Persian digits in both directions.
    text = re.sub(r"(?<=[^\W\d_])(?=[۰-۹])", " ", text)
    text = re.sub(r"(?<=[۰-۹])(?=[^\W\d_])", " ", text)

    # Collapse all ordinary whitespace, then re-assert the exact separator form.
    text = " ".join(text.split())
    text = re.sub(r"\s*(?:[_\-‐‑‒–—−]+\s*)+\s*", " - ", text)
    return text.strip()


def clean_identifier(value: object) -> str:
    """Return an ASCII identifier without surrounding/internal whitespace."""
    if value is None:
        return ""
    return "".join(str(value).translate(TIME_DIGITS_TO_ENGLISH).split())


def derive_time_range(value: object) -> tuple[str, str]:
    """Return the site's displayed two-hour start/end range."""
    text = clean_text(value).translate(TIME_DIGITS_TO_ENGLISH)
    if not text:
        return "", ""

    range_match = re.fullmatch(
        r"(\d{1,2}):(\d{2})\s*(?:-|–|—|تا)\s*(\d{1,2}):(\d{2})",
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


def normalize_api_row(
    raw_row: object,
    source_city_id: int,
) -> dict[str, Any] | None:
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
    outage_type = clean_text(f"{status_text} - {reason}" if reason else status_text)
    from_time, to_time = derive_time_range(raw_row.get("outage_time"))
    outage_number = clean_identifier(raw_row.get("outage_number"))

    return {
        "address": address,
        "type": outage_type,
        "from": clean_text(from_time),
        "to": clean_text(to_time),
        "date": clean_text(raw_row.get("outage_date")),
        "outage_numbers": [outage_number] if outage_number else [],
        "source_city_ids": [str(source_city_id)],
        "reg_date": clean_text(raw_row.get("reg_date")),
        "registerer": clean_text(raw_row.get("registerer")),
    }


def fetch_source_city(
    session: requests.Session,
    city: dict[str, Any],
    source_city_id: int,
    api_date: str,
) -> list[dict[str, Any]]:
    payload = {
        "fromDate": api_date,
        "toDate": api_date,
        "city": source_city_id,
        "pgds": city.get("pgds", ""),
    }

    last_error: Exception | None = None

    for attempt in range(1, FETCH_ATTEMPTS + 1):
        try:
            response = session.post(
                OUTAGES_API_URL,
                headers=API_HEADERS,
                json=payload,
                timeout=FETCH_TIMEOUT_SECONDS,
            )

            if not response.ok:
                raise RuntimeError(
                    f"Outage API failed for {city['key']} source city={source_city_id} "
                    f"with HTTP {response.status_code}: {response.text[:1000]}"
                )

            try:
                data = response.json()
            except ValueError as exc:
                raise RuntimeError(
                    f"Outage API returned invalid JSON for {city['key']} "
                    f"source city={source_city_id}."
                ) from exc

            if not isinstance(data, dict):
                raise RuntimeError(
                    f"Outage API returned an unexpected response for {city['key']} "
                    f"source city={source_city_id}."
                )

            if data.get("success") is False:
                raise RuntimeError(
                    f"Outage API rejected {city['key']} source city={source_city_id}: "
                    f"{clean_text(data.get('message')) or 'unknown error'}"
                )

            raw_rows = data.get("outageList")
            if not isinstance(raw_rows, list):
                raise RuntimeError(
                    f"Outage API response for {city['key']} source city={source_city_id} "
                    "has no outageList array."
                )

            normalized_rows: list[dict[str, Any]] = []
            for raw_row in raw_rows:
                normalized = normalize_api_row(raw_row, source_city_id)
                if normalized is not None:
                    normalized_rows.append(normalized)

            print(
                f"[{city['key']}] source city={source_city_id} "
                f"fetched {len(normalized_rows)} outage row(s)."
            )
            return normalized_rows

        except (requests.RequestException, RuntimeError) as exc:
            last_error = exc
            if attempt < FETCH_ATTEMPTS:
                delay = attempt * 5
                print(
                    f"[{city['key']}] source city={source_city_id} attempt "
                    f"{attempt}/{FETCH_ATTEMPTS} failed: {exc}. "
                    f"Retrying in {delay}s...",
                    file=sys.stderr,
                )
                time.sleep(delay)

    raise RuntimeError(
        f"Could not fetch {city['key']} source city={source_city_id}: {last_error}"
    )


def merge_city_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Merge duplicate blocks by normalized address and keep every known ID."""
    merged: dict[str, dict[str, Any]] = {}

    for row in rows:
        address = str(row["address"])
        current = merged.get(address)

        if current is None:
            merged[address] = {
                **row,
                "outage_numbers": list(row.get("outage_numbers", [])),
                "source_city_ids": list(row.get("source_city_ids", [])),
            }
            continue

        current["outage_numbers"] = sorted(
            {
                *current.get("outage_numbers", []),
                *row.get("outage_numbers", []),
            }
        )
        current["source_city_ids"] = sorted(
            {
                *current.get("source_city_ids", []),
                *row.get("source_city_ids", []),
            },
            key=lambda value: int(value) if str(value).isdigit() else str(value),
        )

        # Keep the first complete block returned by the website. Fill only gaps
        # from duplicate source rows so one address remains one logical block.
        for field in ("type", "from", "to", "date"):
            if not current.get(field) and row.get(field):
                current[field] = row[field]

    return list(merged.values())


def fetch_city(
    session: requests.Session,
    city: dict[str, Any],
    api_date: str,
    fallback_snapshot_date: str,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], str]:
    source_city_ids = city.get("source_city_ids")
    if not isinstance(source_city_ids, list) or not source_city_ids:
        raise RuntimeError(f"No source_city_ids configured for {city['key']}.")

    all_rows: list[dict[str, Any]] = []
    for source_city_id in source_city_ids:
        if not isinstance(source_city_id, int):
            raise RuntimeError(
                f"Invalid source city id for {city['key']}: {source_city_id!r}"
            )
        all_rows.extend(
            fetch_source_city(session, city, source_city_id, api_date)
        )

    distinct_dates = {
        str(row.get("date", "")).strip()
        for row in all_rows
        if str(row.get("date", "")).strip()
    }
    if len(distinct_dates) > 1:
        raise RuntimeError(
            f"Mixed outage dates returned for {city['key']}: "
            f"{sorted(distinct_dates)!r}"
        )

    snapshot_date = next(iter(distinct_dates), clean_text(fallback_snapshot_date))
    for row in all_rows:
        if not row.get("date"):
            row["date"] = snapshot_date

    observations: list[dict[str, Any]] = []
    for row in all_rows:
        for outage_number in row.get("outage_numbers", []):
            source_ids = row.get("source_city_ids", [])
            source_city_id = source_ids[0] if source_ids else ""
            observations.append(
                {
                    "address": row["address"],
                    "outage_number": outage_number,
                    "source_city_id": source_city_id,
                    "date": row.get("date", snapshot_date),
                    "from": row.get("from", ""),
                    "type": row.get("type", ""),
                    "reg_date": row.get("reg_date", ""),
                    "registerer": row.get("registerer", ""),
                }
            )

    return merge_city_rows(all_rows), observations, snapshot_date


def post_snapshot(payload: dict[str, Any]) -> dict[str, Any]:
    sync_url = required_env("WORKER_SYNC_URL")
    sync_secret = required_env("WORKER_SYNC_SECRET")

    headers = {
        "Authorization": f"Bearer {sync_secret}",
        "Content-Type": "application/json; charset=utf-8",
    }

    sync_session = requests.Session()
    sync_session.trust_env = False

    last_error: Exception | None = None

    for attempt in range(1, SYNC_ATTEMPTS + 1):
        try:
            response = sync_session.post(
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

    maybe_run_pending_discovery()
    cities = fetch_dynamic_cities()

    session = requests.Session()

    # Do not inherit VPN/proxy environment variables when accessing the
    # Mazandaran outage API.
    session.trust_env = False

    city_snapshots: list[dict[str, Any]] = []

    for city in cities:
        rows, observations, snapshot_date = fetch_city(
            session,
            city,
            api_date,
            jalali_date,
        )

        print(
            f"[{city['key']}] merged {len(rows)} logical outage block(s) "
            f"from {len(city['source_city_ids'])} API source(s); "
            f"snapshot_date={snapshot_date}, observations={len(observations)}."
        )

        city_snapshots.append(
            {
                "city_key": city["key"],
                "snapshot_date": snapshot_date,
                "rows": rows,
                "observations": observations,
                "source_city_ids": city["source_city_ids"],
                "sources_complete": True,
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
            "[{city}] decision={decision} snapshot={snapshot} active={active} "
            "stored={stored} incoming={incoming} new={new} pending_run={pending}".format(
                city=city_result.get("city_key", "?"),
                decision=city_result.get("decision", "?"),
                snapshot=city_result.get("snapshot_date", "?"),
                active=city_result.get("active_date", "?"),
                stored=city_result.get("stored_count", "?"),
                incoming=city_result.get("incoming_count", "?"),
                new=city_result.get("new_count", "?"),
                pending=city_result.get("pending_consecutive_count", "-"),
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
