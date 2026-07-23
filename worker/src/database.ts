import { normalizePersianText } from "./persian";
import type {
  ChatSession,
  CitySyncStatus,
  D1Database,
  NormalizedOutage,
  NormalizedOutageObservation,
  NotificationBatch,
  OutageRow,
  PendingCitySnapshot,
} from "./types";

interface NotificationBatchRecord {
  id: string;
  chat_id: string;
  city_key: string;
  rows_json: string;
  created_at: string;
}

const OUTAGE_COLUMNS =
  "city_key, outage_key, address, outage_type, from_time, to_time, " +
  "outage_date, outage_numbers, source_city_ids, fetched_at";

function outageInsertStatement(
  db: D1Database,
  row: NormalizedOutage,
  upsert: boolean,
) {
  const conflictClause = upsert
    ? " ON CONFLICT(city_key, outage_key) DO UPDATE SET " +
      "address = excluded.address, " +
      "outage_type = excluded.outage_type, " +
      "from_time = excluded.from_time, " +
      "to_time = excluded.to_time, " +
      "outage_date = excluded.outage_date, " +
      "outage_numbers = excluded.outage_numbers, " +
      "source_city_ids = excluded.source_city_ids, " +
      "fetched_at = excluded.fetched_at"
    : "";

  return db
    .prepare(
      "INSERT INTO outages " +
        "(city_key, outage_key, address, outage_type, from_time, to_time, " +
        "outage_date, outage_numbers, source_city_ids, fetched_at) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)" +
        conflictClause,
    )
    .bind(
      row.cityKey,
      row.outageKey,
      row.address,
      row.outageType,
      row.fromTime,
      row.toTime,
      row.outageDate,
      JSON.stringify(row.outageNumbers),
      JSON.stringify(row.sourceCityIds),
      row.fetchedAt,
    );
}

function statusUpsertStatement(
  db: D1Database,
  cityKey: string,
  fetchedAt: string,
  rowCount: number,
  activeDate: string,
  decision: string,
  snapshotDate: string,
) {
  return db
    .prepare(
      "INSERT INTO city_sync_status " +
        "(city_key, fetched_at, row_count, updated_at, active_date, " +
        "last_decision, last_snapshot_date) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?) " +
        "ON CONFLICT(city_key) DO UPDATE SET " +
        "fetched_at = excluded.fetched_at, " +
        "row_count = excluded.row_count, " +
        "updated_at = excluded.updated_at, " +
        "active_date = excluded.active_date, " +
        "last_decision = excluded.last_decision, " +
        "last_snapshot_date = excluded.last_snapshot_date",
    )
    .bind(
      cityKey,
      fetchedAt,
      rowCount,
      new Date().toISOString(),
      activeDate,
      decision,
      snapshotDate,
    );
}

function cleanupStatements(db: D1Database) {
  return [
    db.prepare(
      "DELETE FROM processed_updates " +
        "WHERE processed_at < datetime('now', '-30 days')",
    ),
    db.prepare(
      "DELETE FROM notification_batches " +
        "WHERE julianday(created_at) < julianday('now', '-14 days')",
    ),
  ];
}

export async function claimUpdate(
  db: D1Database,
  updateId: number,
): Promise<boolean> {
  const result = await db
    .prepare(
      "INSERT OR IGNORE INTO processed_updates (update_id, processed_at) VALUES (?, ?)",
    )
    .bind(updateId, new Date().toISOString())
    .run();
  return (result.meta.changes ?? 0) > 0;
}

export async function releaseUpdate(
  db: D1Database,
  updateId: number,
): Promise<void> {
  await db
    .prepare("DELETE FROM processed_updates WHERE update_id = ?")
    .bind(updateId)
    .run();
}

export async function getChatSession(
  db: D1Database,
  chatId: string,
): Promise<ChatSession | null> {
  return db
    .prepare(
      "SELECT chat_id, selected_city, awaiting_search, updated_at " +
        "FROM chat_sessions WHERE chat_id = ?",
    )
    .bind(chatId)
    .first<ChatSession>();
}

export async function setChatSession(
  db: D1Database,
  chatId: string,
  selectedCity: string | null,
  awaitingSearch: boolean,
): Promise<void> {
  await db
    .prepare(
      "INSERT INTO chat_sessions " +
        "(chat_id, selected_city, awaiting_search, updated_at) " +
        "VALUES (?, ?, ?, ?) " +
        "ON CONFLICT(chat_id) DO UPDATE SET " +
        "selected_city = excluded.selected_city, " +
        "awaiting_search = excluded.awaiting_search, " +
        "updated_at = excluded.updated_at",
    )
    .bind(
      chatId,
      selectedCity,
      awaitingSearch ? 1 : 0,
      new Date().toISOString(),
    )
    .run();
}

export async function listCityOutages(
  db: D1Database,
  cityKey: string,
): Promise<OutageRow[]> {
  const result = await db
    .prepare(
      `SELECT ${OUTAGE_COLUMNS} FROM outages ` +
        "WHERE city_key = ? " +
        "ORDER BY outage_date, from_time, address LIMIT 500",
    )
    .bind(cityKey)
    .all<OutageRow>();
  return result.results;
}

export async function listCityOutagesForIdentity(
  db: D1Database,
  cityKey: string,
): Promise<OutageRow[]> {
  const result = await db
    .prepare(`SELECT ${OUTAGE_COLUMNS} FROM outages WHERE city_key = ?`)
    .bind(cityKey)
    .all<OutageRow>();
  return result.results;
}

function escapeLike(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("%", "\\%")
    .replaceAll("_", "\\_");
}

export async function searchCityOutages(
  db: D1Database,
  cityKey: string,
  query: string,
): Promise<OutageRow[]> {
  const normalizedQuery = normalizePersianText(query);
  if (!normalizedQuery) {
    return [];
  }

  const pattern = `%${escapeLike(normalizedQuery)}%`;
  const result = await db
    .prepare(
      `SELECT ${OUTAGE_COLUMNS} FROM outages ` +
        "WHERE city_key = ? AND address LIKE ? ESCAPE '\\' " +
        "ORDER BY outage_date, from_time, address LIMIT 150",
    )
    .bind(cityKey, pattern)
    .all<OutageRow>();
  return result.results;
}

export async function getCitySyncStatus(
  db: D1Database,
  cityKey: string,
): Promise<CitySyncStatus | null> {
  return db
    .prepare(
      "SELECT city_key, fetched_at, row_count, updated_at, active_date, " +
        "last_decision, last_snapshot_date " +
        "FROM city_sync_status WHERE city_key = ?",
    )
    .bind(cityKey)
    .first<CitySyncStatus>();
}

export async function getPendingCitySnapshot(
  db: D1Database,
  cityKey: string,
): Promise<PendingCitySnapshot | null> {
  return db
    .prepare(
      "SELECT city_key, snapshot_date, fingerprint, rows_json, row_count, " +
        "consecutive_count, first_seen_at, last_seen_at, fetched_at " +
        "FROM pending_city_snapshots WHERE city_key = ?",
    )
    .bind(cityKey)
    .first<PendingCitySnapshot>();
}

export async function savePendingCitySnapshot(
  db: D1Database,
  cityKey: string,
  snapshotDate: string,
  fingerprint: string,
  rows: NormalizedOutage[],
  consecutiveCount: number,
  firstSeenAt: string,
  fetchedAt: string,
  activeDate: string,
  activeRowCount: number,
  decision: string,
): Promise<void> {
  const now = new Date().toISOString();
  await db.batch([
    db
      .prepare(
        "INSERT INTO pending_city_snapshots " +
          "(city_key, snapshot_date, fingerprint, rows_json, row_count, " +
          "consecutive_count, first_seen_at, last_seen_at, fetched_at) " +
          "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) " +
          "ON CONFLICT(city_key) DO UPDATE SET " +
          "snapshot_date = excluded.snapshot_date, " +
          "fingerprint = excluded.fingerprint, " +
          "rows_json = excluded.rows_json, " +
          "row_count = excluded.row_count, " +
          "consecutive_count = excluded.consecutive_count, " +
          "first_seen_at = excluded.first_seen_at, " +
          "last_seen_at = excluded.last_seen_at, " +
          "fetched_at = excluded.fetched_at",
      )
      .bind(
        cityKey,
        snapshotDate,
        fingerprint,
        JSON.stringify(rows),
        rows.length,
        consecutiveCount,
        firstSeenAt,
        now,
        fetchedAt,
      ),
    statusUpsertStatement(
      db,
      cityKey,
      fetchedAt,
      activeRowCount,
      activeDate,
      decision,
      snapshotDate,
    ),
    ...cleanupStatements(db),
  ]);
}

export async function clearPendingCitySnapshot(
  db: D1Database,
  cityKey: string,
): Promise<void> {
  await db
    .prepare("DELETE FROM pending_city_snapshots WHERE city_key = ?")
    .bind(cityKey)
    .run();
}

export async function updateCitySyncMetadata(
  db: D1Database,
  cityKey: string,
  fetchedAt: string,
  rowCount: number,
  activeDate: string,
  decision: string,
  snapshotDate: string,
): Promise<void> {
  await db.batch([
    statusUpsertStatement(
      db,
      cityKey,
      fetchedAt,
      rowCount,
      activeDate,
      decision,
      snapshotDate,
    ),
    ...cleanupStatements(db),
  ]);
}

export async function mergeCitySnapshot(
  db: D1Database,
  cityKey: string,
  rows: NormalizedOutage[],
  fetchedAt: string,
  activeDate: string,
  totalRowCount: number,
  decision: string,
): Promise<void> {
  await db.batch([
    ...rows.map((row) => outageInsertStatement(db, row, true)),
    statusUpsertStatement(
      db,
      cityKey,
      fetchedAt,
      totalRowCount,
      activeDate,
      decision,
      activeDate,
    ),
    ...cleanupStatements(db),
  ]);
}

export async function activateCitySnapshot(
  db: D1Database,
  cityKey: string,
  rows: NormalizedOutage[],
  fetchedAt: string,
  previousActiveDate: string,
  snapshotDate: string,
  decision: string,
): Promise<void> {
  const archivedAt = new Date().toISOString();
  const archiveDate = previousActiveDate || "unknown";

  await db.batch([
    db
      .prepare(
        "INSERT OR IGNORE INTO outage_archive " +
          "(city_key, snapshot_date, outage_key, address, outage_type, " +
          "from_time, to_time, outage_date, outage_numbers, source_city_ids, " +
          "fetched_at, archived_at) " +
          `SELECT city_key, ?, outage_key, address, outage_type, from_time, ` +
          "to_time, outage_date, outage_numbers, source_city_ids, fetched_at, ? " +
          "FROM outages WHERE city_key = ?",
      )
      .bind(archiveDate, archivedAt, cityKey),
    db.prepare("DELETE FROM outages WHERE city_key = ?").bind(cityKey),
    ...rows.map((row) => outageInsertStatement(db, row, false)),
    statusUpsertStatement(
      db,
      cityKey,
      fetchedAt,
      rows.length,
      snapshotDate,
      decision,
      snapshotDate,
    ),
    db
      .prepare("DELETE FROM pending_city_snapshots WHERE city_key = ?")
      .bind(cityKey),
    ...cleanupStatements(db),
  ]);
}

export async function recordOutageNumberObservations(
  db: D1Database,
  observations: NormalizedOutageObservation[],
): Promise<void> {
  if (observations.length === 0) {
    return;
  }

  await db.batch(
    observations.map((row) =>
      db
        .prepare(
          "INSERT INTO outage_number_observations " +
            "(city_key, outage_date, normalized_address, original_address, " +
            "outage_number, source_city_id, outage_time, outage_type, " +
            "registration_date, registerer, first_seen_at, last_seen_at, seen_count) " +
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1) " +
            "ON CONFLICT(city_key, outage_date, normalized_address, " +
            "outage_number, source_city_id, outage_time) DO UPDATE SET " +
            "original_address = excluded.original_address, " +
            "outage_type = excluded.outage_type, " +
            "registration_date = excluded.registration_date, " +
            "registerer = excluded.registerer, " +
            "last_seen_at = excluded.last_seen_at, " +
            "seen_count = outage_number_observations.seen_count + 1",
        )
        .bind(
          row.cityKey,
          row.outageDate,
          row.normalizedAddress,
          row.originalAddress,
          row.outageNumber,
          row.sourceCityId,
          row.outageTime,
          row.outageType,
          row.registrationDate,
          row.registerer,
          row.fetchedAt,
          row.fetchedAt,
        ),
    ),
  );
}

export async function getOutageNumberAnalysis(
  db: D1Database,
  cityKey: string,
  limit: number,
): Promise<Record<string, unknown>> {
  const addressResult = await db
    .prepare(
      "SELECT city_key, outage_date, normalized_address, " +
        "MAX(original_address) AS address, " +
        "COUNT(DISTINCT outage_number) AS distinct_number_count, " +
        "GROUP_CONCAT(DISTINCT outage_number) AS outage_numbers, " +
        "MIN(first_seen_at) AS first_seen_at, " +
        "MAX(last_seen_at) AS last_seen_at, " +
        "SUM(seen_count) AS total_fetch_sightings " +
        "FROM outage_number_observations " +
        "WHERE (? = '' OR city_key = ?) " +
        "GROUP BY city_key, outage_date, normalized_address " +
        "ORDER BY outage_date DESC, distinct_number_count DESC, normalized_address " +
        "LIMIT ?",
    )
    .bind(cityKey, cityKey, limit)
    .all<Record<string, unknown>>();

  const numberResult = await db
    .prepare(
      "SELECT outage_number, " +
        "COUNT(DISTINCT city_key || char(31) || normalized_address) AS distinct_address_count, " +
        "COUNT(DISTINCT outage_date) AS distinct_date_count, " +
        "GROUP_CONCAT(DISTINCT city_key) AS cities, " +
        "MIN(first_seen_at) AS first_seen_at, " +
        "MAX(last_seen_at) AS last_seen_at, " +
        "SUM(seen_count) AS total_fetch_sightings " +
        "FROM outage_number_observations " +
        "WHERE (? = '' OR city_key = ?) " +
        "GROUP BY outage_number " +
        "HAVING distinct_address_count > 1 OR distinct_date_count > 1 " +
        "ORDER BY distinct_date_count DESC, distinct_address_count DESC, outage_number " +
        "LIMIT ?",
    )
    .bind(cityKey, cityKey, limit)
    .all<Record<string, unknown>>();

  return {
    city_key: cityKey || null,
    address_number_history: addressResult.results,
    reused_numbers: numberResult.results,
  };
}

export async function createNotificationBatch(
  db: D1Database,
  chatId: string,
  cityKey: string,
  rows: OutageRow[],
): Promise<string> {
  const id = crypto.randomUUID().replaceAll("-", "");
  const createdAt = new Date().toISOString();

  await db.batch([
    db
      .prepare(
        "INSERT INTO notification_batches " +
          "(id, chat_id, city_key, rows_json, created_at) VALUES (?, ?, ?, ?, ?)",
      )
      .bind(id, chatId, cityKey, JSON.stringify(rows), createdAt),
    db.prepare(
      "DELETE FROM notification_batches " +
        "WHERE julianday(created_at) < julianday('now', '-14 days')",
    ),
  ]);

  return id;
}

export async function getNotificationBatch(
  db: D1Database,
  id: string,
): Promise<NotificationBatch | null> {
  const record = await db
    .prepare(
      "SELECT id, chat_id, city_key, rows_json, created_at " +
        "FROM notification_batches WHERE id = ?",
    )
    .bind(id)
    .first<NotificationBatchRecord>();

  if (!record) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(record.rows_json);
  } catch {
    return null;
  }

  if (!Array.isArray(parsed)) {
    return null;
  }

  return {
    id: record.id,
    chatId: record.chat_id,
    cityKey: record.city_key,
    rows: parsed as OutageRow[],
    createdAt: record.created_at,
  };
}

export async function listSyncStatuses(
  db: D1Database,
): Promise<CitySyncStatus[]> {
  const result = await db
    .prepare(
      "SELECT s.city_key, s.fetched_at, s.row_count, s.updated_at, " +
        "s.active_date, s.last_decision, s.last_snapshot_date, " +
        "p.snapshot_date AS pending_date, " +
        "p.row_count AS pending_row_count, " +
        "p.consecutive_count AS pending_consecutive_count " +
        "FROM city_sync_status s " +
        "LEFT JOIN pending_city_snapshots p ON p.city_key = s.city_key " +
        "ORDER BY s.city_key",
    )
    .all<CitySyncStatus>();
  return result.results;
}
