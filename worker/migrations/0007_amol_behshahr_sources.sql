INSERT INTO city_sources
    (logical_city_key, logical_city_label, source_city_id, source_city_label)
VALUES
    ('amol', 'آمل', 71, NULL),
    ('amol', 'آمل', 72, NULL),
    ('amol', 'آمل', 73, NULL),
    ('amol', 'آمل', 74, NULL),
    ('amol', 'آمل', 75, NULL),
    ('amol', 'آمل', 76, NULL),
    ('behshahr', 'بهشهر', 22, NULL),
    ('behshahr', 'بهشهر', 23, NULL),
    ('behshahr', 'بهشهر', 26, NULL)
ON CONFLICT(logical_city_key, source_city_id) DO UPDATE SET
    logical_city_label = excluded.logical_city_label,
    source_city_label = excluded.source_city_label,
    is_active = 1,
    updated_at = CURRENT_TIMESTAMP;
