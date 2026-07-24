-- Stop exposing Maztozi's long provider outage_number and rebuild the active
-- values from the short numeric code at the beginning of each address.
-- Existing user/auth/profile data is preserved.

UPDATE outages
SET outage_numbers = '[]'
WHERE outage_numbers <> '[]';

-- Previous observations contain the long provider-generated identifiers and
-- must not be mixed with the new address block-code experiment.
DELETE FROM outage_number_observations;

-- Pending snapshots may still contain old long identifiers. They are derived
-- cache data and will be recreated safely by the next fetch when needed.
DELETE FROM pending_city_snapshots;
