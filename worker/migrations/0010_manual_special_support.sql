CREATE TABLE IF NOT EXISTS admin_operation_runs (
    operation_id TEXT PRIMARY KEY,
    operation_type TEXT NOT NULL,
    requested_by TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued',
    run_url TEXT NOT NULL DEFAULT '',
    error_text TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_admin_operation_runs_created
    ON admin_operation_runs (created_at DESC);

CREATE TABLE IF NOT EXISTS city_discovery_bulk_batches (
    batch_id TEXT PRIMARY KEY,
    payload_json TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    discovered_city_count INTEGER NOT NULL DEFAULT 0,
    clean_city_count INTEGER NOT NULL DEFAULT 0,
    conflict_count INTEGER NOT NULL DEFAULT 0,
    error_count INTEGER NOT NULL DEFAULT 0,
    summary_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    decided_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_city_discovery_bulk_status
    ON city_discovery_bulk_batches (status, created_at DESC);

CREATE TABLE IF NOT EXISTS special_lookup_flows (
    telegram_user_id TEXT PRIMARY KEY,
    chat_id TEXT NOT NULL,
    state TEXT NOT NULL,
    province TEXT NOT NULL DEFAULT '',
    county TEXT NOT NULL DEFAULT '',
    request_label TEXT NOT NULL DEFAULT '',
    bill_id_ciphertext TEXT NOT NULL DEFAULT '',
    bill_id_hash TEXT NOT NULL DEFAULT '',
    bill_id_last4 TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS special_lookup_requests (
    request_id TEXT PRIMARY KEY,
    telegram_user_id TEXT NOT NULL,
    chat_id TEXT NOT NULL,
    province TEXT NOT NULL,
    county TEXT NOT NULL,
    request_label TEXT NOT NULL,
    bill_id_ciphertext TEXT NOT NULL,
    bill_id_hash TEXT NOT NULL,
    bill_id_last4 TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    admin_note TEXT NOT NULL DEFAULT '',
    provider_key TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    decided_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_special_lookup_requests_status
    ON special_lookup_requests (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_special_lookup_requests_user
    ON special_lookup_requests (telegram_user_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_special_lookup_active_duplicate
    ON special_lookup_requests (telegram_user_id, bill_id_hash)
    WHERE status IN ('pending', 'approved', 'active');

CREATE TABLE IF NOT EXISTS support_payments (
    payment_id TEXT PRIMARY KEY,
    telegram_user_id TEXT NOT NULL,
    chat_id TEXT NOT NULL,
    method TEXT NOT NULL,
    amount INTEGER NOT NULL,
    currency TEXT NOT NULL,
    invoice_payload TEXT NOT NULL DEFAULT '',
    telegram_payment_charge_id TEXT NOT NULL DEFAULT '',
    provider_payment_charge_id TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'paid',
    created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_support_telegram_charge
    ON support_payments (telegram_payment_charge_id)
    WHERE telegram_payment_charge_id <> '';

CREATE TABLE IF NOT EXISTS support_flows (
    telegram_user_id TEXT PRIMARY KEY,
    chat_id TEXT NOT NULL,
    state TEXT NOT NULL,
    amount_text TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS support_tether_submissions (
    submission_id TEXT PRIMARY KEY,
    telegram_user_id TEXT NOT NULL,
    chat_id TEXT NOT NULL,
    network TEXT NOT NULL,
    amount_text TEXT NOT NULL,
    tx_hash TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    admin_note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    decided_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_support_tether_tx_hash
    ON support_tether_submissions (tx_hash);

CREATE INDEX IF NOT EXISTS idx_support_tether_status
    ON support_tether_submissions (status, created_at DESC);
