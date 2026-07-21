import type {
  ChatSession,
  D1Database,
  NormalizedOutage,
  OutageRow,
} from "./types";

interface CitySyncStatus {
  city_key: string;
  fetched_at: string;
  row_count: number;
  updated_at: string;
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
      "SELECT city_key, outage_key, address, outage_type, from_time, " +
        "to_time, outage_date, fetched_at FROM outages " +
        "WHERE city_key = ? " +
        "ORDER BY outage_date, from_time, address LIMIT 300",
    )
    .bind(cityKey)
    .all<OutageRow>();
  return result.results;
}

function escapeLike(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}

export async function searchCityOutages(
  db: D1Database,
  cityKey: string,
  query: string,
): Promise<OutageRow[]> {
  const pattern = `%${escapeLike(query.trim())}%`;
  const result = await db
    .prepare(
      "SELECT city_key, outage_key, address, outage_type, from_time, " +
        "to_time, outage_date, fetched_at FROM outages " +
        "WHERE city_key = ? AND address LIKE ? ESCAPE '\\' " +
        "ORDER BY outage_date, from_time, address LIMIT 100",
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
      "SELECT city_key, fetched_at, row_count, updated_at " +
        "FROM city_sync_status WHERE city_key = ?",
    )
    .bind(cityKey)
    .first<CitySyncStatus>();
}

export async function getExistingOutageKeys(
  db: D1Database,
  cityKey: string,
): Promise<Set<string>> {
  const result = await db
    .prepare("SELECT outage_key FROM outages WHERE city_key = ?")
    .bind(cityKey)
    .all<{ outage_key: string }>();
  return new Set(result.results.map((row) => row.outage_key));
}

export async function replaceCitySnapshot(
  db: D1Database,
  cityKey: string,
  rows: NormalizedOutage[],
  fetchedAt: string,
): Promise<void> {
  const statements = [
    db.prepare("DELETE FROM outages WHERE city_key = ?").bind(cityKey),
    ...rows.map((row) =>
      db
        .prepare(
          "INSERT INTO outages " +
            "(city_key, outage_key, address, outage_type, from_time, to_time, outage_date, fetched_at) " +
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(
          row.cityKey,
          row.outageKey,
          row.address,
          row.outageType,
          row.fromTime,
          row.toTime,
          row.outageDate,
          row.fetchedAt,
        ),
    ),
    db
      .prepare(
        "INSERT INTO city_sync_status (city_key, fetched_at, row_count, updated_at) " +
          "VALUES (?, ?, ?, ?) " +
          "ON CONFLICT(city_key) DO UPDATE SET " +
          "fetched_at = excluded.fetched_at, " +
          "row_count = excluded.row_count, " +
          "updated_at = excluded.updated_at",
      )
      .bind(cityKey, fetchedAt, rows.length, new Date().toISOString()),
    db.prepare(
      "DELETE FROM processed_updates " +
        "WHERE processed_at < datetime('now', '-30 days')",
    ),
  ];

  await db.batch(statements);
}

export async function listSyncStatuses(
  db: D1Database,
): Promise<CitySyncStatus[]> {
  const result = await db
    .prepare(
      "SELECT city_key, fetched_at, row_count, updated_at " +
        "FROM city_sync_status ORDER BY city_key",
    )
    .all<CitySyncStatus>();
  return result.results;
}
