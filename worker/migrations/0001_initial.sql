CREATE TABLE IF NOT EXISTS outages (
    city_key TEXT NOT NULL,
    outage_key TEXT NOT NULL,
    address TEXT NOT NULL,
    outage_type TEXT NOT NULL DEFAULT '',
    from_time TEXT NOT NULL DEFAULT '',
    to_time TEXT NOT NULL DEFAULT '',
    outage_date TEXT NOT NULL DEFAULT '',
    fetched_at TEXT NOT NULL,
    PRIMARY KEY (city_key, outage_key)
);

CREATE INDEX IF NOT EXISTS idx_outages_city
    ON outages (city_key);

CREATE INDEX IF NOT EXISTS idx_outages_city_address
    ON outages (city_key, address);

CREATE TABLE IF NOT EXISTS chat_sessions (
    chat_id TEXT PRIMARY KEY,
    selected_city TEXT,
    awaiting_search INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS processed_updates (
    update_id INTEGER PRIMARY KEY,
    processed_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS city_sync_status (
    city_key TEXT PRIMARY KEY,
    fetched_at TEXT NOT NULL,
    row_count INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL
);
