#!/usr/bin/env python3
"""Discover Maztozi source city IDs for admin-requested logical cities.

The Worker exposes pending city labels through /fetch-config. This script opens
Maztozi with a real browser, selects the county by its visible Persian label,
and records numeric `city` values sent to /api/outages. Results are posted back
to the Worker and must still be confirmed by the Telegram administrator.
"""

from __future__ import annotations

import json
import os
import re
from typing import Any
from urllib.parse import parse_qs, urlsplit

import requests

MAZTOZI_URL = "https://khamooshi.maztozi.ir/"
TIMEOUT_SECONDS = 45


def required_env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def worker_base_url() -> str:
    sync_url = required_env("WORKER_SYNC_URL").rstrip("/")
    return sync_url[:-5] if sync_url.endswith("/sync") else sync_url


def worker_headers() -> dict[str, str]:
    return {
        "Authorization": f"Bearer {required_env('WORKER_SYNC_SECRET')}",
        "Content-Type": "application/json; charset=utf-8",
    }


def read_worker_config() -> dict[str, Any]:
    response = requests.get(
        f"{worker_base_url()}/fetch-config",
        headers=worker_headers(),
        timeout=TIMEOUT_SECONDS,
    )
    response.raise_for_status()
    result = response.json()
    if not isinstance(result, dict) or not result.get("ok"):
        raise RuntimeError(f"Unexpected /fetch-config response: {result!r}")
    return result


def post_result(
    city_key: str,
    city_label: str,
    source_ids: list[int] | None = None,
    error: str = "",
) -> None:
    response = requests.post(
        f"{worker_base_url()}/admin/city-discovery-result",
        headers=worker_headers(),
        json={
            "city_key": city_key,
            "city_label": city_label,
            "source_city_ids": source_ids or [],
            "error": error,
        },
        timeout=TIMEOUT_SECONDS,
    )
    response.raise_for_status()


def extract_city_id(post_data: str | None) -> int | None:
    if not post_data:
        return None
    text = post_data.strip()
    try:
        parsed = json.loads(text)
        if isinstance(parsed, dict):
            value = parsed.get("city", parsed.get("city_id", parsed.get("cityId")))
            if str(value).isdigit():
                return int(value)
    except (ValueError, TypeError):
        pass

    params = parse_qs(text, keep_blank_values=True)
    for key in ("city", "city_id", "cityId"):
        values = params.get(key, [])
        if values and str(values[0]).isdigit():
            return int(values[0])
    match = re.search(r'(?:"?city(?:_id|Id)?"?\s*[:=]\s*"?)(\d+)', text)
    return int(match.group(1)) if match else None


def click_county(page: Any, city_label: str) -> None:
    # The current site is a Next.js page with a custom searchable selector.
    # Keep several selectors so harmless CSS changes do not immediately break it.
    trigger_candidates = [
        page.locator("label", has_text="شهرستان")
        .locator("xpath=following-sibling::*")
        .locator("button")
        .first,
        page.get_by_role("button", name=re.compile("انتخاب شهرستان|شهرستان")),
        page.locator("button").filter(has_text="انتخاب شهرستان").first,
    ]
    clicked = False
    for candidate in trigger_candidates:
        try:
            if candidate.count() and candidate.first.is_visible():
                candidate.first.click(timeout=5000)
                clicked = True
                break
        except Exception:
            continue
    if not clicked:
        raise RuntimeError("County selector was not found on Maztozi.")

    page.wait_for_timeout(700)
    option_candidates = [
        page.get_by_role("option", name=city_label, exact=True),
        page.get_by_text(city_label, exact=True),
        page.locator('[role="option"]').filter(has_text=city_label),
        page.locator("button").filter(has_text=city_label),
    ]
    for candidate in option_candidates:
        try:
            count = candidate.count()
            for index in range(count - 1, -1, -1):
                item = candidate.nth(index)
                if item.is_visible():
                    item.click(timeout=5000)
                    return
        except Exception:
            continue
    raise RuntimeError(f"County option was not found: {city_label}")


def discover_one(browser: Any, city_label: str) -> list[int]:
    context = browser.new_context(locale="fa-IR")
    page = context.new_page()
    captured: set[int] = set()

    def on_request(request: Any) -> None:
        try:
            path = urlsplit(request.url).path.lower()
            if "/api/outages" not in path:
                return
            city_id = extract_city_id(request.post_data)
            if city_id is not None:
                captured.add(city_id)
        except Exception:
            return

    page.on("request", on_request)
    try:
        page.goto(MAZTOZI_URL, wait_until="domcontentloaded", timeout=60000)
        page.wait_for_timeout(2500)
        click_county(page, city_label)
        page.wait_for_timeout(6500)
        return sorted(captured)
    finally:
        context.close()


def run_pending_discoveries() -> int:
    config = read_worker_config()
    pending = config.get("pending_discovery")
    if not isinstance(pending, list) or not pending:
        return 0

    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print(
            "Pending Maztozi city discovery exists, but Playwright is not installed. "
            "Run: pip install playwright && python -m playwright install chromium"
        )
        return 0

    processed = 0
    with sync_playwright() as playwright:
        try:
            browser = playwright.chromium.launch(channel="chrome", headless=True)
        except Exception:
            browser = playwright.chromium.launch(headless=True)
        try:
            for item in pending:
                if not isinstance(item, dict):
                    continue
                city_key = str(item.get("key", "")).strip()
                city_label = str(item.get("label", "")).strip()
                if not city_key or not city_label:
                    continue
                print(f"[discovery] Looking up Maztozi sources for {city_label}...")
                try:
                    ids = discover_one(browser, city_label)
                    if not ids:
                        raise RuntimeError(
                            "Maztozi did not send any /api/outages request after selecting the city."
                        )
                    post_result(city_key, city_label, ids)
                    print(f"[discovery] {city_label}: {ids}")
                except Exception as exc:
                    error = str(exc)[:900]
                    post_result(city_key, city_label, [], error)
                    print(f"[discovery] {city_label} failed: {error}")
                processed += 1
        finally:
            browser.close()
    return processed


if __name__ == "__main__":
    run_pending_discoveries()
