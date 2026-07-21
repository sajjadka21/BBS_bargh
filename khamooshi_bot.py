#!/usr/bin/env python3
"""
khamooshi_bot.py -- the ALWAYS-ON live Telegram bot (instant responses)
=========================================================================

Run this continuously (leave the terminal window open, or set it up as a
background task) on your laptop. Unlike khamooshi_notify.py (the scheduled
fetcher on GitHub Actions), this script never stops: it long-polls Telegram
for button presses / search replies and answers them within a second or two,
using whatever outage data is currently on disk in this same folder
(state_babolsar.json, state_sari.json).

IMPORTANT -- run this from its OWN separate folder/clone of the repo, NOT
from the GitHub Actions self-hosted runner's working directory. That folder
gets `git clean`-ed on every scheduled run, which would wipe out this
script's on-disk bookkeeping (offset.json / pending_search.json) if they
lived there. Keep this script + its own git clone somewhere like:

    C:\\khamooshi-bot\\  (a plain `git clone` of the same repo)

Every loop iteration this script does a quick `git pull` first, so it always
has the latest state_*.json that the fetcher last committed -- without ever
touching the fetcher's own working folder.

Requirements
------------
    pip install requests PySocks --break-system-packages
"""

import os
import time
import subprocess

from khamooshi_common import load_json, save_json, tg_get_updates, handle_one_update

DATA_DIR = os.path.dirname(__file__)
OFFSET_FILE = os.path.join(DATA_DIR, "offset.json")
PENDING_FILE = os.path.join(DATA_DIR, "pending_search.json")

# How often (seconds) to `git pull` for fresh outage data. Long-polling
# itself already blocks for up to LONG_POLL_TIMEOUT seconds waiting for a
# Telegram update, so this just paces how often we check for new commits
# from the fetcher in between.
GIT_PULL_EVERY_SECONDS = 60
LONG_POLL_TIMEOUT = 25


def git_pull_quiet():
    try:
        subprocess.run(
            ["git", "pull", "--quiet"],
            cwd=DATA_DIR, timeout=20,
            capture_output=True, text=True,
        )
    except Exception as e:
        print("git pull failed (continuing with local files):", e)


def main():
    print("khamooshi_bot: starting long-polling loop. Ctrl+C to stop.")
    offset = load_json(OFFSET_FILE, {"offset": 0})["offset"]
    pending = load_json(PENDING_FILE, {})
    last_pull = 0.0

    while True:
        now = time.time()
        if now - last_pull >= GIT_PULL_EVERY_SECONDS:
            git_pull_quiet()
            last_pull = now

        try:
            updates = tg_get_updates(offset, timeout=LONG_POLL_TIMEOUT)
        except Exception as e:
            print("getUpdates failed, retrying in 5s:", e)
            time.sleep(5)
            continue

        for update in updates:
            offset = update["update_id"] + 1
            try:
                handle_one_update(update, DATA_DIR, pending)
            except Exception as e:
                print("Error handling update:", e)

        if updates:
            save_json(OFFSET_FILE, {"offset": offset})
            save_json(PENDING_FILE, pending)


if __name__ == "__main__":
    main()
