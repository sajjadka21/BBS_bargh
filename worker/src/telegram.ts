import {
  CHANGE_CITY_BUTTON,
  MAIN_MENU_BUTTON,
  MAZANDARAN_BUTTON,
  SEARCH_BUTTON,
  SHOW_ALL_BUTTON,
  cityActionKeyboard,
  cityByKey,
  cityByLabel,
  cityMenuKeyboard,
  mainMenuKeyboard,
} from "./config";
import {
  claimUpdate,
  createNotificationBatch,
  getChatSession,
  getNotificationBatch,
  listCityOutages,
  releaseUpdate,
  searchCityOutages,
  setChatSession,
} from "./database";
import { normalizePersianText, toPersianDigits } from "./persian";
import type {
  Env,
  InlineKeyboardMarkup,
  OutageRow,
  ReplyKeyboardMarkup,
  TelegramCallbackQuery,
  TelegramReplyMarkup,
  TelegramUpdate,
} from "./types";

const TELEGRAM_MESSAGE_LIMIT = 3500;
const RESULTS_PER_MESSAGE = 3;
const TEHRAN_TIME_ZONE = "Asia/Tehran";
const SHOW_NEW_OUTAGES_PREFIX = "show_new:";

type DateParts = { year: number; month: number; day: number };
type TehranNow = DateParts & { minutes: number };
type OutageDisplayStatus = { label: string; emoji: string };

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

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
    return { label: "نامشخص", emoji: "⚪️" };
  }

  const dateOrder = compareDates(rowDate, now);
  if (dateOrder > 0 || (dateOrder === 0 && now.minutes < startMinutes)) {
    return { label: "برنامه‌ریزی‌شده", emoji: "🔵" };
  }

  if (dateOrder < 0) {
    const previousDay = getTehranNowAt(
      new Date(Date.now() - 24 * 60 * 60 * 1000),
    );
    if (
      previousDay &&
      endMinutes !== null &&
      endMinutes <= startMinutes &&
      compareDates(rowDate, previousDay) === 0 &&
      now.minutes < endMinutes
    ) {
      return { label: "در حال انجام", emoji: "🟠" };
    }
    return { label: "برطرف‌شده", emoji: "🟢" };
  }

  if (endMinutes === null || endMinutes <= startMinutes) {
    return { label: "در حال انجام", emoji: "🟠" };
  }

  return now.minutes < endMinutes
    ? { label: "در حال انجام", emoji: "🟠" }
    : { label: "برطرف‌شده", emoji: "🟢" };
}

function getOutageTypeDetails(value: string): {
  typeLabel: string;
  reason: string;
} {
  const [rawType = "", ...reasonParts] = value.split(" - ");
  const normalizedType = rawType.trim();
  const typeLabel =
    normalizedType === "برنامه‌ریزی‌شده"
      ? "با برنامه"
      : normalizedType === "غیرمنتظره"
        ? "بدون برنامه"
        : normalizedType || "نامشخص";
  const reason = reasonParts.join(" - ").trim() || "اعلام نشده";
  return { typeLabel, reason };
}

function parseStoredStringArray(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value || "[]");
    if (!Array.isArray(parsed)) {
      return [];
    }
    return [
      ...new Set(
        parsed
          .filter((item): item is string | number =>
            typeof item === "string" || typeof item === "number",
          )
          .map((item) => String(item).trim())
          .filter(Boolean),
      ),
    ];
  } catch {
    return [];
  }
}

function formatOutage(
  cityLabel: string,
  row: OutageRow,
  position: number,
  total: number,
): string {
  const status = getOutageDisplayStatus(row);
  const details = getOutageTypeDetails(row.outage_type);
  const fromTime = row.from_time || "اعلام نشده";
  const toTime = row.to_time || "اعلام نشده";
  const outageNumbers = parseStoredStringArray(row.outage_numbers);
  const outageNumberText =
    outageNumbers.length > 0
      ? outageNumbers.map((value) => toPersianDigits(value)).join("، ")
      : "اعلام نشده";

  return [
    `⚡️ <b>خاموشی ${toPersianDigits(position)} از ${toPersianDigits(total)}</b>`,
    `🏙 <b>شهر:</b> ${escapeHtml(cityLabel)}`,
    `📍 <b>آدرس:</b> ${escapeHtml(row.address)}`,
    `📅 <b>تاریخ:</b> ${escapeHtml(row.outage_date)}`,
    `🔢 <b>شماره خاموشی:</b> ${escapeHtml(outageNumberText)}`,
    `🕒 <b>زمان:</b> ${escapeHtml(fromTime)} تا ${escapeHtml(toTime)}`,
    `${status.emoji} <b>وضعیت:</b> ${escapeHtml(status.label)}`,
    `📌 <b>نوع:</b> ${escapeHtml(details.typeLabel)}`,
    `📝 <b>علت:</b> ${escapeHtml(details.reason)}`,
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

function chunkBlocks(
  blocks: string[],
  maxLength = TELEGRAM_MESSAGE_LIMIT,
): string[] {
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
  keyboard?: TelegramReplyMarkup,
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
    const header = `${title}\n<b>نتایج ${toPersianDigits(start + 1)} تا ${toPersianDigits(end)} از ${toPersianDigits(rows.length)}</b>`;
    const blocks = pageRows.map((row, index) =>
      formatOutage(cityLabel, row, start + index + 1, rows.length),
    );
    const message = [header, ...blocks].join(
      "\n\n━━━━━━━━━━━━\n\n",
    );
    const pageKeyboard = end === rows.length ? keyboard : undefined;

    if (message.length <= TELEGRAM_MESSAGE_LIMIT) {
      await sendMessage(env, chatId, message, pageKeyboard);
    } else {
      await sendBlocks(env, chatId, [header, ...blocks], pageKeyboard);
    }
  }
}

async function answerCallbackQuery(
  env: Env,
  callbackQueryId: string,
  text?: string,
  showAlert = false,
): Promise<void> {
  await callTelegram(env, "answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    ...(text ? { text } : {}),
    show_alert: showAlert,
  });
}

export async function setTelegramWebhook(
  env: Env,
  webhookUrl: string,
): Promise<unknown> {
  return callTelegram(env, "setWebhook", {
    url: webhookUrl,
    secret_token: env.TELEGRAM_WEBHOOK_SECRET,
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: true,
  });
}

export async function getTelegramWebhookInfo(env: Env): Promise<unknown> {
  return callTelegram(env, "getWebhookInfo", {});
}

export async function notifyNewOutages(
  env: Env,
  cityKey: string,
  cityLabel: string,
  rows: OutageRow[],
): Promise<void> {
  const chatId = env.NOTIFY_CHAT_ID?.trim();
  if (!chatId || rows.length === 0) {
    return;
  }

  const batchId = await createNotificationBatch(env.DB, chatId, cityKey, rows);
  const keyboard: InlineKeyboardMarkup = {
    inline_keyboard: [
      [
        {
          text: "نمایش",
          callback_data: `${SHOW_NEW_OUTAGES_PREFIX}${batchId}`,
        },
      ],
    ],
  };

  const countText =
    rows.length === 1
      ? "یک خاموشی جدید ثبت شد."
      : `${toPersianDigits(rows.length)} خاموشی جدید ثبت شد.`;

  await sendMessage(
    env,
    chatId,
    [
      `⚡️ <b>خاموشی جدید در ${escapeHtml(cityLabel)}</b>`,
      "",
      countText,
      "برای مشاهده جزئیات، دکمه زیر را بزنید.",
    ].join("\n"),
    keyboard,
  );
}

async function handleCallbackQuery(
  env: Env,
  callbackQuery: TelegramCallbackQuery,
): Promise<void> {
  const data = callbackQuery.data?.trim() ?? "";
  const chatId = callbackQuery.message
    ? String(callbackQuery.message.chat.id)
    : null;

  if (!data.startsWith(SHOW_NEW_OUTAGES_PREFIX) || !chatId) {
    await answerCallbackQuery(
      env,
      callbackQuery.id,
      "این دکمه قابل استفاده نیست.",
      true,
    );
    return;
  }

  const batchId = data.slice(SHOW_NEW_OUTAGES_PREFIX.length);
  const batch = await getNotificationBatch(env.DB, batchId);
  if (!batch || batch.chatId !== chatId) {
    await answerCallbackQuery(
      env,
      callbackQuery.id,
      "جزئیات این اعلان دیگر در دسترس نیست.",
      true,
    );
    return;
  }

  const city = cityByKey(batch.cityKey);
  if (!city || batch.rows.length === 0) {
    await answerCallbackQuery(
      env,
      callbackQuery.id,
      "اطلاعات این اعلان کامل نیست.",
      true,
    );
    return;
  }

  await answerCallbackQuery(env, callbackQuery.id, "در حال نمایش جزئیات…");
  await setChatSession(env.DB, chatId, city.key, false);
  await sendOutageResults(
    env,
    chatId,
    city.label,
    batch.rows,
    `⚡️ <b>خاموشی‌های جدید ${escapeHtml(city.label)}</b>`,
    cityActionKeyboard(),
  );
}

async function handleTextMessage(
  env: Env,
  chatId: string,
  text: string,
): Promise<void> {
  if (text === "/start" || text === MAIN_MENU_BUTTON) {
    await setChatSession(env.DB, chatId, null, false);
    await sendMessage(
      env,
      chatId,
      "استان موردنظر را انتخاب کنید:",
      mainMenuKeyboard(),
    );
    return;
  }

  if (text === MAZANDARAN_BUTTON || text === CHANGE_CITY_BUTTON) {
    await setChatSession(env.DB, chatId, null, false);
    await sendMessage(
      env,
      chatId,
      "یکی از شهرهای استان مازندران را انتخاب کنید:",
      cityMenuKeyboard(),
    );
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
      `📋 <b>خاموشی‌های ${escapeHtml(selectedCity.label)}</b>`,
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
    const normalizedSearch = normalizePersianText(text);
    const matches = await searchCityOutages(
      env.DB,
      selectedCity.key,
      normalizedSearch,
    );

    if (matches.length === 0) {
      await sendMessage(
        env,
        chatId,
        `برای «${escapeHtml(normalizedSearch)}» در <b>${escapeHtml(selectedCity.label)}</b> نتیجه‌ای پیدا نشد.`,
        cityActionKeyboard(),
      );
      return;
    }

    await sendOutageResults(
      env,
      chatId,
      selectedCity.label,
      matches,
      `🔎 <b>نتایج جستجوی «${escapeHtml(normalizedSearch)}»</b>`,
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
    "برای شروع، استان مازندران را انتخاب کنید.",
    mainMenuKeyboard(),
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
    if (update.callback_query) {
      await handleCallbackQuery(env, update.callback_query);
      return;
    }

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
