import type { D1Database } from "./types";

export interface SupportFlow {
  telegram_user_id: string;
  chat_id: string;
  state: string;
  amount_text: string;
  updated_at: string;
}

export interface TetherSubmission {
  submission_id: string;
  telegram_user_id: string;
  chat_id: string;
  network: string;
  amount_text: string;
  tx_hash: string;
  status: string;
  admin_note: string;
  created_at: string;
  decided_at: string | null;
}

export async function recordStarSupportPayment(
  db: D1Database,
  input: {
    telegramUserId: string;
    chatId: string;
    amount: number;
    invoicePayload: string;
    telegramChargeId: string;
    providerChargeId: string;
  },
): Promise<boolean> {
  const result = await db.prepare(
    "INSERT OR IGNORE INTO support_payments " +
      "(payment_id, telegram_user_id, chat_id, method, amount, currency, " +
      "invoice_payload, telegram_payment_charge_id, provider_payment_charge_id, status, created_at) " +
      "VALUES (?, ?, ?, 'telegram_stars', ?, 'XTR', ?, ?, ?, 'paid', ?)",
  ).bind(
    crypto.randomUUID().replaceAll("-", ""),
    input.telegramUserId,
    input.chatId,
    input.amount,
    input.invoicePayload,
    input.telegramChargeId,
    input.providerChargeId,
    new Date().toISOString(),
  ).run();
  return (result.meta.changes ?? 0) > 0;
}

export async function getSupportFlow(
  db: D1Database,
  telegramUserId: string,
): Promise<SupportFlow | null> {
  return db.prepare(
    "SELECT telegram_user_id, chat_id, state, amount_text, updated_at " +
      "FROM support_flows WHERE telegram_user_id = ?",
  ).bind(telegramUserId).first<SupportFlow>();
}

export async function setSupportFlow(
  db: D1Database,
  telegramUserId: string,
  chatId: string,
  state: string,
  amountText = "",
): Promise<void> {
  await db.prepare(
    "INSERT INTO support_flows (telegram_user_id, chat_id, state, amount_text, updated_at) " +
      "VALUES (?, ?, ?, ?, ?) ON CONFLICT(telegram_user_id) DO UPDATE SET " +
      "chat_id = excluded.chat_id, state = excluded.state, amount_text = excluded.amount_text, " +
      "updated_at = excluded.updated_at",
  ).bind(telegramUserId, chatId, state, amountText, new Date().toISOString()).run();
}

export async function clearSupportFlow(
  db: D1Database,
  telegramUserId: string,
): Promise<void> {
  await db.prepare("DELETE FROM support_flows WHERE telegram_user_id = ?")
    .bind(telegramUserId).run();
}

export function normalizeTransactionHash(value: string): string {
  return value.trim().replace(/\s+/g, "");
}

export async function createTetherSubmission(
  db: D1Database,
  input: {
    telegramUserId: string;
    chatId: string;
    network: string;
    amountText: string;
    txHash: string;
  },
): Promise<TetherSubmission> {
  const txHash = normalizeTransactionHash(input.txHash);
  if (!/^(?:0x)?[A-Fa-f0-9]{32,100}$/.test(txHash)) {
    throw new Error("هش تراکنش معتبر نیست.");
  }
  const id = crypto.randomUUID().replaceAll("-", "");
  try {
    await db.prepare(
      "INSERT INTO support_tether_submissions " +
        "(submission_id, telegram_user_id, chat_id, network, amount_text, tx_hash, status, created_at) " +
        "VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)",
    ).bind(
      id,
      input.telegramUserId,
      input.chatId,
      input.network,
      input.amountText,
      txHash,
      new Date().toISOString(),
    ).run();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    if (detail.toLowerCase().includes("unique")) {
      throw new Error("این هش تراکنش قبلاً ثبت شده است.");
    }
    throw error;
  }
  const saved = await getTetherSubmission(db, id);
  if (!saved) throw new Error("تراکنش ذخیره نشد.");
  return saved;
}

export async function getTetherSubmission(
  db: D1Database,
  submissionId: string,
): Promise<TetherSubmission | null> {
  return db.prepare(
    "SELECT submission_id, telegram_user_id, chat_id, network, amount_text, tx_hash, " +
      "status, admin_note, created_at, decided_at " +
      "FROM support_tether_submissions WHERE submission_id = ?",
  ).bind(submissionId).first<TetherSubmission>();
}

export async function decideTetherSubmission(
  db: D1Database,
  submissionId: string,
  status: "approved" | "rejected",
): Promise<TetherSubmission> {
  await db.prepare(
    "UPDATE support_tether_submissions SET status = ?, decided_at = ? " +
      "WHERE submission_id = ? AND status = 'pending'",
  ).bind(status, new Date().toISOString(), submissionId).run();
  const saved = await getTetherSubmission(db, submissionId);
  if (!saved) throw new Error("تراکنش پیدا نشد.");
  return saved;
}
