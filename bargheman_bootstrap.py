#!/usr/bin/env python3
"""Capture a reusable Bargheman API session and save it as GitHub Actions secrets.

The authorization token and planned-outage request template are kept in memory.
They are sent directly to GitHub CLI through stdin and are never written to disk.
"""
from __future__ import annotations

import argparse
import base64
import json
import re
import shutil
import subprocess
import sys
import time
from datetime import datetime, timezone
from typing import Any, Iterable

API_BASE = "https://uiapi2.saapa.ir"
BARGHEMAN_URL = "https://bargheman.com/auth"
GET_BILLS_PATH = "/api/ebills/GetBills"
PLANNED_PATH = "/api/ebills/PlannedBlackoutsReport"
DEFAULT_REPOSITORY = "sajjadka21/BBS_bargh"

DIGIT_TRANSLATION = str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩", "01234567890123456789")
BILL_KEY_RE = re.compile(r"(?:bill|شناسه.?قبض|قبض|شناسه)", re.IGNORECASE)
PLACEHOLDER_RE = re.compile(r"\{\{bill:(/[^}]+)\}\}")


def normalize_digits(value: object) -> str:
    return str(value).translate(DIGIT_TRANSLATION)


def normalize_bill_id(value: object) -> str:
    return re.sub(r"\D+", "", normalize_digits(value))


def decode_jwt_exp(authorization: str) -> datetime | None:
    token = authorization.strip().split(" ", 1)[-1]
    parts = token.split(".")
    if len(parts) != 3:
        return None
    try:
        payload = parts[1] + "=" * (-len(parts[1]) % 4)
        body = json.loads(base64.urlsafe_b64decode(payload).decode("utf-8"))
        exp = body.get("exp")
        if isinstance(exp, (int, float)):
            return datetime.fromtimestamp(exp, tz=timezone.utc)
    except Exception:
        return None
    return None


def replay_headers(captured: dict[str, str], authorization: str) -> dict[str, str]:
    result = {
        "Accept": "application/json, text/plain, */*",
        "Content-Type": "application/json; charset=UTF-8",
        "Origin": "https://bargheman.com",
        "Referer": "https://bargheman.com/",
        "Authorization": authorization,
    }
    lowered = {str(key).lower(): str(value) for key, value in captured.items()}
    for name in ("user-agent", "accept-language"):
        if lowered.get(name):
            result[name.title()] = lowered[name]
    return result


def walk_dicts(value: object) -> Iterable[dict[str, Any]]:
    if isinstance(value, dict):
        yield value
        for child in value.values():
            yield from walk_dicts(child)
    elif isinstance(value, list):
        for child in value:
            yield from walk_dicts(child)


def pointer_escape(value: str) -> str:
    return value.replace("~", "~0").replace("/", "~1")


def scalar_paths(value: object, pointer: str = "") -> list[tuple[str, object, str]]:
    rows: list[tuple[str, object, str]] = []
    if isinstance(value, dict):
        for key, child in value.items():
            child_pointer = f"{pointer}/{pointer_escape(str(key))}"
            if isinstance(child, (dict, list)):
                rows.extend(scalar_paths(child, child_pointer))
            else:
                rows.append((child_pointer, child, str(key)))
    elif isinstance(value, list):
        for index, child in enumerate(value):
            child_pointer = f"{pointer}/{index}"
            if isinstance(child, (dict, list)):
                rows.extend(scalar_paths(child, child_pointer))
            else:
                rows.append((child_pointer, child, str(index)))
    return rows


def body_scalar_values(value: object) -> set[str]:
    result: set[str] = set()
    for _, item, _ in scalar_paths(value):
        if item is None or isinstance(item, bool):
            continue
        text = str(item).strip()
        if text:
            result.add(text)
    return result


def candidate_bill_ids(record: dict[str, Any]) -> set[str]:
    ids: set[str] = set()
    for _, value, key in scalar_paths(record):
        digits = normalize_bill_id(value)
        if 8 <= len(digits) <= 30 and (BILL_KEY_RE.search(key) or str(value).strip() == digits):
            ids.add(digits)
    return ids


def choose_bill_record(
    bills_body: object,
    planned_body: object,
    explicit_bill_id: str = "",
) -> tuple[dict[str, Any], str]:
    planned_values = body_scalar_values(planned_body)
    explicit = normalize_bill_id(explicit_bill_id)
    best: tuple[int, dict[str, Any], str] | None = None
    for record in walk_dicts(bills_body):
        ids = candidate_bill_ids(record)
        if explicit and explicit not in ids:
            continue
        values = body_scalar_values(record)
        exact_matches = len(planned_values.intersection(values))
        matching_id = explicit or next(
            (bill_id for bill_id in ids if bill_id in normalize_bill_id(json.dumps(planned_body, ensure_ascii=False))),
            "",
        )
        scalar_count = len(list(scalar_paths(record)))
        score = (
            exact_matches * 10
            + (200 if matching_id else 0)
            + len(ids)
            - min(scalar_count, 1000)
        )
        if best is None or score > best[0]:
            best = (score, record, matching_id or (sorted(ids)[0] if ids else ""))
    if not best or best[0] <= 0:
        raise RuntimeError("Could not identify the selected bill inside GetBills response.")
    return best[1], best[2]


def value_key(value: object) -> tuple[str, str] | None:
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return (type(value).__name__, str(value))
    text = str(value).strip()
    if not text:
        return None
    return ("str", text)


def build_template(parsed_body: object, selected_record: dict[str, Any], selected_bill_id: str) -> object:
    paths_by_value: dict[tuple[str, str], list[tuple[str, str]]] = {}
    paths_by_key_value: dict[tuple[str, tuple[str, str]], list[str]] = {}
    for pointer, value, key in scalar_paths(selected_record):
        signature = value_key(value)
        if signature is None:
            continue
        normalized_key = re.sub(r"[^0-9a-zآ-ی]+", "", key.lower())
        paths_by_key_value.setdefault((normalized_key, signature), []).append(pointer)
        text = str(value).strip()
        if len(text) < 3 and not BILL_KEY_RE.search(key):
            continue
        paths_by_value.setdefault(signature, []).append((pointer, key))

    def transform(value: object, key_hint: str = "") -> object:
        if isinstance(value, dict):
            return {key: transform(child, str(key)) for key, child in value.items()}
        if isinstance(value, list):
            return [transform(child, key_hint) for child in value]
        signature = value_key(value)
        if signature is None:
            return value
        normalized_hint = re.sub(r"[^0-9a-zآ-ی]+", "", key_hint.lower())
        keyed_matches = paths_by_key_value.get((normalized_hint, signature), [])
        if keyed_matches:
            keyed_matches.sort(key=len)
            return f"{{{{bill:{keyed_matches[0]}}}}}"
        matches = paths_by_value.get(signature, [])
        if matches:
            matches.sort(key=lambda item: (0 if BILL_KEY_RE.search(item[1]) else 1, len(item[0])))
            return f"{{{{bill:{matches[0][0]}}}}}"
        if selected_bill_id and normalize_bill_id(value) == selected_bill_id:
            return "{{bill_id}}"
        if BILL_KEY_RE.search(key_hint) and selected_bill_id:
            digits = normalize_bill_id(value)
            if digits == selected_bill_id:
                return "{{bill_id}}"
        return value

    return transform(parsed_body)


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


def render_template_object(value: object, record: dict[str, Any], bill_id: str) -> object:
    if isinstance(value, dict):
        return {key: render_template_object(child, record, bill_id) for key, child in value.items()}
    if isinstance(value, list):
        return [render_template_object(child, record, bill_id) for child in value]
    if value == "{{bill_id}}":
        return bill_id
    if isinstance(value, str):
        match = PLACEHOLDER_RE.fullmatch(value)
        if match:
            return resolve_pointer(record, match.group(1))
    return value

def template_has_placeholder(value: object) -> bool:
    text = json.dumps(value, ensure_ascii=False) if not isinstance(value, str) else value
    return "{{bill:" in text or "{{bill_id}}" in text


def set_github_secret(repository: str, name: str, value: str) -> None:
    command = ["gh", "secret", "set", name, "--repo", repository]
    result = subprocess.run(
        command,
        input=value,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError(f"gh secret set {name} failed: {result.stderr.strip()}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Capture Bargheman token and request template.")
    parser.add_argument("--repository", default=DEFAULT_REPOSITORY)
    parser.add_argument("--bill-id", default="", help="Bill ID opened in the browser; normally inferred automatically.")
    parser.add_argument("--no-save-secrets", action="store_true")
    args = parser.parse_args()

    try:
        import requests
        from playwright.sync_api import sync_playwright
    except ImportError as exc:
        print(f"Missing dependency: {exc}", file=sys.stderr)
        print("Run: python -m pip install playwright requests && python -m playwright install chromium", file=sys.stderr)
        return 2

    if not args.no_save_secrets:
        if not shutil.which("gh"):
            print("GitHub CLI (gh) was not found.", file=sys.stderr)
            return 2
        auth = subprocess.run(["gh", "auth", "status"], capture_output=True, text=True, check=False)
        if auth.returncode != 0:
            print("GitHub CLI is not authenticated. Run: gh auth login", file=sys.stderr)
            return 2

    captured: dict[str, Any] = {
        "authorization": "",
        "planned_body": "",
        "planned_headers": {},
    }

    print("=" * 74)
    print("Bargheman one-time bootstrap")
    print("1. Chrome opens with a fresh profile.")
    print("2. Log in and enter the OTP.")
    print("3. Open one registered bill and its planned outage page.")
    print("4. When the result is visible, return here and press Enter.")
    print("No token, OTP, phone number, or bill data is written to disk.")
    print("=" * 74)

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(channel="chrome", headless=False)
        context = browser.new_context(locale="fa-IR", service_workers="block")
        page = context.new_page()
        cdp = context.new_cdp_session(page)
        cdp.send("Network.enable")

        def capture_request(params: dict[str, Any]) -> None:
            try:
                request = params.get("request") or {}
                url = str(request.get("url", ""))
                method = str(request.get("method", "")).upper()
                headers = {str(k): str(v) for k, v in (request.get("headers") or {}).items()}
                authorization = next((v for k, v in headers.items() if k.lower() == "authorization"), "")
                if authorization:
                    captured["authorization"] = authorization
                if PLANNED_PATH.lower() in url.lower() and method == "POST":
                    body = request.get("postData")
                    if isinstance(body, str) and body.strip():
                        captured["planned_body"] = body.strip()
                    captured["planned_headers"] = headers
            except BaseException:
                return

        def capture_extra(params: dict[str, Any]) -> None:
            try:
                headers = {str(k): str(v) for k, v in (params.get("headers") or {}).items()}
                authorization = next((v for k, v in headers.items() if k.lower() == "authorization"), "")
                if authorization:
                    captured["authorization"] = authorization
            except BaseException:
                return

        cdp.on("Network.requestWillBeSent", capture_request)
        cdp.on("Network.requestWillBeSentExtraInfo", capture_extra)
        page.goto(BARGHEMAN_URL, wait_until="domcontentloaded", timeout=90_000)
        input("Press Enter after Planned Outages is visible... ")
        page.wait_for_timeout(3000)
        context.close()
        browser.close()

    authorization = str(captured["authorization"]).strip()
    planned_raw = str(captured["planned_body"]).strip()
    if not authorization or not planned_raw:
        print("Authorization or PlannedBlackoutsReport body was not captured.", file=sys.stderr)
        return 3

    headers = replay_headers(dict(captured["planned_headers"]), authorization)
    session = requests.Session()
    session.trust_env = False
    bills_response = session.get(
        API_BASE + GET_BILLS_PATH,
        params={"_timeStamp": str(int(time.time() * 1000))},
        headers=headers,
        timeout=40,
    )
    bills_response.raise_for_status()
    bills_body = bills_response.json()

    try:
        planned_parsed: object = json.loads(planned_raw)
    except json.JSONDecodeError as exc:
        print(f"Planned request body is not JSON: {exc}", file=sys.stderr)
        return 4

    explicit_bill_id = normalize_bill_id(args.bill_id)
    try:
        selected_record, selected_bill_id = choose_bill_record(
            bills_body,
            planned_parsed,
            explicit_bill_id,
        )
    except RuntimeError:
        if not explicit_bill_id:
            explicit_bill_id = normalize_bill_id(input("Enter the bill ID you opened: "))
        selected_record, selected_bill_id = choose_bill_record(
            bills_body,
            planned_parsed,
            explicit_bill_id,
        )

    template_object = build_template(planned_parsed, selected_record, selected_bill_id)
    if not template_has_placeholder(template_object):
        print("Could not create a bill-aware request template.", file=sys.stderr)
        return 5
    template_text = json.dumps(template_object, ensure_ascii=False, separators=(",", ":"))

    # Verify the generated template still reproduces the captured request for the selected bill.
    rendered_verify = render_template_object(template_object, selected_record, selected_bill_id)
    rendered_verify_text = json.dumps(rendered_verify, ensure_ascii=False, separators=(",", ":"))
    verify_response = session.post(
        API_BASE + PLANNED_PATH,
        data=rendered_verify_text.encode("utf-8"),
        headers=headers,
        timeout=40,
    )
    if verify_response.status_code != 200:
        print(f"Generated template verification failed with HTTP {verify_response.status_code}.", file=sys.stderr)
        return 6

    # Rebuild the unrendered template after verification.
    template_object = build_template(planned_parsed, selected_record, selected_bill_id)
    template_text = json.dumps(template_object, ensure_ascii=False, separators=(",", ":"))

    expires = decode_jwt_exp(authorization)
    if args.no_save_secrets:
        print("Capture and verification succeeded. Secrets were not saved by request.")
    else:
        set_github_secret(args.repository, "BARGHEMAN_AUTHORIZATION", authorization)
        set_github_secret(args.repository, "BARGHEMAN_PLANNED_TEMPLATE", template_text)
        print(f"Saved BARGHEMAN_AUTHORIZATION and BARGHEMAN_PLANNED_TEMPLATE to {args.repository}.")
    if expires:
        print(f"JWT expiry (UTC): {expires.isoformat()}")
    print("Bootstrap completed. Chrome does not need to remain open.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
