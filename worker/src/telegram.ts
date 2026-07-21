import {
  BACK_BUTTON,
  SEARCH_BUTTON,
  SHOW_ALL_BUTTON,
  cityActionKeyboard,
  cityByKey,
  cityByLabel,
  cityMenuKeyboard,
} from "./config";
import {
  claimUpdate,
  getChatSession,
  listCityOutages,
  releaseUpdate,
  searchCityOutages,
  setChatSession,
} from "./database";
import type {
  Env,
  OutageRow,
  ReplyKeyboardMarkup,
  TelegramUpdate,
} from "./types";

const TELEGRAM_MESSAGE_LIMIT = 3500;

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

const RESULTS_PER_MESSAGE = 3;
const TEHRAN_TIME_ZONE = "Asia/Tehran";

type DateParts = { year: number; month: number; day: number };
type TehranNow = DateParts & { minutes: number };
type OutageDisplayStatus = { label: string; emoji: string };

function normalizeDigits(value: string): string {
  return value
    .replace(/[\u06F0-\u06F9]/g, (digit) =>
      String(digit.charCodeAt(0) - 0x06f0),
    )
    .replace(/[\u0660-\u0669]/g, (digit) =>
      String(digit.charCodeAt(0) - 0x0660),
    );
}

function parseJalaliDate(value: string): DateParts | null {
  const match = normalizeDigits(value.trim()).match(
    /^(\d{3,4})\/(\d{1,2})\/(\d{1,2})$/,
  );
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (
    !Number.isInteger(year) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return null;
  }
  return { year, month, day };
}

function parseTimeMinutes(value: string): number | null {
  const match = normalizeDigits(value.trim()).match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    return null;
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null;
  }
  return hour * 60 + minute;
}

function getTehranNowAt(date: Date): TehranNow | null {
  const parts = new Intl.DateTimeFormat("en-US-u-ca-persian-nu-latn", {
    timeZone: TEHRAN_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const values = new Map(parts.map((part) => [part.type, part.value]));
  const year = Number(values.get("year"));
  const month = Number(values.get("month"));
  const day = Number(values.get("day"));
  const hour = Number(values.get("hour"));
  const minute = Number(values.get("minute"));
  if (![year, month, day, hour, minute].every(Number.isFinite)) {
    return null;
  }
  return { year, month, day, minutes: hour * 60 + minute };
}

function getTehranNow(): TehranNow | null {
  return getTehranNowAt(new Date());
}

function compareDates(left: DateParts, right: DateParts): number {
  return (
    left.year - right.year || left.month - right.month || left.day - right.day
  );
}

function getOutageDisplayStatus(row: OutageRow): OutageDisplayStatus {
  const rowDate = parseJalaliDate(row.outage_date);
  const startMinutes = parseTimeMinutes(row.from_time);
  const endMinutes = parseTimeMinutes(row.to_time);
  const now = getTehranNow();

  if (!rowDate || startMinutes === null || !now) {
    return { label: "\u0646\u0627\u0645\u0634\u062e\u0635", emoji: "\u26aa\ufe0f" };
  }

  const dateOrder = compareDates(rowDate, now);
  if (dateOrder > 0 || (dateOrder === 0 && now.minutes < startMinutes)) {
    return {
      label: "\u0628\u0631\u0646\u0627\u0645\u0647\u200c\u0631\u06cc\u0632\u06cc\u200c\u0634\u062f\u0647",
      emoji: "\u{1F535}",
    };
  }

  if (dateOrder < 0) {
    const previousDay = getTehranNowAt(new Date(Date.now() - 24 * 60 * 60 * 1000));
    if (
      previousDay &&
      endMinutes !== null &&
      endMinutes <= startMinutes &&
      compareDates(rowDate, previousDay) === 0 &&
      now.minutes < endMinutes
    ) {
      return { label: "\u062f\u0631 \u062d\u0627\u0644 \u0627\u0646\u062c\u0627\u0645", emoji: "\u{1F7E0}" };
    }
    return { label: "\u0628\u0631\u0637\u0631\u0641\u200c\u0634\u062f\u0647", emoji: "\u{1F7E2}" };
  }

  if (endMinutes === null || endMinutes <= startMinutes) {
    return { label: "\u062f\u0631 \u062d\u0627\u0644 \u0627\u0646\u062c\u0627\u0645", emoji: "\u{1F7E0}" };
  }

  return now.minutes < endMinutes
    ? { label: "\u062f\u0631 \u062d\u0627\u0644 \u0627\u0646\u062c\u0627\u0645", emoji: "\u{1F7E0}" }
    : { label: "\u0628\u0631\u0637\u0631\u0641\u200c\u0634\u062f\u0647", emoji: "\u{1F7E2}" };
}

function getOutageTypeDetails(value: string): {
  typeLabel: string;
  reason: string;
} {
  const [rawType = "", ...reasonParts] = value.split(" - ");
  const normalizedType = rawType.trim();
  const typeLabel =
    normalizedType ===
    "\u0628\u0631\u0646\u0627\u0645\u0647\u200c\u0631\u06cc\u0632\u06cc\u200c\u0634\u062f\u0647"
      ? "\u0628\u0627 \u0628\u0631\u0646\u0627\u0645\u0647"
      : normalizedType === "\u063a\u06cc\u0631\u0645\u0646\u062a\u0638\u0631\u0647"
        ? "\u0628\u062f\u0648\u0646 \u0628\u0631\u0646\u0627\u0645\u0647"
        : normalizedType || "\u0646\u0627\u0645\u0634\u062e\u0635";
  const reason =
    reasonParts.join(" - ").trim() ||
    "\u0627\u0639\u0644\u0627\u0645 \u0646\u0634\u062f\u0647";
  return { typeLabel, reason };
}

function formatOutage(
  cityLabel: string,
  row: OutageRow,
  position: number,
  total: number,
): string {
  const status = getOutageDisplayStatus(row);
  const details = getOutageTypeDetails(row.outage_type);
  const fromTime =
    row.from_time || "\u0627\u0639\u0644\u0627\u0645 \u0646\u0634\u062f\u0647";
  const toTime =
    row.to_time || "\u0627\u0639\u0644\u0627\u0645 \u0646\u0634\u062f\u0647";

  return [
    `\u26a1\ufe0f <b>\u062e\u0627\u0645\u0648\u0634\u06cc ${position} \u0627\u0632 ${total}</b>`,
    `\u{1F3D9} <b>\u0634\u0647\u0631:</b> ${escapeHtml(cityLabel)}`,
    `\u{1F4CD} <b>\u0622\u062f\u0631\u0633:</b> ${escapeHtml(row.address)}`,
    `\u{1F4C5} <b>\u062a\u0627\u0631\u06cc\u062e:</b> ${escapeHtml(row.outage_date)}`,
    `\u{1F552} <b>\u0632\u0645\u0627\u0646:</b> ${escapeHtml(fromTime)} \u062a\u0627 ${escapeHtml(toTime)}`,
    `${status.emoji} <b>\u0648\u0636\u0639\u06cc\u062a:</b> ${escapeHtml(status.label)}`,
    `\u{1F4CC} <b>\u0646\u0648\u0639:</b> ${escapeHtml(details.typeLabel)}`,
    `\u{1F4DD} <b>\u0639\u0644\u062a:</b> ${escapeHtml(details.reason)}`,
  ].join("\n");
}

function splitLongBlock(block: string, maxLength: number): string[] {
  if (block.length <= maxLength) {
    return [block];
  }

  const chunks: string[] = [];
  for (let start = 0; start < block.length; start += maxLength) {
    chunks.push(block.slice(start, start + maxLength));
  }
  return chunks;
}

function chunkBlocks(blocks: string[], maxLength = TELEGRAM_MESSAGE_LIMIT): string[] {
  const expanded = blocks.flatMap((block) => splitLongBlock(block, maxLength));
  const chunks: string[] = [];
  let current = "";

  for (const block of expanded) {
    const candidate = current ? `${current}\n\n${block}` : block;
    if (candidate.length > maxLength && current) {
      chunks.push(current);
      current = block;
    } else {
      current = candidate;
    }
  }

  if (current) {
    chunks.push(current);
  }
  return chunks.length > 0 ? chunks : [""];
}

async function callTelegram(
  env: Env,
  method: string,
  payload: Record<string, unknown>,
): Promise<unknown> {
  const response = await fetch(
    `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`,
    {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify(payload),
    },
  );

  const body = (await response.json()) as {
    ok?: boolean;
    description?: string;
    result?: unknown;
  };
  if (!response.ok || !body.ok) {
    throw new Error(
      `Telegram ${method} failed (${response.status}): ${body.description ?? "unknown error"}`,
    );
  }
  return body.result;
}

export async function sendMessage(
  env: Env,
  chatId: string,
  text: string,
  keyboard?: ReplyKeyboardMarkup,
): Promise<void> {
  await callTelegram(env, "sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...(keyboard ? { reply_markup: keyboard } : {}),
  });
}

export async function sendBlocks(
  env: Env,
  chatId: string,
  blocks: string[],
  keyboard?: ReplyKeyboardMarkup,
): Promise<void> {
  const chunks = chunkBlocks(blocks);
  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index];
    if (chunk === undefined) {
      continue;
    }
    await sendMessage(
      env,
      chatId,
      chunk,
      index === chunks.length - 1 ? keyboard : undefined,
    );
  }
}

async function sendOutageResults(
  env: Env,
  chatId: string,
  cityLabel: string,
  rows: OutageRow[],
  title: string,
  keyboard?: ReplyKeyboardMarkup,
): Promise<void> {
  for (let start = 0; start < rows.length; start += RESULTS_PER_MESSAGE) {
    const pageRows = rows.slice(start, start + RESULTS_PER_MESSAGE);
    const end = start + pageRows.length;
    const header = `${title}\n<b>\u0646\u062a\u0627\u06cc\u062c ${start + 1} \u062a\u0627 ${end} \u0627\u0632 ${rows.length}</b>`;
    const blocks = pageRows.map((row, index) =>
      formatOutage(cityLabel, row, start + index + 1, rows.length),
    );
    const message = [header, ...blocks].join(
      "\n\n\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n\n",
    );
    const pageKeyboard = end === rows.length ? keyboard : undefined;

    if (message.length <= TELEGRAM_MESSAGE_LIMIT) {
      await sendMessage(env, chatId, message, pageKeyboard);
    } else {
      await sendBlocks(env, chatId, [header, ...blocks], pageKeyboard);
    }
  }
}

export async function setTelegramWebhook(
  env: Env,
  webhookUrl: string,
): Promise<unknown> {
  return callTelegram(env, "setWebhook", {
    url: webhookUrl,
    secret_token: env.TELEGRAM_WEBHOOK_SECRET,
    allowed_updates: ["message"],
    drop_pending_updates: true,
  });
}

export async function getTelegramWebhookInfo(env: Env): Promise<unknown> {
  return callTelegram(env, "getWebhookInfo", {});
}

export async function notifyNewOutages(
  env: Env,
  cityLabel: string,
  rows: OutageRow[],
): Promise<void> {
  const chatId = env.NOTIFY_CHAT_ID?.trim();
  if (!chatId || rows.length === 0) {
    return;
  }

  await sendOutageResults(
    env,
    chatId,
    cityLabel,
    rows,
    `\u26a1\ufe0f <b>${rows.length} \u062e\u0627\u0645\u0648\u0634\u06cc \u062c\u062f\u06cc\u062f \u062f\u0631 ${escapeHtml(cityLabel)}</b>`,
  );
}

async function handleTextMessage(
  env: Env,
  chatId: string,
  text: string,
): Promise<void> {
  if (text === "/start" || text === BACK_BUTTON) {
    await setChatSession(env.DB, chatId, null, false);
    await sendMessage(env, chatId, "یک شهر را انتخاب کنید:", cityMenuKeyboard());
    return;
  }

  const selectedByLabel = cityByLabel(text);
  if (selectedByLabel) {
    await setChatSession(env.DB, chatId, selectedByLabel.key, false);
    await sendMessage(
      env,
      chatId,
      `برای <b>${escapeHtml(selectedByLabel.label)}</b> چه کاری انجام دهم؟`,
      cityActionKeyboard(),
    );
    return;
  }

  const session = await getChatSession(env.DB, chatId);
  const selectedCity = cityByKey(session?.selected_city);

  if (text === SHOW_ALL_BUTTON) {
    if (!selectedCity) {
      await sendMessage(
        env,
        chatId,
        "ابتدا یک شهر را انتخاب کنید.",
        cityMenuKeyboard(),
      );
      return;
    }

    const rows = await listCityOutages(env.DB, selectedCity.key);
    if (rows.length === 0) {
      await sendMessage(
        env,
        chatId,
        `در آخرین به‌روزرسانی، خاموشی‌ای برای <b>${escapeHtml(selectedCity.label)}</b> ثبت نشده است.`,
        cityActionKeyboard(),
      );
      return;
    }

    await sendOutageResults(
      env,
      chatId,
      selectedCity.label,
      rows,
      `\u{1F4CB} <b>\u062e\u0627\u0645\u0648\u0634\u06cc\u200c\u0647\u0627\u06cc ${escapeHtml(selectedCity.label)}</b>`,
      cityActionKeyboard(),
    );
    return;
  }

  if (text === SEARCH_BUTTON) {
    if (!selectedCity) {
      await sendMessage(
        env,
        chatId,
        "ابتدا یک شهر را انتخاب کنید.",
        cityMenuKeyboard(),
      );
      return;
    }

    await setChatSession(env.DB, chatId, selectedCity.key, true);
    await sendMessage(
      env,
      chatId,
      `عبارت موردنظر در آدرس‌های <b>${escapeHtml(selectedCity.label)}</b> را ارسال کنید.`,
    );
    return;
  }

  if (session?.awaiting_search === 1 && selectedCity) {
    await setChatSession(env.DB, chatId, selectedCity.key, false);
    const matches = await searchCityOutages(env.DB, selectedCity.key, text);

    if (matches.length === 0) {
      await sendMessage(
        env,
        chatId,
        `برای «${escapeHtml(text)}» در <b>${escapeHtml(selectedCity.label)}</b> نتیجه‌ای پیدا نشد.`,
        cityActionKeyboard(),
      );
      return;
    }

    await sendOutageResults(
      env,
      chatId,
      selectedCity.label,
      matches,
      `\u{1F50E} <b>\u0646\u062a\u0627\u06cc\u062c \u062c\u0633\u062a\u062c\u0648\u06cc \u00ab${escapeHtml(text)}\u00bb</b>`,
      cityActionKeyboard(),
    );
    return;
  }

  if (selectedCity) {
    await sendMessage(
      env,
      chatId,
      "یکی از گزینه‌های زیر را انتخاب کنید.",
      cityActionKeyboard(),
    );
    return;
  }

  await sendMessage(
    env,
    chatId,
    "برای شروع، یک شهر را انتخاب کنید.",
    cityMenuKeyboard(),
  );
}

export async function handleTelegramUpdate(
  env: Env,
  update: TelegramUpdate,
): Promise<void> {
  if (!Number.isInteger(update.update_id)) {
    throw new Error("Telegram update_id is missing or invalid.");
  }

  const claimed = await claimUpdate(env.DB, update.update_id);
  if (!claimed) {
    return;
  }

  try {
    const message = update.message;
    if (!message) {
      return;
    }

    const text = message.text?.trim();
    if (!text) {
      return;
    }

    await handleTextMessage(env, String(message.chat.id), text);
  } catch (error) {
    await releaseUpdate(env.DB, update.update_id);
    throw error;
  }
}
