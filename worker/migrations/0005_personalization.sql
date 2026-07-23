CREATE TABLE IF NOT EXISTS telegram_users (
    telegram_user_id TEXT PRIMARY KEY,
    chat_id TEXT NOT NULL,
    username TEXT NOT NULL DEFAULT '',
    first_name TEXT NOT NULL DEFAULT '',
    last_name TEXT NOT NULL DEFAULT '',
    is_authorized INTEGER NOT NULL DEFAULT 0,
    authorized_at TEXT,
    revoked_at TEXT,
    last_seen_at TEXT NOT NULL,
    failed_password_attempts INTEGER NOT NULL DEFAULT 0,
    password_window_started_at TEXT,
    locked_until TEXT
);

CREATE INDEX IF NOT EXISTS idx_telegram_users_authorized
    ON telegram_users (is_authorized, last_seen_at);

CREATE TABLE IF NOT EXISTS personalization_flows (
    telegram_user_id TEXT PRIMARY KEY,
    chat_id TEXT NOT NULL,
    state TEXT NOT NULL,
    city_key TEXT,
    match_mode TEXT,
    updated_at TEXT NOT NULL,
    CHECK (match_mode IS NULL OR match_mode IN ('outage_number', 'address_keyword'))
);

CREATE TABLE IF NOT EXISTS personal_outage_profiles (
    telegram_user_id TEXT PRIMARY KEY,
    city_key TEXT NOT NULL,
    match_mode TEXT NOT NULL,
    match_value TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    CHECK (match_mode IN ('outage_number', 'address_keyword'))
);

CREATE INDEX IF NOT EXISTS idx_personal_outage_profiles_city
    ON personal_outage_profiles (city_key, match_mode);
