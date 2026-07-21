"""
Shared code between khamooshi_notify.py (the scheduled fetcher) and
khamooshi_bot.py (the always-on live Telegram bot). Contains: city config,
JSON helpers, all Telegram send/receive helpers, the button/search menu
logic, and city_search().

Both scripts import from this file so there's exactly one copy of the
button/search behaviour to keep in sync.
"""

import os
import json

import requests

# ----------------------------- CONFIG -----------------------------------
BASE_URL = "https://khamooshi.maztozi.ir/"

# Every city/area combo to track. area_id = "-1" means "همه‌ی امور برق"
# (no area filter -- the "-- انتخاب نمایید --" placeholder option).
CITIES = [
    {"key": "babolsar", "label": "بابلسر", "city_id": "990090351", "area_id": "85"},
    {"key": "sari",     "label": "ساری",   "city_id": "1",          "area_id": "-1"},
]

TELEGRAM_BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "PUT_YOUR_BOT_TOKEN_HERE")
TELEGRAM_CHAT_ID = os.environ.get("TELEGRAM_CHAT_ID", "PUT_YOUR_CHAT_ID_HERE")

# Telegram is blocked in Iran, so calls to api.telegram.org from a machine
# INSIDE Iran (e.g. your self-hosted Windows runner) must go through a local
# VPN/proxy app (V2rayN, Nekoray, Clash, ...). On a GitHub-HOSTED runner
# (ubuntu-latest etc.), the machine is already outside Iran, so no proxy is
# needed at all -- just leave TELEGRAM_PROXY unset and it's skipped.
TELEGRAM_PROXY = os.environ.get("TELEGRAM_PROXY", "")
TELEGRAM_PROXIES = {"http": TELEGRAM_PROXY, "https": TELEGRAM_PROXY} if TELEGRAM_PROXY else None

# Explicitly force NO proxy for the khamooshi site, overriding any
# system-wide HTTP_PROXY/HTTPS_PROXY env vars the VPN app might set.
DIRECT_PROXIES = {"http": None, "https": None}

TELEGRAM_API = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}"


# --------------------------- JSON HELPERS --------------------------------

def load_json(path, default):
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    return default


def save_json(path, obj):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)


def state_file_for(data_dir, city_key):
    return os.path.join(data_dir, f"state_{city_key}.json")


def city_by_key(key):
    for c in CITIES:
        if c["key"] == key:
            return c
    return None


# --------------------------- TELEGRAM SIDE --------------------------------

def tg_get_updates(offset, timeout=0):
    """timeout=0 -> return immediately (used by the scheduled fetcher).
    timeout=25 -> long-poll, holding the connection open until an update
    arrives or 25s pass (used by the always-on live bot -- far more
    efficient than looping with no delay)."""
    r = requests.get(f"{TELEGRAM_API}/getUpdates",
                      params={"offset": offset, "timeout": timeout},
                      proxies=TELEGRAM_PROXIES, timeout=timeout + 15)
    r.raise_for_status()
    return r.json().get("result", [])


def _chunk_lines(lines, max_len=3500):
    """Group a list of text blocks into chunks whose total length stays
    under max_len, without ever splitting a block (so no HTML tag is cut
    in half)."""
    chunks = []
    current = []
    current_len = 0
    for line in lines:
        if current and current_len + len(line) > max_len:
            chunks.append("\n".join(current))
            current = []
            current_len = 0
        current.append(line)
        current_len += len(line)
    if current:
        chunks.append("\n".join(current))
    return chunks or [""]


def city_menu_keyboard():
    """Persistent bottom keyboard: one button per city. Stays visible at
    all times (like a normal Telegram bot menu), not tied to one message."""
    row = [c["label"] for c in CITIES]
    return {"keyboard": [row], "resize_keyboard": True, "is_persistent": True}


def city_action_keyboard(city_key=None):
    """After picking a city: search / show-everything / back -- also a
    persistent bottom keyboard."""
    return {
        "keyboard": [["🔍 جستجو", "📋 نمایش همه"], ["⬅️ بازگشت"]],
        "resize_keyboard": True,
        "is_persistent": True,
    }


def city_by_label(label):
    for c in CITIES:
        if c["label"] == label:
            return c
    return None


def tg_send_message(chat_id, lines, keyboard=None):
    """`lines` is a list of text blocks (e.g. one per outage row). Telegram
    caps messages at ~4096 chars, so we group blocks into chunks that stay
    under that limit. Only the LAST chunk gets any inline keyboard attached."""
    if isinstance(lines, str):
        lines = [lines]
    chunks = _chunk_lines(lines)
    for i, chunk in enumerate(chunks):
        is_last = (i == len(chunks) - 1)
        data = {"chat_id": chat_id, "text": chunk, "parse_mode": "HTML"}
        if keyboard and is_last:
            data["reply_markup"] = json.dumps(keyboard)
        r = requests.post(f"{TELEGRAM_API}/sendMessage", data=data, proxies=TELEGRAM_PROXIES, timeout=20)
        if not r.ok:
            print("sendMessage failed:", r.status_code, r.text)


def tg_send_each_row_separately(chat_id, rows, city_label):
    """Send every outage row as its OWN message (one block = one message)."""
    if not rows:
        tg_send_message(chat_id, [f"فعلاً هیچ خاموشی ثبت‌شده‌ای برای <b>{city_label}</b> نداریم."])
        return
    for r in rows:
        block = f"🏙 {city_label}\n📍 {r['address']}\n🕒 {r['from']} تا {r['to']} — {r['date']} ({r['type']})"
        tg_send_message(chat_id, [block])


def city_search(data_dir, city_key, query):
    """Case-insensitive substring search over ONE city's already-fetched
    state file (address field). Returns a list of matching rows."""
    query = query.strip().lower()
    if not query:
        return []
    rows = load_json(state_file_for(data_dir, city_key), [])
    return [r for r in rows if query in r["address"].lower()]


def handle_one_update(update, data_dir, state):
    """Handle a single Telegram update (a plain text message -- reply
    keyboards don't send callback_query, they send normal messages with the
    button's label as the text). `state` is {chat_id: {"city": key,
    "awaiting_search": bool}}, mutated in place to remember, per chat, which
    city is selected and whether we're waiting for a search keyword."""

    if "message" not in update:
        return
    msg = update["message"]
    chat_id = str(msg["chat"]["id"])
    text = (msg.get("text") or "").strip()
    if not text:
        return

    chat_state = state.get(chat_id, {})

    # "/start" or the back button -> reset to the main city menu
    if text in ("/start", "⬅️ بازگشت"):
        state[chat_id] = {}
        tg_send_message(chat_id, ["یه شهر رو انتخاب کن:"], keyboard=city_menu_keyboard())
        return

    # A city name was tapped -> remember it, show the search/all submenu
    city = city_by_label(text)
    if city:
        state[chat_id] = {"city": city["key"], "awaiting_search": False}
        tg_send_message(chat_id, [f"برای <b>{city['label']}</b> چیکار کنم؟"],
                         keyboard=city_action_keyboard())
        return

    current_city = city_by_key(chat_state.get("city"))

    if text == "📋 نمایش همه":
        if not current_city:
            tg_send_message(chat_id, ["اول یه شهر رو از منو انتخاب کن."], keyboard=city_menu_keyboard())
            return
        rows = load_json(state_file_for(data_dir, current_city["key"]), [])
        tg_send_each_row_separately(chat_id, rows, current_city["label"])
        tg_send_message(chat_id, ["کار دیگه‌ای هست؟"], keyboard=city_action_keyboard())
        return

    if text == "🔍 جستجو":
        if not current_city:
            tg_send_message(chat_id, ["اول یه شهر رو از منو انتخاب کن."], keyboard=city_menu_keyboard())
            return
        chat_state["awaiting_search"] = True
        state[chat_id] = chat_state
        tg_send_message(chat_id, [f"🔍 کلمه‌ای که توی آدرس‌های <b>{current_city['label']}</b> دنبالش می‌گردی رو بفرست."])
        return

    if chat_state.get("awaiting_search") and current_city:
        matches = city_search(data_dir, current_city["key"], text)
        chat_state["awaiting_search"] = False
        state[chat_id] = chat_state
        if not matches:
            tg_send_message(chat_id, [f"🔍 برای «{text}» توی <b>{current_city['label']}</b> چیزی پیدا نشد."],
                             keyboard=city_action_keyboard())
        else:
            for r in matches:
                block = (f"🏙 {current_city['label']}\n📍 {r['address']}\n"
                         f"🕒 {r['from']} تا {r['to']} — {r['date']} ({r['type']})")
                tg_send_message(chat_id, [block])
            tg_send_message(chat_id, ["کار دیگه‌ای هست؟"], keyboard=city_action_keyboard())
        return

    # Anything else unrecognized -> show the main menu again
    tg_send_message(chat_id, ["یکی از دکمه‌های زیر رو انتخاب کن:"], keyboard=city_menu_keyboard())
