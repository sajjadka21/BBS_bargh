-- Turn approved special bill requests into a working Bargheman-backed service.
-- Bill identifiers remain encrypted in special_lookup_requests.

ALTER TABLE special_lookup_requests
    ADD COLUMN reminder_minutes INTEGER NOT NULL DEFAULT 60;

ALTER TABLE special_lookup_requests
    ADD COLUMN last_fetched_at TEXT;

ALTER TABLE special_lookup_requests
    ADD COLUMN last_fetch_status TEXT NOT NULL DEFAULT 'never';

ALTER TABLE special_lookup_requests
    ADD COLUMN last_error TEXT NOT NULL DEFAULT '';

UPDATE special_lookup_requests
SET status = 'active',
    updated_at = datetime('now')
WHERE status = 'approved';

CREATE TABLE IF NOT EXISTS special_outage_results (
    request_id TEXT NOT NULL,
    outage_key TEXT NOT NULL,
    outage_date TEXT NOT NULL DEFAULT '',
    from_time TEXT NOT NULL DEFAULT '',
    to_time TEXT NOT NULL DEFAULT '',
    start_at_utc TEXT NOT NULL DEFAULT '',
    address TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    provider_outage_id TEXT NOT NULL DEFAULT '',
    fetched_at TEXT NOT NULL,
    PRIMARY KEY (request_id, outage_key),
    FOREIGN KEY (request_id) REFERENCES special_lookup_requests(request_id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_special_outage_results_start
    ON special_outage_results (start_at_utc, request_id);

CREATE TABLE IF NOT EXISTS special_outage_reminders (
    request_id TEXT NOT NULL,
    outage_key TEXT NOT NULL,
    reminder_minutes INTEGER NOT NULL,
    sent_at TEXT NOT NULL,
    PRIMARY KEY (request_id, outage_key, reminder_minutes),
    FOREIGN KEY (request_id) REFERENCES special_lookup_requests(request_id)
        ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS special_outage_change_events (
    event_key TEXT PRIMARY KEY,
    request_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    sent_at TEXT NOT NULL,
    FOREIGN KEY (request_id) REFERENCES special_lookup_requests(request_id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_special_outage_change_request
    ON special_outage_change_events (request_id, sent_at DESC);

CREATE TABLE IF NOT EXISTS provider_health (
    provider_key TEXT PRIMARY KEY,
    status TEXT NOT NULL,
    detail TEXT NOT NULL DEFAULT '',
    token_expires_at TEXT,
    checked_at TEXT NOT NULL,
    last_admin_notification_key TEXT NOT NULL DEFAULT '',
    last_admin_notified_at TEXT
);
