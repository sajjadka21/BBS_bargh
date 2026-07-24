-- Maztozi is an incremental/delta feed.
-- Pending snapshots created by the former complete-snapshot policy are derived
-- cache data and must be rebuilt through additive fetches.

DELETE FROM pending_city_snapshots;

UPDATE city_sync_status
SET last_decision = 'delta_policy_migrated',
    updated_at = datetime('now')
WHERE last_decision LIKE 'pending_%';
