#!/usr/bin/env python3
"""Manually discover Maztozi source IDs using the locally installed Chrome.

Modes:
- pending: process cities explicitly requested by the Telegram administrator.
- all: enumerate every visible county in Maztozi and submit one bulk proposal.

No discovery runs automatically. GitHub Actions or a local administrator invokes this
script explicitly.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from typing import Any
from urllib.parse import parse_qs, urlsplit

import requests

MAZTOZI_URL = "https://khamooshi.maztozi.ir/"
TIMEOUT_SECONDS = 60


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


def worker_session() -> requests.Session:
    session = requests.Session()
    # The Maztozi/API traffic in this project intentionally ignores inherited
    # VPN/proxy variables. Keep Worker calls consistent as well.
    session.trust_env = False
    return session


def read_worker_config() -> dict[str, Any]:
    session = worker_session()
    urls = [
        f"{worker_base_url()}/fetch-config",
        f"{worker_base_url()}/admin/fetch-config",
    ]
    last_error: Exception | None = None
    for url in urls:
        try:
            response = session.get(url, headers=worker_headers(), timeout=TIMEOUT_SECONDS)
            response.raise_for_status()
            result = response.json()
            if not isinstance(result, dict) or not result.get("ok"):
                raise RuntimeError(f"Unexpected fetch-config response: {result!r}")
            return result
        except Exception as exc:  # noqa: BLE001 - we retry the compatibility alias.
            last_error = exc
    raise RuntimeError(f"Could not read Worker fetch configuration: {last_error}")


def post_result(
    city_key: str,
    city_label: str,
    source_ids: list[int] | None = None,
    error: str = "",
) -> None:
    session = worker_session()
    response = session.post(
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


def post_bulk_result(items: list[dict[str, Any]]) -> None:
    session = worker_session()
    response = session.post(
        f"{worker_base_url()}/admin/city-discovery-bulk-result",
        headers=worker_headers(),
        json={"cities": items},
        timeout=TIMEOUT_SECONDS,
    )
    response.raise_for_status()


def post_operation_result(operation_id: str, ok: bool, error: str = "") -> None:
    if not operation_id:
        return
    session = worker_session()
    try:
        response = session.post(
            f"{worker_base_url()}/admin/manual-operation-result",
            headers=worker_headers(),
            json={
                "operation_id": operation_id,
                "ok": ok,
                "error": error[:1000],
            },
            timeout=TIMEOUT_SECONDS,
        )
        response.raise_for_status()
    except Exception as exc:  # noqa: BLE001 - reporting must not hide the real result.
        print(f"Could not report manual operation result: {exc}", file=sys.stderr)


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


def click_county_trigger(page: Any) -> None:
    trigger_candidates = [
        page.locator("label", has_text="شهرستان")
        .locator("xpath=following-sibling::*")
        .locator("button")
        .first,
        page.get_by_role("button", name=re.compile("انتخاب شهرستان|شهرستان")),
        page.locator("button").filter(has_text="انتخاب شهرستان").first,
    ]
    for candidate in trigger_candidates:
        try:
            if candidate.count() and candidate.first.is_visible():
                candidate.first.click(timeout=5000)
                page.wait_for_timeout(700)
                return
        except Exception:
            continue
    raise RuntimeError("County selector was not found on Maztozi.")


def click_county(page: Any, city_label: str) -> None:
    click_county_trigger(page)
    option_candidates = [
        page.get_by_role("option", name=city_label, exact=True),
        page.locator("[cmdk-item]").filter(has_text=city_label),
        page.locator('[role="option"]').filter(has_text=city_label),
        page.get_by_text(city_label, exact=True),
        page.locator("button").filter(has_text=city_label),
    ]
    for candidate in option_candidates:
        try:
            count = candidate.count()
            for index in range(count - 1, -1, -1):
                item = candidate.nth(index)
                if item.is_visible() and item.inner_text().strip() == city_label:
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
            if "/api/outages" not in urlsplit(request.url).path.lower():
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


def list_all_county_labels(browser: Any) -> list[str]:
    context = browser.new_context(locale="fa-IR")
    page = context.new_page()
    try:
        page.goto(MAZTOZI_URL, wait_until="domcontentloaded", timeout=60000)
        page.wait_for_timeout(2500)
        click_county_trigger(page)
        labels: set[str] = set()
        stable_rounds = 0
        previous_count = -1
        for _ in range(80):
            values = page.evaluate(
                r"""
                () => {
                  const selectors = [
                    '[role="option"]',
                    '[cmdk-item]',
                    '[data-radix-collection-item]',
                    '[role="listbox"] button',
                    '[role="dialog"] button'
                  ];
                  const out = [];
                  for (const selector of selectors) {
                    for (const el of document.querySelectorAll(selector)) {
                      const rect = el.getBoundingClientRect();
                      const style = getComputedStyle(el);
                      if (rect.width <= 0 || rect.height <= 0 || style.visibility === 'hidden') continue;
                      const text = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
                      if (text) out.push(text);
                    }
                  }
                  const containers = [...document.querySelectorAll(
                    '[role="listbox"], [data-radix-popper-content-wrapper], [class*="overflow-y-auto"], [class*="max-h-"]'
                  )].filter(el => el.scrollHeight > el.clientHeight + 2);
                  for (const el of containers) {
                    el.scrollTop = Math.min(el.scrollTop + Math.max(180, el.clientHeight * 0.8), el.scrollHeight);
                  }
                  return out;
                }
                """
            )
            for raw in values:
                text = re.sub(r"\s+", " ", str(raw)).strip()
                if (
                    2 <= len(text) <= 50
                    and text not in {"انتخاب شهرستان", "شهرستان", "جستجو", "بستن"}
                    and not any(ch.isdigit() for ch in text)
                ):
                    labels.add(text)
            if len(labels) == previous_count:
                stable_rounds += 1
            else:
                stable_rounds = 0
                previous_count = len(labels)
            if stable_rounds >= 5:
                break
            page.wait_for_timeout(250)
        if not labels:
            raise RuntimeError("No county option was found in the Maztozi selector.")
        return sorted(labels)
    finally:
        context.close()


def launch_browser(playwright: Any) -> Any:
    channel = os.environ.get("PLAYWRIGHT_BROWSER_CHANNEL", "chrome").strip() or "chrome"
    try:
        return playwright.chromium.launch(channel=channel, headless=True)
    except Exception as exc:
        raise RuntimeError(
            "Playwright could not start the locally installed Google Chrome. "
            "Install/update Google Chrome; downloading Playwright Chromium is not required. "
            f"Original error: {exc}"
        ) from exc


def run_pending_discoveries(browser: Any) -> int:
    config = read_worker_config()
    pending = config.get("pending_discovery")
    if not isinstance(pending, list) or not pending:
        print("No pending city discovery request exists.")
        return 0
    processed = 0
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
        except Exception as exc:  # noqa: BLE001 - every item should produce a proposal result.
            error = str(exc)[:900]
            post_result(city_key, city_label, [], error)
            print(f"[discovery] {city_label} failed: {error}")
        processed += 1
    return processed


def run_all_discovery(browser: Any) -> int:
    labels = list_all_county_labels(browser)
    print(f"[discovery-all] Found {len(labels)} county labels.")
    items: list[dict[str, Any]] = []
    for index, label in enumerate(labels, start=1):
        print(f"[discovery-all] {index}/{len(labels)} {label}")
        try:
            ids = discover_one(browser, label)
            if not ids:
                raise RuntimeError("No /api/outages city value was captured.")
            items.append({"label": label, "source_city_ids": ids, "error": ""})
        except Exception as exc:  # noqa: BLE001 - retain partial results for admin review.
            items.append({"label": label, "source_city_ids": [], "error": str(exc)[:900]})
    post_bulk_result(items)
    return len(items)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=("pending", "all"), default="pending")
    parser.add_argument("--operation-id", default=os.environ.get("MANUAL_OPERATION_ID", ""))
    args = parser.parse_args()

    try:
        from playwright.sync_api import sync_playwright
    except ImportError as exc:
        raise RuntimeError(
            "Playwright Python package is not installed. Run: pip install playwright"
        ) from exc

    try:
        with sync_playwright() as playwright:
            browser = launch_browser(playwright)
            try:
                processed = (
                    run_all_discovery(browser)
                    if args.mode == "all"
                    else run_pending_discoveries(browser)
                )
            finally:
                browser.close()
        post_operation_result(args.operation_id, True)
        print(f"Discovery completed; processed={processed}.")
        return 0
    except Exception as exc:  # noqa: BLE001 - report to Worker before failing the workflow.
        post_operation_result(args.operation_id, False, str(exc))
        raise


if __name__ == "__main__":
    raise SystemExit(main())
