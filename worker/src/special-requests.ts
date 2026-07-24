import type { D1Database, Env } from "./types";

export interface SpecialLookupFlow {
  telegram_user_id: string;
  chat_id: string;
  state: string;
  province: string;
  county: string;
  request_label: string;
  bill_id_ciphertext: string;
  bill_id_hash: string;
  bill_id_last4: string;
  updated_at: string;
}

export interface SpecialLookupRequest {
  request_id: string;
  telegram_user_id: string;
  chat_id: string;
  province: string;
  county: string;
  request_label: string;
  bill_id_ciphertext: string;
  bill_id_hash: string;
  bill_id_last4: string;
  status: string;
  admin_note: string;
  provider_key: string;
  created_at: string;
  updated_at: string;
  decided_at: string | null;
  reminder_minutes: number;
  last_fetched_at: string | null;
  last_fetch_status: string;
  last_error: string;
}

function normalizeDigits(value: string): string {
  return value
    .replace(/[\u06F0-\u06F9]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0))
    .replace(/[\u0660-\u0669]/g, (digit) => String(digit.charCodeAt(0) - 0x0660));
}

export function normalizeBillId(value: string): string {
  return normalizeDigits(value).replace(/\D+/g, "");
}

export function maskBillId(last4: string): string {
  return `*********${last4}`;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function deriveKey(secret: string): Promise<CryptoKey> {
  if (secret.trim().length < 24) {
    throw new Error("BILL_ID_ENCRYPTION_KEY باید حداقل ۲۴ نویسه باشد.");
  }
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(secret),
  );
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function hashBillId(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function protectBillId(
  env: Env,
  rawBillId: string,
): Promise<{ ciphertext: string; hash: string; last4: string }> {
  const normalized = normalizeBillId(rawBillId);
  if (normalized.length < 8 || normalized.length > 30) {
    throw new Error("شناسه قبض باید فقط عدد و بین ۸ تا ۳۰ رقم باشد.");
  }
  const secret = env.BILL_ID_ENCRYPTION_KEY?.trim();
  if (!secret) throw new Error("Secret BILL_ID_ENCRYPTION_KEY تنظیم نشده است.");
  const key = await deriveKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      new TextEncoder().encode(normalized),
    ),
  );
  const packed = new Uint8Array(iv.length + encrypted.length);
  packed.set(iv, 0);
  packed.set(encrypted, iv.length);
  return {
    ciphertext: bytesToBase64(packed),
    hash: await hashBillId(normalized),
    last4: normalized.slice(-4),
  };
}

export async function revealBillId(env: Env, ciphertext: string): Promise<string> {
  const secret = env.BILL_ID_ENCRYPTION_KEY?.trim();
  if (!secret) throw new Error("Secret BILL_ID_ENCRYPTION_KEY تنظیم نشده است.");
  const packed = base64ToBytes(ciphertext);
  if (packed.length < 29) throw new Error("داده رمز‌شده نامعتبر است.");
  const key = await deriveKey(secret);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: packed.slice(0, 12) },
    key,
    packed.slice(12),
  );
  return new TextDecoder().decode(decrypted);
}

export async function getSpecialLookupFlow(
  db: D1Database,
  telegramUserId: string,
): Promise<SpecialLookupFlow | null> {
  return db.prepare(
    "SELECT telegram_user_id, chat_id, state, province, county, request_label, " +
      "bill_id_ciphertext, bill_id_hash, bill_id_last4, updated_at " +
      "FROM special_lookup_flows WHERE telegram_user_id = ?",
  ).bind(telegramUserId).first<SpecialLookupFlow>();
}

export async function setSpecialLookupFlow(
  db: D1Database,
  telegramUserId: string,
  chatId: string,
  state: string,
  fields: Partial<Pick<SpecialLookupFlow,
    "province" | "county" | "request_label" | "bill_id_ciphertext" | "bill_id_hash" | "bill_id_last4">> = {},
): Promise<void> {
  const current = await getSpecialLookupFlow(db, telegramUserId);
  await db.prepare(
    "INSERT INTO special_lookup_flows " +
      "(telegram_user_id, chat_id, state, province, county, request_label, " +
      "bill_id_ciphertext, bill_id_hash, bill_id_last4, updated_at) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) " +
      "ON CONFLICT(telegram_user_id) DO UPDATE SET chat_id = excluded.chat_id, " +
      "state = excluded.state, province = excluded.province, county = excluded.county, " +
      "request_label = excluded.request_label, bill_id_ciphertext = excluded.bill_id_ciphertext, " +
      "bill_id_hash = excluded.bill_id_hash, bill_id_last4 = excluded.bill_id_last4, " +
      "updated_at = excluded.updated_at",
  ).bind(
    telegramUserId,
    chatId,
    state,
    fields.province ?? current?.province ?? "",
    fields.county ?? current?.county ?? "",
    fields.request_label ?? current?.request_label ?? "",
    fields.bill_id_ciphertext ?? current?.bill_id_ciphertext ?? "",
    fields.bill_id_hash ?? current?.bill_id_hash ?? "",
    fields.bill_id_last4 ?? current?.bill_id_last4 ?? "",
    new Date().toISOString(),
  ).run();
}

export async function clearSpecialLookupFlow(
  db: D1Database,
  telegramUserId: string,
): Promise<void> {
  await db.prepare("DELETE FROM special_lookup_flows WHERE telegram_user_id = ?")
    .bind(telegramUserId).run();
}

export async function createSpecialLookupRequest(
  db: D1Database,
  flow: SpecialLookupFlow,
): Promise<SpecialLookupRequest> {
  const requestId = crypto.randomUUID().replaceAll("-", "");
  const now = new Date().toISOString();
  try {
    await db.prepare(
      "INSERT INTO special_lookup_requests " +
        "(request_id, telegram_user_id, chat_id, province, county, request_label, " +
        "bill_id_ciphertext, bill_id_hash, bill_id_last4, status, created_at, updated_at) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)",
    ).bind(
      requestId,
      flow.telegram_user_id,
      flow.chat_id,
      flow.province,
      flow.county,
      flow.request_label,
      flow.bill_id_ciphertext,
      flow.bill_id_hash,
      flow.bill_id_last4,
      now,
      now,
    ).run();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    if (detail.toLowerCase().includes("unique")) {
      throw new Error("برای این شناسه قبض قبلاً یک درخواست فعال یا در انتظار ثبت شده است.");
    }
    throw error;
  }
  const saved = await getSpecialLookupRequest(db, requestId);
  if (!saved) throw new Error("درخواست ذخیره نشد.");
  return saved;
}

export async function getSpecialLookupRequest(
  db: D1Database,
  requestId: string,
): Promise<SpecialLookupRequest | null> {
  return db.prepare(
    "SELECT request_id, telegram_user_id, chat_id, province, county, request_label, " +
      "bill_id_ciphertext, bill_id_hash, bill_id_last4, status, admin_note, " +
      "provider_key, created_at, updated_at, decided_at, reminder_minutes, " +
      "last_fetched_at, last_fetch_status, last_error " +
      "FROM special_lookup_requests WHERE request_id = ?",
  ).bind(requestId).first<SpecialLookupRequest>();
}

export async function listSpecialLookupRequests(
  db: D1Database,
  status = "pending",
  limit = 50,
): Promise<SpecialLookupRequest[]> {
  const result = await db.prepare(
    "SELECT request_id, telegram_user_id, chat_id, province, county, request_label, " +
      "bill_id_ciphertext, bill_id_hash, bill_id_last4, status, admin_note, " +
      "provider_key, created_at, updated_at, decided_at, reminder_minutes, " +
      "last_fetched_at, last_fetch_status, last_error " +
      "FROM special_lookup_requests WHERE status = ? ORDER BY created_at DESC LIMIT ?",
  ).bind(status, limit).all<SpecialLookupRequest>();
  return result.results;
}

export async function listUserSpecialLookupRequests(
  db: D1Database,
  telegramUserId: string,
  limit = 10,
): Promise<SpecialLookupRequest[]> {
  const result = await db.prepare(
    "SELECT request_id, telegram_user_id, chat_id, province, county, request_label, " +
      "bill_id_ciphertext, bill_id_hash, bill_id_last4, status, admin_note, " +
      "provider_key, created_at, updated_at, decided_at, reminder_minutes, " +
      "last_fetched_at, last_fetch_status, last_error " +
      "FROM special_lookup_requests WHERE telegram_user_id = ? " +
      "ORDER BY created_at DESC LIMIT ?",
  ).bind(telegramUserId, limit).all<SpecialLookupRequest>();
  return result.results;
}

export async function decideSpecialLookupRequest(
  db: D1Database,
  requestId: string,
  status: "active" | "rejected",
  adminNote = "",
): Promise<SpecialLookupRequest> {
  const now = new Date().toISOString();
  await db.prepare(
    "UPDATE special_lookup_requests SET status = ?, admin_note = ?, updated_at = ?, " +
      "decided_at = ? WHERE request_id = ? AND status = 'pending'",
  ).bind(status, adminNote.slice(0, 500), now, now, requestId).run();
  const saved = await getSpecialLookupRequest(db, requestId);
  if (!saved) throw new Error("درخواست پیدا نشد.");
  return saved;
}
