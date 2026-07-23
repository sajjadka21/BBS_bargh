ALTER TABLE personal_outage_profiles
    ADD COLUMN reminder_minutes INTEGER NOT NULL DEFAULT 30
    CHECK (reminder_minutes IN (0, 30, 60));

CREATE TABLE personal_outage_change_notifications (
    event_key TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    telegram_user_id TEXT NOT NULL,
    city_key TEXT NOT NULL,
    snapshot_date TEXT NOT NULL,
    outage_key TEXT NOT NULL,
    change_type TEXT NOT NULL,
    sent_at TEXT NOT NULL
);

CREATE INDEX idx_personal_change_notifications_city_date
    ON personal_outage_change_notifications (city_key, snapshot_date);

CREATE INDEX idx_personal_change_notifications_user_sent
    ON personal_outage_change_notifications (telegram_user_id, sent_at);

CREATE TABLE personal_outage_reminders (
    profile_id TEXT NOT NULL,
    telegram_user_id TEXT NOT NULL,
    city_key TEXT NOT NULL,
    snapshot_date TEXT NOT NULL,
    outage_key TEXT NOT NULL,
    reminder_minutes INTEGER NOT NULL,
    sent_at TEXT NOT NULL,
    PRIMARY KEY (profile_id, snapshot_date, outage_key, reminder_minutes)
);

CREATE INDEX idx_personal_outage_reminders_user_sent
    ON personal_outage_reminders (telegram_user_id, sent_at);
