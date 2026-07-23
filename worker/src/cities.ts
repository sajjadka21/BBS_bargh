import { normalizePersianText } from "./persian";
import type { CityConfig, D1Database } from "./types";

export interface ManagedCity extends CityConfig {
  is_active: number;
  discovery_status: string;
  discovery_requested_at: string | null;
  source_city_ids: number[];
}

export interface AdminFlow {
  telegram_user_id: string;
  chat_id: string;
  state: string;
  city_key: string | null;
  city_label: string | null;
  source_ids_json: string;
  mode: string | null;
  updated_at: string;
}

export interface CitySourceProposal {
  proposal_id: string;
  city_key: string;
  city_label: string;
  source_ids_json: string;
  status: string;
  error_text: string;
  created_at: string;
  decided_at: string | null;
}

function parseSourceIds(value: string): number[] {
  try {
    const parsed: unknown = JSON.parse(value || "[]");
    if (!Array.isArray(parsed)) return [];
    return [...new Set(parsed.map(Number).filter((n) => Number.isInteger(n) && n > 0))]
      .sort((a, b) => a - b);
  } catch {
    return [];
  }
}

export async function listManagedCities(db: D1Database): Promise<ManagedCity[]> {
  const cityResult = await db.prepare(
    "SELECT city_key, city_label, is_active, discovery_status, discovery_requested_at " +
      "FROM managed_cities ORDER BY city_label"
  ).all<Record<string, unknown>>();
  const sourceResult = await db.prepare(
    "SELECT logical_city_key, source_city_id FROM city_sources " +
      "WHERE is_active = 1 ORDER BY logical_city_key, source_city_id"
  ).all<{ logical_city_key: string; source_city_id: number }>();

  const byCity = new Map<string, number[]>();
  for (const row of sourceResult.results) {
    const values = byCity.get(row.logical_city_key) ?? [];
    values.push(Number(row.source_city_id));
    byCity.set(row.logical_city_key, values);
  }

  return cityResult.results.map((row) => ({
    key: String(row.city_key),
    label: String(row.city_label),
    is_active: Number(row.is_active ?? 0),
    discovery_status: String(row.discovery_status ?? "ready"),
    discovery_requested_at: row.discovery_requested_at
      ? String(row.discovery_requested_at)
      : null,
    source_city_ids: byCity.get(String(row.city_key)) ?? [],
  }));
}

export async function listActiveCityConfigs(db: D1Database): Promise<CityConfig[]> {
  return (await listManagedCities(db))
    .filter((city) => city.is_active === 1 && city.source_city_ids.length > 0)
    .map(({ key, label }) => ({ key, label }));
}

export async function getManagedCity(
  db: D1Database,
  cityKey: string,
): Promise<ManagedCity | null> {
  return (await listManagedCities(db)).find((city) => city.key === cityKey) ?? null;
}

export async function findCityByLabel(
  db: D1Database,
  cityLabel: string,
): Promise<ManagedCity | null> {
  return (await listManagedCities(db)).find((city) => city.label === cityLabel) ?? null;
}

export async function findSourceConflicts(
  db: D1Database,
  sourceIds: number[],
  excludeCityKey = "",
): Promise<Array<{ source_city_id: number; city_key: string; city_label: string }>> {
  if (sourceIds.length === 0) return [];
  const placeholders = sourceIds.map(() => "?").join(",");
  const result = await db.prepare(
    "SELECT s.source_city_id, s.logical_city_key AS city_key, " +
      "COALESCE(m.city_label, s.logical_city_label) AS city_label " +
      "FROM city_sources s LEFT JOIN managed_cities m " +
      "ON m.city_key = s.logical_city_key " +
      `WHERE s.is_active = 1 AND s.source_city_id IN (${placeholders}) ` +
      "AND s.logical_city_key <> ? ORDER BY s.source_city_id"
  ).bind(...sourceIds, excludeCityKey).all<{
    source_city_id: number;
    city_key: string;
    city_label: string;
  }>();
  return result.results;
}

export async function saveManagedCity(
  db: D1Database,
  cityKey: string,
  cityLabel: string,
  sourceIds: number[],
): Promise<void> {
  const normalized = [...new Set(sourceIds)].sort((a, b) => a - b);
  if (normalized.length === 0) throw new Error("At least one source ID is required.");
  const conflicts = await findSourceConflicts(db, normalized, cityKey);
  if (conflicts.length > 0) {
    throw new Error(
      `Source conflict: ${conflicts.map((row) => `${row.source_city_id}:${row.city_label}`).join(", ")}`,
    );
  }
  const now = new Date().toISOString();
  const statements = [
    db.prepare(
      "INSERT INTO managed_cities " +
        "(city_key, city_label, is_active, discovery_status, discovery_requested_at, created_at, updated_at) " +
        "VALUES (?, ?, 1, 'ready', NULL, ?, ?) " +
        "ON CONFLICT(city_key) DO UPDATE SET city_label = excluded.city_label, " +
        "is_active = 1, discovery_status = 'ready', discovery_requested_at = NULL, " +
        "updated_at = excluded.updated_at"
    ).bind(cityKey, cityLabel, now, now),
    db.prepare("UPDATE city_sources SET is_active = 0, updated_at = ? WHERE logical_city_key = ?")
      .bind(now, cityKey),
    ...normalized.map((sourceId) =>
      db.prepare(
        "INSERT INTO city_sources " +
          "(logical_city_key, logical_city_label, source_city_id, source_city_label, is_active, created_at, updated_at) " +
          "VALUES (?, ?, ?, NULL, 1, ?, ?) " +
          "ON CONFLICT(logical_city_key, source_city_id) DO UPDATE SET " +
          "logical_city_label = excluded.logical_city_label, is_active = 1, updated_at = excluded.updated_at"
      ).bind(cityKey, cityLabel, sourceId, now, now),
    ),
  ];
  await db.batch(statements);
}

export async function requestCityDiscovery(
  db: D1Database,
  cityKey: string,
  cityLabel: string,
): Promise<void> {
  const now = new Date().toISOString();
  await db.prepare(
    "INSERT INTO managed_cities " +
      "(city_key, city_label, is_active, discovery_status, discovery_requested_at, created_at, updated_at) " +
      "VALUES (?, ?, 0, 'requested', ?, ?, ?) " +
      "ON CONFLICT(city_key) DO UPDATE SET city_label = excluded.city_label, " +
      "is_active = 0, discovery_status = 'requested', discovery_requested_at = excluded.discovery_requested_at, " +
      "updated_at = excluded.updated_at"
  ).bind(cityKey, cityLabel, now, now, now).run();
}

export async function deactivateManagedCity(
  db: D1Database,
  cityKey: string,
): Promise<boolean> {
  const now = new Date().toISOString();
  const result = await db.prepare(
    "UPDATE managed_cities SET is_active = 0, discovery_status = 'disabled', updated_at = ? " +
      "WHERE city_key = ?"
  ).bind(now, cityKey).run();
  await db.prepare(
    "UPDATE city_sources SET is_active = 0, updated_at = ? WHERE logical_city_key = ?"
  ).bind(now, cityKey).run();
  return (result.meta.changes ?? 0) > 0;
}

export async function getAdminFlow(
  db: D1Database,
  telegramUserId: string,
): Promise<AdminFlow | null> {
  return db.prepare(
    "SELECT telegram_user_id, chat_id, state, city_key, city_label, source_ids_json, mode, updated_at " +
      "FROM admin_flows WHERE telegram_user_id = ?"
  ).bind(telegramUserId).first<AdminFlow>();
}

export async function setAdminFlow(
  db: D1Database,
  telegramUserId: string,
  chatId: string,
  state: string,
  cityKey: string | null,
  cityLabel: string | null,
  sourceIds: number[] = [],
  mode: string | null = null,
): Promise<void> {
  await db.prepare(
    "INSERT INTO admin_flows " +
      "(telegram_user_id, chat_id, state, city_key, city_label, source_ids_json, mode, updated_at) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?, ?) " +
      "ON CONFLICT(telegram_user_id) DO UPDATE SET chat_id = excluded.chat_id, " +
      "state = excluded.state, city_key = excluded.city_key, city_label = excluded.city_label, " +
      "source_ids_json = excluded.source_ids_json, mode = excluded.mode, updated_at = excluded.updated_at"
  ).bind(
    telegramUserId,
    chatId,
    state,
    cityKey,
    cityLabel,
    JSON.stringify(sourceIds),
    mode,
    new Date().toISOString(),
  ).run();
}

export async function clearAdminFlow(
  db: D1Database,
  telegramUserId: string,
): Promise<void> {
  await db.prepare("DELETE FROM admin_flows WHERE telegram_user_id = ?")
    .bind(telegramUserId).run();
}

export function adminFlowSourceIds(flow: AdminFlow): number[] {
  return parseSourceIds(flow.source_ids_json);
}

export async function createCitySourceProposal(
  db: D1Database,
  cityKey: string,
  cityLabel: string,
  sourceIds: number[],
  errorText = "",
): Promise<CitySourceProposal> {
  const proposalId = crypto.randomUUID().replaceAll("-", "");
  const createdAt = new Date().toISOString();
  const normalized = [...new Set(sourceIds)].sort((a, b) => a - b);
  await db.prepare(
    "INSERT INTO city_source_proposals " +
      "(proposal_id, city_key, city_label, source_ids_json, status, error_text, created_at) " +
      "VALUES (?, ?, ?, ?, 'pending', ?, ?)"
  ).bind(proposalId, cityKey, cityLabel, JSON.stringify(normalized), errorText, createdAt).run();
  await db.prepare(
    "UPDATE managed_cities SET discovery_status = ?, updated_at = ? WHERE city_key = ?"
  ).bind(errorText ? "failed" : "proposal_ready", createdAt, cityKey).run();
  return {
    proposal_id: proposalId,
    city_key: cityKey,
    city_label: cityLabel,
    source_ids_json: JSON.stringify(normalized),
    status: "pending",
    error_text: errorText,
    created_at: createdAt,
    decided_at: null,
  };
}

export async function getCitySourceProposal(
  db: D1Database,
  proposalId: string,
): Promise<CitySourceProposal | null> {
  return db.prepare(
    "SELECT proposal_id, city_key, city_label, source_ids_json, status, error_text, created_at, decided_at " +
      "FROM city_source_proposals WHERE proposal_id = ?"
  ).bind(proposalId).first<CitySourceProposal>();
}

export async function acceptCitySourceProposal(
  db: D1Database,
  proposalId: string,
): Promise<ManagedCity> {
  const proposal = await getCitySourceProposal(db, proposalId);
  if (!proposal || proposal.status !== "pending") {
    throw new Error("Proposal is no longer pending.");
  }
  const ids = parseSourceIds(proposal.source_ids_json);
  await saveManagedCity(db, proposal.city_key, proposal.city_label, ids);
  await db.prepare(
    "UPDATE city_source_proposals SET status = 'accepted', decided_at = ? WHERE proposal_id = ?"
  ).bind(new Date().toISOString(), proposalId).run();
  const city = await getManagedCity(db, proposal.city_key);
  if (!city) throw new Error("Activated city could not be loaded.");
  return city;
}

export async function rejectCitySourceProposal(
  db: D1Database,
  proposalId: string,
): Promise<void> {
  const proposal = await getCitySourceProposal(db, proposalId);
  if (!proposal) return;
  const now = new Date().toISOString();
  await db.batch([
    db.prepare(
      "UPDATE city_source_proposals SET status = 'rejected', decided_at = ? WHERE proposal_id = ?"
    ).bind(now, proposalId),
    db.prepare(
      "UPDATE managed_cities SET discovery_status = 'rejected', updated_at = ? WHERE city_key = ?"
    ).bind(now, proposal.city_key),
  ]);
}

export async function listPendingDiscoveryCities(
  db: D1Database,
): Promise<Array<{ key: string; label: string }>> {
  const result = await db.prepare(
    "SELECT city_key AS key, city_label AS label FROM managed_cities " +
      "WHERE discovery_status = 'requested' ORDER BY discovery_requested_at"
  ).all<{ key: string; label: string }>();
  return result.results;
}


export interface BulkDiscoveryInputItem {
  label: string;
  source_city_ids: number[];
  error?: string;
}

export interface BulkDiscoveryBatch {
  batch_id: string;
  payload_json: string;
  status: string;
  discovered_city_count: number;
  clean_city_count: number;
  conflict_count: number;
  error_count: number;
  summary_json: string;
  created_at: string;
  decided_at: string | null;
}

interface BulkDiscoverySummary {
  clean: BulkDiscoveryInputItem[];
  conflicts: Array<{ label: string; detail: string }>;
  errors: Array<{ label: string; detail: string }>;
}

async function generatedCityKey(label: string): Promise<string> {
  const normalized = normalizePersianText(label);
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(normalized),
  );
  const suffix = [...new Uint8Array(digest)]
    .slice(0, 6)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return `city_${suffix}`;
}

function normalizeBulkItems(rawItems: BulkDiscoveryInputItem[]): BulkDiscoveryInputItem[] {
  const byLabel = new Map<string, BulkDiscoveryInputItem>();
  for (const item of rawItems) {
    const label = normalizePersianText(String(item.label ?? "")).slice(0, 50);
    if (!label) continue;
    const ids = [...new Set(
      (Array.isArray(item.source_city_ids) ? item.source_city_ids : [])
        .map(Number)
        .filter((value) => Number.isInteger(value) && value > 0 && value <= 1000000),
    )].sort((a, b) => a - b);
    byLabel.set(label, {
      label,
      source_city_ids: ids,
      error: String(item.error ?? "").trim().slice(0, 900),
    });
  }
  return [...byLabel.values()].sort((a, b) => a.label.localeCompare(b.label, "fa"));
}

async function analyzeBulkDiscovery(
  db: D1Database,
  items: BulkDiscoveryInputItem[],
): Promise<BulkDiscoverySummary> {
  const clean: BulkDiscoveryInputItem[] = [];
  const conflicts: BulkDiscoverySummary["conflicts"] = [];
  const errors: BulkDiscoverySummary["errors"] = [];
  const existing = await listManagedCities(db);
  const existingByLabel = new Map(
    existing.map((city) => [normalizePersianText(city.label), city]),
  );
  const labelsBySource = new Map<number, Set<string>>();
  for (const item of items) {
    for (const id of item.source_city_ids) {
      const labels = labelsBySource.get(id) ?? new Set<string>();
      labels.add(item.label);
      labelsBySource.set(id, labels);
    }
  }

  for (const item of items) {
    if (item.error) {
      errors.push({ label: item.label, detail: item.error });
      continue;
    }
    if (item.source_city_ids.length === 0) {
      errors.push({ label: item.label, detail: "هیچ شماره منبعی پیدا نشد." });
      continue;
    }
    const crossLabels = item.source_city_ids
      .filter((id) => (labelsBySource.get(id)?.size ?? 0) > 1)
      .map((id) => `${id}: ${[...(labelsBySource.get(id) ?? [])].join(" / ")}`);
    if (crossLabels.length > 0) {
      conflicts.push({
        label: item.label,
        detail: `شماره مشترک بین چند شهر: ${crossLabels.join("، ")}`,
      });
      continue;
    }
    const existingCity = existingByLabel.get(normalizePersianText(item.label));
    const dbConflicts = await findSourceConflicts(
      db,
      item.source_city_ids,
      existingCity?.key ?? "",
    );
    if (dbConflicts.length > 0) {
      conflicts.push({
        label: item.label,
        detail: dbConflicts
          .map((row) => `${row.source_city_id} در ${row.city_label}`)
          .join("، "),
      });
      continue;
    }
    clean.push(item);
  }
  return { clean, conflicts, errors };
}

export async function createBulkDiscoveryBatch(
  db: D1Database,
  rawItems: BulkDiscoveryInputItem[],
): Promise<BulkDiscoveryBatch> {
  const items = normalizeBulkItems(rawItems);
  if (items.length === 0) throw new Error("No usable city discovery result was supplied.");
  const summary = await analyzeBulkDiscovery(db, items);
  const batchId = crypto.randomUUID().replaceAll("-", "");
  const createdAt = new Date().toISOString();
  await db.prepare(
    "INSERT INTO city_discovery_bulk_batches " +
      "(batch_id, payload_json, status, discovered_city_count, clean_city_count, " +
      "conflict_count, error_count, summary_json, created_at) " +
      "VALUES (?, ?, 'pending', ?, ?, ?, ?, ?, ?)",
  ).bind(
    batchId,
    JSON.stringify(items),
    items.length,
    summary.clean.length,
    summary.conflicts.length,
    summary.errors.length,
    JSON.stringify(summary),
    createdAt,
  ).run();
  const saved = await getBulkDiscoveryBatch(db, batchId);
  if (!saved) throw new Error("Bulk discovery batch was not saved.");
  return saved;
}

export async function getBulkDiscoveryBatch(
  db: D1Database,
  batchId: string,
): Promise<BulkDiscoveryBatch | null> {
  return db.prepare(
    "SELECT batch_id, payload_json, status, discovered_city_count, clean_city_count, " +
      "conflict_count, error_count, summary_json, created_at, decided_at " +
      "FROM city_discovery_bulk_batches WHERE batch_id = ?",
  ).bind(batchId).first<BulkDiscoveryBatch>();
}

export function parseBulkDiscoverySummary(batch: BulkDiscoveryBatch): BulkDiscoverySummary {
  try {
    const parsed = JSON.parse(batch.summary_json) as BulkDiscoverySummary;
    return {
      clean: Array.isArray(parsed.clean) ? parsed.clean : [],
      conflicts: Array.isArray(parsed.conflicts) ? parsed.conflicts : [],
      errors: Array.isArray(parsed.errors) ? parsed.errors : [],
    };
  } catch {
    return { clean: [], conflicts: [], errors: [] };
  }
}

export async function applyBulkDiscoveryBatch(
  db: D1Database,
  batchId: string,
): Promise<{ applied: number; skipped: number }> {
  const batch = await getBulkDiscoveryBatch(db, batchId);
  if (!batch || batch.status !== "pending") {
    throw new Error("این پیشنهاد دیگر در انتظار تأیید نیست.");
  }
  const summary = parseBulkDiscoverySummary(batch);
  let applied = 0;
  for (const item of summary.clean) {
    const existing = await findCityByLabel(db, item.label);
    const key = existing?.key ?? await generatedCityKey(item.label);
    await saveManagedCity(db, key, item.label, item.source_city_ids);
    applied += 1;
  }
  const now = new Date().toISOString();
  await db.prepare(
    "UPDATE city_discovery_bulk_batches SET status = 'accepted', decided_at = ? WHERE batch_id = ?",
  ).bind(now, batchId).run();
  return {
    applied,
    skipped: summary.conflicts.length + summary.errors.length,
  };
}

export async function rejectBulkDiscoveryBatch(
  db: D1Database,
  batchId: string,
): Promise<void> {
  await db.prepare(
    "UPDATE city_discovery_bulk_batches SET status = 'rejected', decided_at = ? " +
      "WHERE batch_id = ? AND status = 'pending'",
  ).bind(new Date().toISOString(), batchId).run();
}
