#!/usr/bin/env python3
"""Fetch approved special bill outages from Bargheman without a browser."""
from __future__ import annotations

import base64
import hashlib
import json
import os
import re
import sys
import time
from datetime import date, datetime, time as dt_time, timezone
from typing import Any, Iterable
from zoneinfo import ZoneInfo

import jdatetime
import requests

API_BASE = "https://uiapi2.saapa.ir"
GET_BILLS_PATH = "/api/ebills/GetBills"
PLANNED_PATH = "/api/ebills/PlannedBlackoutsReport"
TEHRAN = ZoneInfo("Asia/Tehran")
DIGIT_TRANSLATION = str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩", "01234567890123456789")
PLACEHOLDER_RE = re.compile(r"\{\{bill:(/[^}]+)\}\}")
BILL_KEY_RE = re.compile(r"(?:bill|شناسه.?قبض|قبض|شناسه)", re.IGNORECASE)

ADDRESS_ALIASES = {
    "address", "outageaddress", "blackoutaddress", "location", "locationtitle",
    "addressdesc", "addressdescription", "آدرس", "نشانی", "محلخاموشی",
}
DATE_ALIASES = {
    "date", "outagedate", "blackoutdate", "planneddate", "startdate",
    "تاریخ", "تاریخخاموشی", "روزخاموشی",
}
START_ALIASES = {
    "from", "fromtime", "start", "starttime", "outagetime", "blackouttime",
    "زمان", "زمانخاموشی", "ساعتشروع", "ازساعت",
}
END_ALIASES = {
    "to", "totime", "end", "endtime", "finish", "finishtime",
    "ساعتپایان", "تاساعت",
}
DESCRIPTION_ALIASES = {
    "description", "reason", "reasonoutage", "status", "title", "message",
    "detail", "details", "توضیحات", "علت", "علتخاموشی", "شرح", "وضعیت",
}
ID_ALIASES = {
    "id", "outageid", "blackoutid", "eventid", "rowid", "کد", "شناسهخاموشی",
}


def required_env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def worker_base_url() -> str:
    configured = required_env("WORKER_SYNC_URL").rstrip("/")
    for suffix in ("/sync", "/special/sync"):
        if configured.endswith(suffix):
            return configured[: -len(suffix)]
    return configured


def worker_headers() -> dict[str, str]:
    return {
        "Authorization": f"Bearer {required_env('WORKER_SYNC_SECRET')}",
        "Content-Type": "application/json; charset=UTF-8",
        "Accept": "application/json",
    }


def normalize_digits(value: object) -> str:
    return str(value).translate(DIGIT_TRANSLATION)


def normalize_bill_id(value: object) -> str:
    return re.sub(r"\D+", "", normalize_digits(value))


def clean_text(value: object) -> str:
    if value is None:
        return ""
    text = normalize_digits(value)
    text = text.replace("ي", "ی").replace("ك", "ک").replace("ـ", "")
    return " ".join(text.split()).strip()


def normalize_key(value: object) -> str:
    text = clean_text(value).lower()
    return re.sub(r"[^0-9a-zآ-ی]+", "", text)


def decode_jwt_exp(authorization: str) -> datetime | None:
    token = authorization.split(" ", 1)[-1]
    parts = token.split(".")
    if len(parts) != 3:
        return None
    try:
        segment = parts[1] + "=" * (-len(parts[1]) % 4)
        body = json.loads(base64.urlsafe_b64decode(segment).decode("utf-8"))
        exp = body.get("exp")
        if isinstance(exp, (int, float)):
            return datetime.fromtimestamp(exp, tz=timezone.utc)
    except Exception:
        return None
    return None


def walk_dicts(value: object) -> Iterable[dict[str, Any]]:
    if isinstance(value, dict):
        yield value
        for child in value.values():
            yield from walk_dicts(child)
    elif isinstance(value, list):
        for child in value:
            yield from walk_dicts(child)


def pointer_unescape(value: str) -> str:
    return value.replace("~1", "/").replace("~0", "~")


def resolve_pointer(value: object, pointer: str) -> object:
    current = value
    if not pointer.startswith("/"):
        raise KeyError(pointer)
    for raw_part in pointer[1:].split("/"):
        part = pointer_unescape(raw_part)
        if isinstance(current, dict):
            current = current[part]
        elif isinstance(current, list):
            current = current[int(part)]
        else:
            raise KeyError(pointer)
    return current


def render_template(value: object, bill_record: dict[str, Any], bill_id: str) -> object:
    if isinstance(value, dict):
        return {key: render_template(child, bill_record, bill_id) for key, child in value.items()}
    if isinstance(value, list):
        return [render_template(child, bill_record, bill_id) for child in value]
    if value == "{{bill_id}}":
        return bill_id
    if isinstance(value, str):
        match = PLACEHOLDER_RE.fullmatch(value)
        if match:
            return resolve_pointer(bill_record, match.group(1))
    return value


def scalar_items(value: object) -> Iterable[tuple[str, object]]:
    if not isinstance(value, dict):
        return
    for key, child in value.items():
        if isinstance(child, dict):
            yield from scalar_items(child)
        elif not isinstance(child, list):
            yield str(key), child


def bill_ids_in_record(record: dict[str, Any]) -> set[str]:
    result: set[str] = set()
    for key, value in scalar_items(record):
        digits = normalize_bill_id(value)
        if 8 <= len(digits) <= 30 and (BILL_KEY_RE.search(key) or str(value).strip() == digits):
            result.add(digits)
    return result


def template_pointers(value: object) -> set[str]:
    pointers: set[str] = set()
    if isinstance(value, dict):
        for child in value.values():
            pointers.update(template_pointers(child))
    elif isinstance(value, list):
        for child in value:
            pointers.update(template_pointers(child))
    elif isinstance(value, str):
        match = PLACEHOLDER_RE.fullmatch(value)
        if match:
            pointers.add(match.group(1))
    return pointers


def find_bill_record(
    bills_body: object,
    bill_id: str,
    template: object,
) -> dict[str, Any] | None:
    required = template_pointers(template)
    candidates: list[tuple[int, dict[str, Any]]] = []
    for record in walk_dicts(bills_body):
        if bill_id not in bill_ids_in_record(record):
            continue
        try:
            for pointer in required:
                resolve_pointer(record, pointer)
        except (KeyError, IndexError, ValueError, TypeError):
            continue
        scalar_count = sum(1 for _ in scalar_items(record))
        candidates.append((scalar_count, record))
    if not candidates:
        return None
    candidates.sort(key=lambda item: item[0])
    return candidates[0][1]


def find_alias(record: dict[str, Any], aliases: set[str]) -> object:
    for key, value in record.items():
        if normalize_key(key) in aliases and not isinstance(value, (dict, list)):
            return value
    return ""


def split_time_range(value: object) -> tuple[str, str]:
    text = clean_text(value)
    if not text:
        return "", ""
    match = re.search(
        r"(?P<from>\d{1,2}:\d{2})\s*(?:-|–|—|تا|الی)\s*(?P<to>\d{1,2}:\d{2})",
        text,
    )
    if match:
        return normalize_clock(match.group("from")), normalize_clock(match.group("to"))
    one = re.search(r"\b\d{1,2}:\d{2}\b", text)
    return (normalize_clock(one.group(0)), "") if one else (text, "")


def normalize_clock(value: object) -> str:
    text = clean_text(value)
    match = re.search(r"(?:^|\D)(\d{1,2}):(\d{2})(?:\D|$)", text)
    if not match:
        return text
    hour, minute = int(match.group(1)), int(match.group(2))
    if 0 <= hour <= 23 and 0 <= minute <= 59:
        return f"{hour:02d}:{minute:02d}"
    return text


def parse_provider_date(value: object) -> tuple[str, date | None]:
    text = clean_text(value)
    if not text:
        return "", None
    match = re.search(r"(\d{3,4})[/-](\d{1,2})[/-](\d{1,2})", text)
    if not match:
        return text, None
    year, month, day = map(int, match.groups())
    display = f"{year:04d}/{month:02d}/{day:02d}"
    try:
        if year < 1700:
            gregorian = jdatetime.date(year, month, day).togregorian()
            return display, gregorian
        return display, date(year, month, day)
    except ValueError:
        return display, None


def start_at_utc(provider_date: date | None, from_time: str) -> str:
    if not provider_date:
        return ""
    match = re.fullmatch(r"(\d{2}):(\d{2})", from_time)
    if not match:
        return ""
    local = datetime.combine(
        provider_date,
        dt_time(int(match.group(1)), int(match.group(2))),
        tzinfo=TEHRAN,
    )
    return local.astimezone(timezone.utc).isoformat()


def record_score(record: dict[str, Any]) -> int:
    keys = {normalize_key(key) for key in record}
    return (
        4 * len(keys.intersection(ADDRESS_ALIASES))
        + 3 * len(keys.intersection(DATE_ALIASES))
        + 3 * len(keys.intersection(START_ALIASES))
        + 2 * len(keys.intersection(END_ALIASES))
        + len(keys.intersection(DESCRIPTION_ALIASES))
    )


def normalize_outage_record(record: dict[str, Any]) -> dict[str, str] | None:
    address = clean_text(find_alias(record, ADDRESS_ALIASES))
    raw_date = find_alias(record, DATE_ALIASES)
    date_text, gregorian = parse_provider_date(raw_date)
    raw_start = find_alias(record, START_ALIASES)
    raw_end = find_alias(record, END_ALIASES)
    from_time, ranged_to = split_time_range(raw_start)
    to_time = normalize_clock(raw_end) or ranged_to
    description_parts = []
    for key, value in record.items():
        if normalize_key(key) in DESCRIPTION_ALIASES:
            text = clean_text(value)
            if text and text not in description_parts:
                description_parts.append(text)
    description = " - ".join(description_parts)
    provider_id = clean_text(find_alias(record, ID_ALIASES))
    if not address and not date_text and not from_time and not description:
        return None
    identity = "\u001f".join((provider_id, date_text, from_time, to_time, address, description))
    return {
        "outage_key": hashlib.sha256(identity.encode("utf-8")).hexdigest(),
        "outage_date": date_text,
        "from_time": from_time,
        "to_time": to_time,
        "start_at_utc": start_at_utc(gregorian, from_time),
        "address": address,
        "description": description,
        "provider_outage_id": provider_id,
    }


def extract_outages(response_body: object) -> list[dict[str, str]]:
    candidates: list[dict[str, str]] = []
    seen: set[str] = set()
    for record in walk_dicts(response_body):
        if record_score(record) < 3:
            continue
        normalized = normalize_outage_record(record)
        if not normalized:
            continue
        key = normalized["outage_key"]
        if key in seen:
            continue
        seen.add(key)
        candidates.append(normalized)
    candidates.sort(key=lambda row: (row["start_at_utc"] == "", row["start_at_utc"], row["outage_date"], row["from_time"]))
    return candidates


def provider_data_is_empty(response_body: object) -> bool:
    if isinstance(response_body, dict):
        for key, value in response_body.items():
            if normalize_key(key) == "data":
                return value in (None, "", [], {})
    return False


def post_worker(path: str, payload: object) -> dict[str, Any]:
    session = requests.Session()
    session.trust_env = False
    response = session.post(
        worker_base_url() + path,
        headers=worker_headers(),
        json=payload,
        timeout=45,
    )
    response.raise_for_status()
    body = response.json()
    return body if isinstance(body, dict) else {"result": body}


def send_health(status: str, detail: str, expires: datetime | None) -> None:
    try:
        post_worker(
            "/special/provider-health",
            {
                "provider_key": "bargheman",
                "status": status,
                "detail": detail[:1000],
                "token_expires_at": expires.isoformat() if expires else None,
                "checked_at": datetime.now(timezone.utc).isoformat(),
            },
        )
    except Exception as exc:
        print(f"Provider health report failed: {exc}", file=sys.stderr)


def get_targets() -> list[dict[str, Any]]:
    session = requests.Session()
    session.trust_env = False
    response = session.get(
        worker_base_url() + "/special/fetch-config",
        headers=worker_headers(),
        timeout=45,
    )
    response.raise_for_status()
    body = response.json()
    targets = body.get("targets") if isinstance(body, dict) else None
    if not isinstance(targets, list):
        raise RuntimeError("Worker returned an invalid special fetch configuration.")
    return [target for target in targets if isinstance(target, dict)]


def main() -> int:
    authorization = required_env("BARGHEMAN_AUTHORIZATION")
    template_text = required_env("BARGHEMAN_PLANNED_TEMPLATE")
    try:
        template = json.loads(template_text)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"BARGHEMAN_PLANNED_TEMPLATE is invalid JSON: {exc}") from exc
    expires = decode_jwt_exp(authorization)
    now = datetime.now(timezone.utc)
    if expires and expires <= now:
        send_health("expired", "JWT برق‌من منقضی شده است.", expires)
        raise RuntimeError("Bargheman JWT has expired. Run bargheman_bootstrap.py again.")

    targets = get_targets()
    headers = {
        "Accept": "application/json, text/plain, */*",
        "Content-Type": "application/json; charset=UTF-8",
        "Origin": "https://bargheman.com",
        "Referer": "https://bargheman.com/",
        "User-Agent": "BBS-bargh-special-fetch/1.0",
        "Authorization": authorization,
    }
    session = requests.Session()
    session.trust_env = False

    try:
        bills_response = session.get(
            API_BASE + GET_BILLS_PATH,
            params={"_timeStamp": str(int(time.time() * 1000))},
            headers=headers,
            timeout=45,
        )
        if bills_response.status_code in (401, 403):
            send_health("auth_failed", f"GetBills returned HTTP {bills_response.status_code}.", expires)
            raise RuntimeError("Bargheman authorization was rejected. Run bargheman_bootstrap.py again.")
        bills_response.raise_for_status()
        bills_body = bills_response.json()
    except requests.RequestException as exc:
        send_health("network_error", f"GetBills failed: {exc}", expires)
        raise

    results: list[dict[str, Any]] = []
    for target in targets:
        request_id = clean_text(target.get("request_id"))
        bill_id = normalize_bill_id(target.get("bill_id"))
        if not re.fullmatch(r"[a-f0-9]{32}", request_id, re.IGNORECASE) or not bill_id:
            continue
        record = find_bill_record(bills_body, bill_id, template)
        if not record:
            results.append({
                "request_id": request_id,
                "status": "not_registered",
                "error": "این شناسه قبض در حساب برق‌من ثبت نشده است.",
                "outages": [],
            })
            continue
        try:
            body = render_template(template, record, bill_id)
            response = session.post(
                API_BASE + PLANNED_PATH,
                headers=headers,
                data=json.dumps(body, ensure_ascii=False, separators=(",", ":")).encode("utf-8"),
                timeout=45,
            )
            if response.status_code in (401, 403):
                send_health("auth_failed", f"PlannedBlackoutsReport returned HTTP {response.status_code}.", expires)
                raise RuntimeError("Bargheman authorization was rejected.")
            response.raise_for_status()
            response_body = response.json()
            outages = extract_outages(response_body)
            if not outages and not provider_data_is_empty(response_body):
                results.append({
                    "request_id": request_id,
                    "status": "parse_error",
                    "error": "پاسخ برق‌من دریافت شد اما ساختار خاموشی قابل تشخیص نبود؛ Bootstrap/Parser باید بررسی شود.",
                    "outages": [],
                })
            else:
                results.append({
                    "request_id": request_id,
                    "status": "ok",
                    "error": "",
                    "outages": outages,
                })
        except Exception as exc:
            results.append({
                "request_id": request_id,
                "status": "error",
                "error": str(exc)[:1000],
                "outages": [],
            })

    fetched_at = datetime.now(timezone.utc).isoformat()
    sync_result = post_worker(
        "/special/sync",
        {
            "provider": "bargheman",
            "fetched_at": fetched_at,
            "results": results,
        },
    )

    if expires and (expires - now).total_seconds() <= 14 * 24 * 60 * 60:
        send_health("expiring", "JWT برق‌من کمتر از ۱۴ روز دیگر منقضی می‌شود.", expires)
    else:
        send_health("ok", "API برق‌من با موفقیت پاسخ داد.", expires)

    print(json.dumps({
        "ok": True,
        "target_count": len(targets),
        "result_count": len(results),
        "worker": sync_result,
        "token_expires_at": expires.isoformat() if expires else None,
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"Bargheman special fetch failed: {exc}", file=sys.stderr)
        raise SystemExit(1)
