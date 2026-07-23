ALTER TABLE city_sync_status
    ADD COLUMN active_date TEXT NOT NULL DEFAULT '';

ALTER TABLE city_sync_status
    ADD COLUMN last_decision TEXT NOT NULL DEFAULT '';

ALTER TABLE city_sync_status
    ADD COLUMN last_snapshot_date TEXT NOT NULL DEFAULT '';

UPDATE city_sync_status
SET active_date = COALESCE(
    (
        SELECT MAX(outage_date)
        FROM outages
        WHERE outages.city_key = city_sync_status.city_key
          AND outage_date <> ''
    ),
    ''
)
WHERE active_date = '';

CREATE TABLE IF NOT EXISTS pending_city_snapshots (
    city_key TEXT PRIMARY KEY,
    snapshot_date TEXT NOT NULL,
    fingerprint TEXT NOT NULL,
    rows_json TEXT NOT NULL,
    row_count INTEGER NOT NULL,
    consecutive_count INTEGER NOT NULL DEFAULT 1,
    first_seen_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    fetched_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pending_city_snapshots_date
    ON pending_city_snapshots (snapshot_date);

CREATE TABLE IF NOT EXISTS outage_archive (
    city_key TEXT NOT NULL,
    snapshot_date TEXT NOT NULL,
    outage_key TEXT NOT NULL,
    address TEXT NOT NULL,
    outage_type TEXT NOT NULL DEFAULT '',
    from_time TEXT NOT NULL DEFAULT '',
    to_time TEXT NOT NULL DEFAULT '',
    outage_date TEXT NOT NULL DEFAULT '',
    outage_numbers TEXT NOT NULL DEFAULT '[]',
    source_city_ids TEXT NOT NULL DEFAULT '[]',
    fetched_at TEXT NOT NULL,
    archived_at TEXT NOT NULL,
    PRIMARY KEY (city_key, snapshot_date, outage_key)
);

CREATE INDEX IF NOT EXISTS idx_outage_archive_city_date
    ON outage_archive (city_key, snapshot_date);

CREATE TABLE IF NOT EXISTS outage_number_observations (
    city_key TEXT NOT NULL,
    outage_date TEXT NOT NULL,
    normalized_address TEXT NOT NULL,
    original_address TEXT NOT NULL,
    outage_number TEXT NOT NULL,
    source_city_id TEXT NOT NULL DEFAULT '',
    outage_time TEXT NOT NULL DEFAULT '',
    outage_type TEXT NOT NULL DEFAULT '',
    registration_date TEXT NOT NULL DEFAULT '',
    registerer TEXT NOT NULL DEFAULT '',
    first_seen_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    seen_count INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (
        city_key,
        outage_date,
        normalized_address,
        outage_number,
        source_city_id,
        outage_time
    )
);

CREATE INDEX IF NOT EXISTS idx_outage_number_observations_address
    ON outage_number_observations (
        city_key,
        outage_date,
        normalized_address
    );

CREATE INDEX IF NOT EXISTS idx_outage_number_observations_number
    ON outage_number_observations (outage_number, outage_date);
