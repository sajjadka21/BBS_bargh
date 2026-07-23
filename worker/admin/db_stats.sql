SELECT 'outages' AS table_name, COUNT(*) AS row_count FROM outages
UNION ALL SELECT 'city_sync_status', COUNT(*) FROM city_sync_status
UNION ALL SELECT 'pending_city_snapshots', COUNT(*) FROM pending_city_snapshots
UNION ALL SELECT 'outage_archive', COUNT(*) FROM outage_archive
UNION ALL SELECT 'outage_number_observations', COUNT(*) FROM outage_number_observations
UNION ALL SELECT 'telegram_users', COUNT(*) FROM telegram_users
UNION ALL SELECT 'personal_outage_profiles', COUNT(*) FROM personal_outage_profiles
UNION ALL SELECT 'personal_outage_notifications', COUNT(*) FROM personal_outage_notifications
UNION ALL SELECT 'personal_outage_change_notifications', COUNT(*) FROM personal_outage_change_notifications
UNION ALL SELECT 'personal_outage_reminders', COUNT(*) FROM personal_outage_reminders
UNION ALL SELECT 'city_sources', COUNT(*) FROM city_sources
UNION ALL SELECT 'managed_cities', COUNT(*) FROM managed_cities
UNION ALL SELECT 'city_source_proposals', COUNT(*) FROM city_source_proposals
UNION ALL SELECT 'admin_flows', COUNT(*) FROM admin_flows;
