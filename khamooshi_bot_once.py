#!/usr/bin/env python3
"""
khamooshi_bot_once.py -- ONE bot cycle, meant for GitHub-HOSTED runners
=========================================================================

Unlike khamooshi_bot.py (an infinite loop meant to run continuously on your
own machine), this script does exactly ONE getUpdates poll, answers
whatever's there, saves state, and exits. It's meant to be triggered very
frequently (e.g. every 5 minutes) by a GitHub Actions schedule running on a
normal GitHub-hosted runner (ubuntu-latest) -- NOT your self-hosted runner.

Why this works without a VPN/proxy: api.telegram.org is only blocked for
connections originating INSIDE Iran. A GitHub-hosted runner is outside Iran,
so it reaches Telegram directly, no proxy needed. (This script never touches
khamooshi.maztozi.ir at all -- that's only the fetcher's job.)

Latency: since GitHub Actions can't run a job forever, the best we can do is
poll every few minutes. So button/search replies take up to ~5 minutes
(sometimes a bit more if GitHub's scheduler is under load) -- not instant,
but no personal machine or VPN required.

Requirements
------------
    pip install requests --break-system-packages
"""

import os

from khamooshi_common import load_json, save_json, tg_get_updates, handle_one_update

DATA_DIR = os.path.dirname(__file__)
OFFSET_FILE = os.path.join(DATA_DIR, "offset.json")
PENDING_FILE = os.path.join(DATA_DIR, "pending_search.json")


def main():
    offset = load_json(OFFSET_FILE, {"offset": 0})["offset"]
    pending = load_json(PENDING_FILE, {})

    # A short long-poll (not 0) so a button pressed right as this job starts
    # still gets caught, without holding the GitHub Actions runner open long.
    updates = tg_get_updates(offset, timeout=20)

    for update in updates:
        offset = update["update_id"] + 1
        try:
            handle_one_update(update, DATA_DIR, pending)
        except Exception as e:
            print("Error handling update:", e)

    save_json(OFFSET_FILE, {"offset": offset})
    save_json(PENDING_FILE, pending)
    print(f"Processed {len(updates)} update(s).")


if __name__ == "__main__":
    main()
