CREATE TABLE IF NOT EXISTS notification_batches (
    id TEXT PRIMARY KEY,
    chat_id TEXT NOT NULL,
    city_key TEXT NOT NULL,
    rows_json TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notification_batches_created_at
    ON notification_batches (created_at);
