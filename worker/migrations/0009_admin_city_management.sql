CREATE TABLE IF NOT EXISTS managed_cities (
    city_key TEXT PRIMARY KEY,
    city_label TEXT NOT NULL UNIQUE,
    is_active INTEGER NOT NULL DEFAULT 1,
    discovery_status TEXT NOT NULL DEFAULT 'ready',
    discovery_requested_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO managed_cities (city_key, city_label, is_active, discovery_status)
SELECT logical_city_key, MAX(logical_city_label), MAX(is_active), 'ready'
FROM city_sources
GROUP BY logical_city_key
ON CONFLICT(city_key) DO UPDATE SET
    city_label = excluded.city_label,
    is_active = excluded.is_active,
    updated_at = CURRENT_TIMESTAMP;

CREATE TABLE IF NOT EXISTS admin_flows (
    telegram_user_id TEXT PRIMARY KEY,
    chat_id TEXT NOT NULL,
    state TEXT NOT NULL,
    city_key TEXT,
    city_label TEXT,
    source_ids_json TEXT NOT NULL DEFAULT '[]',
    mode TEXT,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS city_source_proposals (
    proposal_id TEXT PRIMARY KEY,
    city_key TEXT NOT NULL,
    city_label TEXT NOT NULL,
    source_ids_json TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    error_text TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    decided_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_managed_cities_active
    ON managed_cities (is_active, city_label);

CREATE INDEX IF NOT EXISTS idx_city_source_proposals_status
    ON city_source_proposals (status, created_at);

CREATE INDEX IF NOT EXISTS idx_city_sources_source_active
    ON city_sources (source_city_id, is_active);
