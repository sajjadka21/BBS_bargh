ALTER TABLE outages
    ADD COLUMN outage_numbers TEXT NOT NULL DEFAULT '[]';

ALTER TABLE outages
    ADD COLUMN source_city_ids TEXT NOT NULL DEFAULT '[]';

CREATE TABLE IF NOT EXISTS city_sources (
    logical_city_key TEXT NOT NULL,
    logical_city_label TEXT NOT NULL,
    source_city_id INTEGER NOT NULL,
    source_city_label TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (logical_city_key, source_city_id)
);

CREATE INDEX IF NOT EXISTS idx_city_sources_active
    ON city_sources (logical_city_key, is_active);

INSERT INTO city_sources
    (logical_city_key, logical_city_label, source_city_id, source_city_label)
VALUES
    ('babol', 'بابل', 13, NULL),
    ('babol', 'بابل', 25, NULL),
    ('babol', 'بابل', 61, NULL),
    ('babol', 'بابل', 62, NULL),
    ('babol', 'بابل', 64, NULL),
    ('babol', 'بابل', 65, NULL),
    ('babol', 'بابل', 66, NULL),
    ('babol', 'بابل', 67, NULL),
    ('babol', 'بابل', 68, NULL),
    ('babolsar', 'بابلسر', 53, NULL),
    ('babolsar', 'بابلسر', 85, NULL),
    ('sari', 'ساری', 2, NULL),
    ('sari', 'ساری', 3, NULL),
    ('sari', 'ساری', 4, NULL),
    ('sari', 'ساری', 5, NULL),
    ('sari', 'ساری', 6, NULL),
    ('sari', 'ساری', 87, NULL),
    ('qaemshahr', 'قائم‌شهر', 31, NULL),
    ('qaemshahr', 'قائم‌شهر', 32, NULL),
    ('qaemshahr', 'قائم‌شهر', 34, NULL)
ON CONFLICT(logical_city_key, source_city_id) DO UPDATE SET
    logical_city_label = excluded.logical_city_label,
    source_city_label = excluded.source_city_label,
    is_active = 1,
    updated_at = CURRENT_TIMESTAMP;
