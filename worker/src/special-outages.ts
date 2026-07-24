import { revealBillId, type SpecialLookupRequest } from "./special-requests";
import type { D1Database, Env } from "./types";

export interface SpecialFetchTarget {
  request_id: string;
  bill_id: string;
  bill_id_last4: string;
  request_label: string;
  province: string;
  county: string;
}

export interface SpecialOutageRow {
  request_id: string;
  outage_key: string;
  outage_date: string;
  from_time: string;
  to_time: string;
  start_at_utc: string;
  address: string;
  description: string;
  provider_outage_id: string;
  fetched_at: string;
}

export interface SpecialRequestWithOutages extends SpecialLookupRequest {
  reminder_minutes: number;
  last_fetched_at: string | null;
  last_fetch_status: string;
  last_error: string;
  outages: SpecialOutageRow[];
}

export interface SpecialSyncChange {
  request: SpecialLookupRequest & {
    reminder_minutes: number;
    last_fetched_at: string | null;
    last_fetch_status: string;
    last_error: string;
  };
  previous: SpecialOutageRow[];
  current: SpecialOutageRow[];
  eventKey: string;
  eventType: "initial" | "changed" | "cleared";
}

export interface ProviderHealthUpdate {
  provider_key: string;
  status: string;
  detail: string;
  token_expires_at: string | null;
  checked_at: string;
  notification_key: string;
  should_notify_admin: boolean;
}

type SpecialRequestServiceRow = SpecialLookupRequest & {
  reminder_minutes: number;
  last_fetched_at: string | null;
  last_fetch_status: string;
  last_error: string;
};

function cleanText(value: unknown, max = 1000): string {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function normalizeReminderMinutes(value: unknown): number {
  const parsed = Number(value);
  return parsed === 30 || parsed === 60 ? parsed : 0;
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function stableOutageSignature(rows: SpecialOutageRow[]): string {
  return JSON.stringify(
    [...rows]
      .map((row) => ({
        date: row.outage_date,
        from: row.from_time,
        to: row.to_time,
        start: row.start_at_utc,
        address: row.address,
        description: row.description,
        provider: row.provider_outage_id,
      }))
      .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))),
  );
}

async function getServiceRequest(
  db: D1Database,
  requestId: string,
): Promise<SpecialRequestServiceRow | null> {
  return db.prepare(
    "SELECT request_id, telegram_user_id, chat_id, province, county, request_label, " +
      "bill_id_ciphertext, bill_id_hash, bill_id_last4, status, admin_note, provider_key, " +
      "created_at, updated_at, decided_at, reminder_minutes, last_fetched_at, " +
      "last_fetch_status, last_error FROM special_lookup_requests WHERE request_id = ?",
  ).bind(requestId).first<SpecialRequestServiceRow>();
}

export async function listSpecialFetchTargets(env: Env): Promise<SpecialFetchTarget[]> {
  const result = await env.DB.prepare(
    "SELECT request_id, telegram_user_id, chat_id, province, county, request_label, " +
      "bill_id_ciphertext, bill_id_hash, bill_id_last4, status, admin_note, provider_key, " +
      "created_at, updated_at, decided_at, reminder_minutes, last_fetched_at, " +
      "last_fetch_status, last_error FROM special_lookup_requests " +
      "WHERE status = 'active' ORDER BY created_at ASC",
  ).all<SpecialRequestServiceRow>();

  const targets: SpecialFetchTarget[] = [];
  for (const request of result.results) {
    targets.push({
      request_id: request.request_id,
      bill_id: await revealBillId(env, request.bill_id_ciphertext),
      bill_id_last4: request.bill_id_last4,
      request_label: request.request_label,
      province: request.province,
      county: request.county,
    });
  }
  return targets;
}

export async function listSpecialOutages(
  db: D1Database,
  requestId: string,
): Promise<SpecialOutageRow[]> {
  const result = await db.prepare(
    "SELECT request_id, outage_key, outage_date, from_time, to_time, start_at_utc, " +
      "address, description, provider_outage_id, fetched_at " +
      "FROM special_outage_results WHERE request_id = ? " +
      "ORDER BY CASE WHEN start_at_utc = '' THEN 1 ELSE 0 END, start_at_utc, outage_date, from_time",
  ).bind(requestId).all<SpecialOutageRow>();
  return result.results;
}

export async function getUserSpecialRequestWithOutages(
  db: D1Database,
  requestId: string,
  telegramUserId: string,
): Promise<SpecialRequestWithOutages | null> {
  const request = await getServiceRequest(db, requestId);
  if (!request || request.telegram_user_id !== telegramUserId) return null;
  return { ...request, outages: await listSpecialOutages(db, requestId) };
}

export async function setSpecialReminderMinutes(
  db: D1Database,
  requestId: string,
  telegramUserId: string,
  reminderMinutes: number,
): Promise<SpecialRequestWithOutages | null> {
  if (![0, 30, 60].includes(reminderMinutes)) {
    throw new Error("زمان یادآوری نامعتبر است.");
  }
  await db.prepare(
    "UPDATE special_lookup_requests SET reminder_minutes = ?, updated_at = ? " +
      "WHERE request_id = ? AND telegram_user_id = ? AND status = 'active'",
  ).bind(reminderMinutes, new Date().toISOString(), requestId, telegramUserId).run();
  return getUserSpecialRequestWithOutages(db, requestId, telegramUserId);
}

interface RawSpecialOutage {
  outage_key?: unknown;
  outage_date?: unknown;
  from_time?: unknown;
  to_time?: unknown;
  start_at_utc?: unknown;
  address?: unknown;
  description?: unknown;
  provider_outage_id?: unknown;
}

interface RawSpecialResult {
  request_id?: unknown;
  status?: unknown;
  error?: unknown;
  outages?: unknown;
}

async function normalizeIncomingOutages(
  requestId: string,
  rawOutages: unknown,
  fetchedAt: string,
): Promise<SpecialOutageRow[]> {
  if (!Array.isArray(rawOutages)) return [];
  const rows: SpecialOutageRow[] = [];
  const seen = new Set<string>();
  for (const raw of rawOutages.slice(0, 100)) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as RawSpecialOutage;
    const outageDate = cleanText(item.outage_date, 80);
    const fromTime = cleanText(item.from_time, 40);
    const toTime = cleanText(item.to_time, 40);
    const startAtUtc = cleanText(item.start_at_utc, 80);
    const address = cleanText(item.address, 1200);
    const description = cleanText(item.description, 1200);
    const providerOutageId = cleanText(item.provider_outage_id, 200);
    if (!address && !outageDate && !fromTime && !description) continue;
    const suppliedKey = cleanText(item.outage_key, 128);
    const outageKey = suppliedKey || await sha256([
      requestId,
      providerOutageId,
      outageDate,
      fromTime,
      toTime,
      startAtUtc,
      address,
      description,
    ].join("\u001f"));
    if (seen.has(outageKey)) continue;
    seen.add(outageKey);
    rows.push({
      request_id: requestId,
      outage_key: outageKey,
      outage_date: outageDate,
      from_time: fromTime,
      to_time: toTime,
      start_at_utc: startAtUtc,
      address,
      description,
      provider_outage_id: providerOutageId,
      fetched_at: fetchedAt,
    });
  }
  return rows;
}

export async function synchronizeSpecialOutages(
  env: Env,
  rawPayload: unknown,
): Promise<{
  processed: number;
  changed: SpecialSyncChange[];
  errors: string[];
}> {
  if (!rawPayload || typeof rawPayload !== "object") {
    throw new Error("Special sync payload must be a JSON object.");
  }
  const payload = rawPayload as { fetched_at?: unknown; results?: unknown };
  const fetchedAtCandidate = cleanText(payload.fetched_at, 80);
  const fetchedAt = Number.isNaN(Date.parse(fetchedAtCandidate))
    ? new Date().toISOString()
    : new Date(fetchedAtCandidate).toISOString();
  if (!Array.isArray(payload.results)) {
    throw new Error("Special sync results must be an array.");
  }

  const changed: SpecialSyncChange[] = [];
  const errors: string[] = [];
  let processed = 0;

  for (const raw of payload.results.slice(0, 500)) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as RawSpecialResult;
    const requestId = cleanText(item.request_id, 64);
    if (!/^[a-f0-9]{32}$/i.test(requestId)) {
      errors.push("Invalid request_id in special sync payload.");
      continue;
    }
    const request = await getServiceRequest(env.DB, requestId);
    if (!request || request.status !== "active") {
      errors.push(`${requestId}: request is not active.`);
      continue;
    }
    const status = cleanText(item.status, 40) || "error";
    const errorText = cleanText(item.error, 1000);
    const previous = await listSpecialOutages(env.DB, requestId);

    if (status !== "ok") {
      await env.DB.prepare(
        "UPDATE special_lookup_requests SET last_fetched_at = ?, last_fetch_status = ?, " +
          "last_error = ?, provider_key = 'bargheman', updated_at = ? WHERE request_id = ?",
      ).bind(fetchedAt, status, errorText, fetchedAt, requestId).run();
      processed += 1;
      continue;
    }

    const current = await normalizeIncomingOutages(requestId, item.outages, fetchedAt);
    const statements = [
      env.DB.prepare("DELETE FROM special_outage_results WHERE request_id = ?").bind(requestId),
      ...current.map((row) => env.DB.prepare(
        "INSERT INTO special_outage_results " +
          "(request_id, outage_key, outage_date, from_time, to_time, start_at_utc, address, " +
          "description, provider_outage_id, fetched_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      ).bind(
        row.request_id,
        row.outage_key,
        row.outage_date,
        row.from_time,
        row.to_time,
        row.start_at_utc,
        row.address,
        row.description,
        row.provider_outage_id,
        row.fetched_at,
      )),
      env.DB.prepare(
        "UPDATE special_lookup_requests SET last_fetched_at = ?, last_fetch_status = 'ok', " +
          "last_error = '', provider_key = 'bargheman', updated_at = ? WHERE request_id = ?",
      ).bind(fetchedAt, fetchedAt, requestId),
    ];
    await env.DB.batch(statements);
    processed += 1;

    const previousSignature = stableOutageSignature(previous);
    const currentSignature = stableOutageSignature(current);
    if (previousSignature !== currentSignature) {
      const eventType: SpecialSyncChange["eventType"] = previous.length === 0
        ? "initial"
        : current.length === 0
          ? "cleared"
          : "changed";
      const eventKey = await sha256([
        requestId,
        eventType,
        previousSignature,
        currentSignature,
      ].join("\u001f"));
      const existing = await env.DB.prepare(
        "SELECT event_key FROM special_outage_change_events WHERE event_key = ?",
      ).bind(eventKey).first<{ event_key: string }>();
      if (!existing) {
        changed.push({
          request: { ...request, last_fetched_at: fetchedAt, last_fetch_status: "ok", last_error: "" },
          previous,
          current,
          eventKey,
          eventType,
        });
      }
    }
  }

  return { processed, changed, errors };
}

export async function recordSpecialChangeEvent(
  db: D1Database,
  change: SpecialSyncChange,
): Promise<void> {
  await db.prepare(
    "INSERT OR IGNORE INTO special_outage_change_events " +
      "(event_key, request_id, event_type, sent_at) VALUES (?, ?, ?, ?)",
  ).bind(
    change.eventKey,
    change.request.request_id,
    change.eventType,
    new Date().toISOString(),
  ).run();
}

export async function listDueSpecialReminders(
  db: D1Database,
  now = new Date(),
): Promise<Array<{
  request: SpecialRequestServiceRow;
  outage: SpecialOutageRow;
  minutes_until: number;
}>> {
  const upper = new Date(now.getTime() + 65 * 60 * 1000).toISOString();
  const result = await db.prepare(
    "SELECT r.request_id, r.telegram_user_id, r.chat_id, r.province, r.county, " +
      "r.request_label, r.bill_id_ciphertext, r.bill_id_hash, r.bill_id_last4, r.status, " +
      "r.admin_note, r.provider_key, r.created_at, r.updated_at, r.decided_at, " +
      "r.reminder_minutes, r.last_fetched_at, r.last_fetch_status, r.last_error, " +
      "o.outage_key, o.outage_date, o.from_time, o.to_time, o.start_at_utc, o.address, " +
      "o.description, o.provider_outage_id, o.fetched_at " +
      "FROM special_lookup_requests r JOIN special_outage_results o ON o.request_id = r.request_id " +
      "LEFT JOIN special_outage_reminders m ON m.request_id = r.request_id " +
      "AND m.outage_key = o.outage_key AND m.reminder_minutes = r.reminder_minutes " +
      "WHERE r.status = 'active' AND r.reminder_minutes IN (30, 60) " +
      "AND o.start_at_utc > ? AND o.start_at_utc <= ? AND m.request_id IS NULL " +
      "ORDER BY o.start_at_utc ASC LIMIT 500",
  ).bind(now.toISOString(), upper).all<Record<string, unknown>>();

  const due: Array<{
    request: SpecialRequestServiceRow;
    outage: SpecialOutageRow;
    minutes_until: number;
  }> = [];
  for (const raw of result.results) {
    const reminder = normalizeReminderMinutes(raw.reminder_minutes);
    const start = Date.parse(String(raw.start_at_utc ?? ""));
    if (!reminder || Number.isNaN(start)) continue;
    const minutesUntil = Math.ceil((start - now.getTime()) / 60000);
    if (minutesUntil <= 0 || minutesUntil > reminder) continue;
    const request = raw as unknown as SpecialRequestServiceRow;
    const outage: SpecialOutageRow = {
      request_id: String(raw.request_id),
      outage_key: String(raw.outage_key),
      outage_date: String(raw.outage_date ?? ""),
      from_time: String(raw.from_time ?? ""),
      to_time: String(raw.to_time ?? ""),
      start_at_utc: String(raw.start_at_utc ?? ""),
      address: String(raw.address ?? ""),
      description: String(raw.description ?? ""),
      provider_outage_id: String(raw.provider_outage_id ?? ""),
      fetched_at: String(raw.fetched_at ?? ""),
    };
    due.push({ request, outage, minutes_until: minutesUntil });
  }
  return due;
}

export async function recordSpecialReminder(
  db: D1Database,
  requestId: string,
  outageKey: string,
  reminderMinutes: number,
): Promise<void> {
  await db.prepare(
    "INSERT OR IGNORE INTO special_outage_reminders " +
      "(request_id, outage_key, reminder_minutes, sent_at) VALUES (?, ?, ?, ?)",
  ).bind(requestId, outageKey, reminderMinutes, new Date().toISOString()).run();
}

export async function updateProviderHealth(
  db: D1Database,
  rawPayload: unknown,
): Promise<ProviderHealthUpdate> {
  if (!rawPayload || typeof rawPayload !== "object") {
    throw new Error("Provider health payload must be a JSON object.");
  }
  const payload = rawPayload as Record<string, unknown>;
  const providerKey = cleanText(payload.provider_key, 80) || "bargheman";
  const status = cleanText(payload.status, 40) || "unknown";
  const detail = cleanText(payload.detail, 1000);
  const expiresCandidate = cleanText(payload.token_expires_at, 80);
  const tokenExpiresAt = expiresCandidate && !Number.isNaN(Date.parse(expiresCandidate))
    ? new Date(expiresCandidate).toISOString()
    : null;
  const checkedCandidate = cleanText(payload.checked_at, 80);
  const checkedAt = checkedCandidate && !Number.isNaN(Date.parse(checkedCandidate))
    ? new Date(checkedCandidate).toISOString()
    : new Date().toISOString();
  const notificationKey = await sha256([
    providerKey,
    status,
    detail,
    tokenExpiresAt ?? "",
  ].join("\u001f"));
  const existing = await db.prepare(
    "SELECT last_admin_notification_key, last_admin_notified_at FROM provider_health " +
      "WHERE provider_key = ?",
  ).bind(providerKey).first<{
    last_admin_notification_key: string;
    last_admin_notified_at: string | null;
  }>();
  const lastNotifiedAt = existing?.last_admin_notified_at
    ? Date.parse(existing.last_admin_notified_at)
    : 0;
  const notificationIsStale = !lastNotifiedAt || Date.now() - lastNotifiedAt > 24 * 60 * 60 * 1000;
  const shouldNotifyAdmin = status !== "ok" && (
    existing?.last_admin_notification_key !== notificationKey || notificationIsStale
  );

  await db.prepare(
    "INSERT INTO provider_health " +
      "(provider_key, status, detail, token_expires_at, checked_at, " +
      "last_admin_notification_key, last_admin_notified_at) VALUES (?, ?, ?, ?, ?, ?, ?) " +
      "ON CONFLICT(provider_key) DO UPDATE SET status = excluded.status, detail = excluded.detail, " +
      "token_expires_at = excluded.token_expires_at, checked_at = excluded.checked_at, " +
      "last_admin_notification_key = CASE WHEN ? THEN excluded.last_admin_notification_key " +
      "ELSE provider_health.last_admin_notification_key END, " +
      "last_admin_notified_at = CASE WHEN ? THEN excluded.last_admin_notified_at " +
      "ELSE provider_health.last_admin_notified_at END",
  ).bind(
    providerKey,
    status,
    detail,
    tokenExpiresAt,
    checkedAt,
    shouldNotifyAdmin ? notificationKey : existing?.last_admin_notification_key ?? "",
    shouldNotifyAdmin ? checkedAt : existing?.last_admin_notified_at ?? null,
    shouldNotifyAdmin ? 1 : 0,
    shouldNotifyAdmin ? 1 : 0,
  ).run();

  return {
    provider_key: providerKey,
    status,
    detail,
    token_expires_at: tokenExpiresAt,
    checked_at: checkedAt,
    notification_key: notificationKey,
    should_notify_admin: shouldNotifyAdmin,
  };
}
