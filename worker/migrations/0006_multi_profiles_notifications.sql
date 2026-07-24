ALTER TABLE personalization_flows ADD COLUMN profile_id TEXT;
ALTER TABLE personalization_flows ADD COLUMN profile_label TEXT;
ALTER TABLE personalization_flows ADD COLUMN match_value TEXT;

CREATE TABLE personal_outage_profiles_v2 (
    profile_id TEXT PRIMARY KEY,
    telegram_user_id TEXT NOT NULL,
    profile_label TEXT NOT NULL,
    city_key TEXT NOT NULL,
    match_mode TEXT NOT NULL,
    match_value TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    CHECK (match_mode IN ('outage_number', 'address_keyword')),
    UNIQUE (telegram_user_id, city_key, match_mode, match_value)
);

INSERT INTO personal_outage_profiles_v2 (
    profile_id,
    telegram_user_id,
    profile_label,
    city_key,
    match_mode,
    match_value,
    created_at,
    updated_at
)
SELECT
    lower(hex(randomblob(16))),
    telegram_user_id,
    'خاموشی ۱',
    city_key,
    match_mode,
    match_value,
    created_at,
    updated_at
FROM personal_outage_profiles;

DROP TABLE personal_outage_profiles;
ALTER TABLE personal_outage_profiles_v2 RENAME TO personal_outage_profiles;

CREATE INDEX idx_personal_outage_profiles_user
    ON personal_outage_profiles (telegram_user_id, created_at);

CREATE INDEX idx_personal_outage_profiles_city
    ON personal_outage_profiles (city_key, match_mode);

CREATE TABLE personal_outage_notifications (
    profile_id TEXT NOT NULL,
    telegram_user_id TEXT NOT NULL,
    city_key TEXT NOT NULL,
    snapshot_date TEXT NOT NULL,
    matched_outage_keys TEXT NOT NULL DEFAULT '[]',
    sent_at TEXT NOT NULL,
    PRIMARY KEY (profile_id, snapshot_date)
);

CREATE INDEX idx_personal_outage_notifications_user_date
    ON personal_outage_notifications (telegram_user_id, snapshot_date);
