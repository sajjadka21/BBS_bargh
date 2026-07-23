import {
  CANCEL_BUTTON,
  CHANGE_CITY_BUTTON,
  CONFIRM_DELETE_BUTTON,
  DELETE_PERSONAL_OUTAGE_BUTTON,
  EDIT_PERSONAL_OUTAGE_BUTTON,
  MAIN_MENU_BUTTON,
  MAZANDARAN_BUTTON,
  PERSONAL_ADDRESS_MODE_BUTTON,
  PERSONAL_NUMBER_MODE_BUTTON,
  PERSONAL_OUTAGE_BUTTON,
  SEARCH_BUTTON,
  SHOW_ALL_BUTTON,
  cityActionKeyboard,
  cityByKey,
  cityByLabel,
  cityMenuKeyboard,
  deleteConfirmationKeyboard,
  mainMenuKeyboard,
  personalizationCityKeyboard,
  personalizationModeKeyboard,
  personalizationProfileKeyboard,
} from "./config";
import {
  authorizeTelegramUser,
  claimUpdate,
  clearPersonalizationFlow,
  createNotificationBatch,
  deletePersonalOutageProfile,
  getChatSession,
  getNotificationBatch,
  getPersonalOutageProfile,
  getPersonalizationFlow,
  getTelegramUser,
  listCityOutages,
  recordPasswordFailure,
  releaseUpdate,
  savePersonalOutageProfile,
  searchCityOutages,
  setChatSession,
  setPersonalizationFlow,
  upsertTelegramUser,
} from "./database";
import { normalizePersianText, toPersianDigits } from "./persian";
import type {
  Env,
  InlineKeyboardMarkup,
  OutageRow,
  PersonalMatchMode,
  PersonalOutageProfile,
  PersonalizationFlow,
  ReplyKeyboardMarkup,
  TelegramCallbackQuery,
  TelegramMessage,
  TelegramReplyMarkup,
  TelegramUpdate,
  TelegramUser,
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

const PASSWORD_WINDOW_MINUTES = 15;
const PERSONALIZATION_FLOW_PASSWORD = "awaiting_password";
const PERSONALIZATION_FLOW_CITY = "choosing_city";
const PERSONALIZATION_FLOW_MODE = "choosing_mode";
const PERSONALIZATION_FLOW_VALUE = "awaiting_value";
const PERSONALIZATION_FLOW_DELETE = "confirm_delete";

function secureTextEquals(left: string, right: string): boolean {
  const encoder = new TextEncoder();
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  const length = Math.max(leftBytes.length, rightBytes.length);
  let difference = leftBytes.length ^ rightBytes.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }
  return difference === 0;
}

function normalizeOutageNumber(value: string): string {
  return value
    .replace(/[\u06F0-\u06F9]/g, (digit) =>
      String(digit.charCodeAt(0) - 0x06f0),
    )
    .replace(/[\u0660-\u0669]/g, (digit) =>
      String(digit.charCodeAt(0) - 0x0660),
    )
    .replace(/\s+/g, "")
    .trim();
}

function isPrivateConversation(message: TelegramMessage, user: TelegramUser): boolean {
  return (
    message.chat.type === "private" ||
    (message.chat.type === undefined && String(message.chat.id) === String(user.id))
  );
}

function activeLockMinutes(lockedUntil: string | null): number {
  if (!lockedUntil) {
    return 0;
  }
  const remaining = Date.parse(lockedUntil) - Date.now();
  return remaining > 0 ? Math.max(1, Math.ceil(remaining / 60000)) : 0;
}

async function beginPersonalizationSetup(
  env: Env,
  chatId: string,
  telegramUserId: string,
): Promise<void> {
  await setPersonalizationFlow(
    env.DB,
    telegramUserId,
    chatId,
    PERSONALIZATION_FLOW_CITY,
    null,
    null,
  );
  await sendMessage(
    env,
    chatId,
    "شهر مربوط به <b>خاموشی من</b> را انتخاب کنید:",
    personalizationCityKeyboard(),
  );
}

function profileModeLabel(mode: PersonalMatchMode): string {
  return mode === "outage_number" ? "شماره خاموشی" : "کلمه آدرس";
}

async function findPersonalMatches(
  env: Env,
  profile: PersonalOutageProfile,
): Promise<OutageRow[]> {
  if (profile.match_mode === "address_keyword") {
    return searchCityOutages(env.DB, profile.city_key, profile.match_value);
  }

  const expectedNumber = normalizeOutageNumber(profile.match_value);
  const rows = await listCityOutages(env.DB, profile.city_key);
  return rows.filter((row) =>
    parseStoredStringArray(row.outage_numbers).some(
      (number) => normalizeOutageNumber(number) === expectedNumber,
    ),
  );
}

async function showPersonalOutage(
  env: Env,
  chatId: string,
  profile: PersonalOutageProfile,
): Promise<void> {
  const city = cityByKey(profile.city_key);
  if (!city) {
    await sendMessage(
      env,
      chatId,
      "شهر ذخیره‌شده دیگر معتبر نیست. تنظیم «خاموشی من» را ویرایش کنید.",
      personalizationProfileKeyboard(),
    );
    return;
  }

  const modeLabel = profileModeLabel(profile.match_mode);
  const displayValue =
    profile.match_mode === "outage_number"
      ? toPersianDigits(profile.match_value)
      : profile.match_value;
  const rows = await findPersonalMatches(env, profile);

  if (rows.length === 0) {
    await sendMessage(
      env,
      chatId,
      [
        "⚡️ <b>خاموشی من</b>",
        `🏙 <b>شهر:</b> ${escapeHtml(city.label)}`,
        `🔎 <b>روش:</b> ${escapeHtml(modeLabel)}`,
        `🧩 <b>مقدار:</b> ${escapeHtml(displayValue)}`,
        "",
        "در فهرست فعال فعلی، خاموشی مطابق این تنظیم پیدا نشد.",
      ].join("\n"),
      personalizationProfileKeyboard(),
    );
    return;
  }

  await sendOutageResults(
    env,
    chatId,
    city.label,
    rows,
    [
      "⚡️ <b>خاموشی من</b>",
      `<b>${escapeHtml(modeLabel)}:</b> ${escapeHtml(displayValue)}`,
    ].join("\n"),
    personalizationProfileKeyboard(),
  );
}

async function ensureAuthorizedUser(
  env: Env,
  chatId: string,
  telegramUserId: string,
): Promise<boolean> {
  const user = await getTelegramUser(env.DB, telegramUserId);
  if (user?.is_authorized === 1) {
    return true;
  }

  const lockMinutes = activeLockMinutes(user?.locked_until ?? null);
  if (lockMinutes > 0) {
    await sendMessage(
      env,
      chatId,
      `به‌دلیل چند تلاش ناموفق، ورود موقتاً قفل است. حدود ${toPersianDigits(lockMinutes)} دقیقه دیگر دوباره امتحان کنید.`,
      mainMenuKeyboard(),
    );
    return false;
  }

  const configuredPassword = env.PERSONALIZATION_PASSWORD?.trim() ?? "";
  if (!configuredPassword) {
    await sendMessage(
      env,
      chatId,
      "قابلیت «خاموشی من» هنوز توسط مدیر فعال نشده است.",
      mainMenuKeyboard(),
    );
    return false;
  }

  await setPersonalizationFlow(
    env.DB,
    telegramUserId,
    chatId,
    PERSONALIZATION_FLOW_PASSWORD,
    null,
    null,
  );
  await sendMessage(
    env,
    chatId,
    "برای فعال‌سازی «خاموشی من»، رمز مشترک را ارسال کنید. رمز را فقط در گفت‌وگوی خصوصی با ربات وارد کنید.",
  );
  return false;
}

async function openPersonalOutage(
  env: Env,
  message: TelegramMessage,
  telegramUser: TelegramUser,
): Promise<void> {
  const chatId = String(message.chat.id);
  const telegramUserId = String(telegramUser.id);

  if (!isPrivateConversation(message, telegramUser)) {
    await sendMessage(
      env,
      chatId,
      "برای حفظ امنیت، «خاموشی من» فقط در گفت‌وگوی خصوصی با ربات قابل استفاده است.",
    );
    return;
  }

  const authorized = await ensureAuthorizedUser(env, chatId, telegramUserId);
  if (!authorized) {
    return;
  }

  await clearPersonalizationFlow(env.DB, telegramUserId);
  const profile = await getPersonalOutageProfile(env.DB, telegramUserId);
  if (!profile) {
    await beginPersonalizationSetup(env, chatId, telegramUserId);
    return;
  }
  await showPersonalOutage(env, chatId, profile);
}

async function handlePersonalizationFlow(
  env: Env,
  message: TelegramMessage,
  telegramUser: TelegramUser,
  text: string,
  flow: PersonalizationFlow,
): Promise<boolean> {
  const chatId = String(message.chat.id);
  const telegramUserId = String(telegramUser.id);

  if (text === CANCEL_BUTTON) {
    await clearPersonalizationFlow(env.DB, telegramUserId);
    await sendMessage(env, chatId, "عملیات لغو شد.", mainMenuKeyboard());
    return true;
  }

  if (flow.state === PERSONALIZATION_FLOW_PASSWORD) {
    const user = await getTelegramUser(env.DB, telegramUserId);
    const lockMinutes = activeLockMinutes(user?.locked_until ?? null);
    if (lockMinutes > 0) {
      await clearPersonalizationFlow(env.DB, telegramUserId);
      await sendMessage(
        env,
        chatId,
        `ورود موقتاً قفل است. حدود ${toPersianDigits(lockMinutes)} دقیقه دیگر دوباره امتحان کنید.`,
        mainMenuKeyboard(),
      );
      return true;
    }

    const expectedPassword = env.PERSONALIZATION_PASSWORD?.trim() ?? "";
    if (expectedPassword && secureTextEquals(text, expectedPassword)) {
      await authorizeTelegramUser(env.DB, telegramUserId);
      await beginPersonalizationSetup(env, chatId, telegramUserId);
      return true;
    }

    const failure = await recordPasswordFailure(env.DB, telegramUserId);
    if (failure.lockedUntil) {
      await clearPersonalizationFlow(env.DB, telegramUserId);
      await sendMessage(
        env,
        chatId,
        `رمز نادرست بود. پس از ${toPersianDigits(PASSWORD_WINDOW_MINUTES)} دقیقه می‌توانید دوباره تلاش کنید.`,
        mainMenuKeyboard(),
      );
      return true;
    }

    const remaining = Math.max(0, 5 - failure.attempts);
    await sendMessage(
      env,
      chatId,
      `رمز نادرست است. ${toPersianDigits(remaining)} تلاش دیگر در این بازه باقی مانده است.`,
    );
    return true;
  }

  const authorized = await ensureAuthorizedUser(env, chatId, telegramUserId);
  if (!authorized) {
    return true;
  }

  if (flow.state === PERSONALIZATION_FLOW_CITY) {
    const city = cityByLabel(text);
    if (!city) {
      await sendMessage(
        env,
        chatId,
        "یکی از شهرهای فهرست را انتخاب کنید.",
        personalizationCityKeyboard(),
      );
      return true;
    }
    await setPersonalizationFlow(
      env.DB,
      telegramUserId,
      chatId,
      PERSONALIZATION_FLOW_MODE,
      city.key,
      null,
    );
    await sendMessage(
      env,
      chatId,
      `روش پیدا کردن خاموشی در <b>${escapeHtml(city.label)}</b> را انتخاب کنید:`,
      personalizationModeKeyboard(),
    );
    return true;
  }

  if (flow.state === PERSONALIZATION_FLOW_MODE) {
    let mode: PersonalMatchMode | null = null;
    if (text === PERSONAL_NUMBER_MODE_BUTTON) {
      mode = "outage_number";
    } else if (text === PERSONAL_ADDRESS_MODE_BUTTON) {
      mode = "address_keyword";
    }

    if (!mode || !flow.city_key) {
      await sendMessage(
        env,
        chatId,
        "یکی از دو روش نمایش‌داده‌شده را انتخاب کنید.",
        personalizationModeKeyboard(),
      );
      return true;
    }

    await setPersonalizationFlow(
      env.DB,
      telegramUserId,
      chatId,
      PERSONALIZATION_FLOW_VALUE,
      flow.city_key,
      mode,
    );
    await sendMessage(
      env,
      chatId,
      mode === "outage_number"
        ? "شماره خاموشی را دقیق وارد کنید. ارقام فارسی یا انگلیسی پذیرفته می‌شوند."
        : "بخشی از آدرس را وارد کنید؛ مثلاً نام خیابان، روستا یا محله.",
    );
    return true;
  }

  if (flow.state === PERSONALIZATION_FLOW_VALUE) {
    if (!flow.city_key || !flow.match_mode || !cityByKey(flow.city_key)) {
      await clearPersonalizationFlow(env.DB, telegramUserId);
      await sendMessage(
        env,
        chatId,
        "اطلاعات این مرحله ناقص بود. دوباره «خاموشی من» را انتخاب کنید.",
        mainMenuKeyboard(),
      );
      return true;
    }

    let matchValue = "";
    if (flow.match_mode === "outage_number") {
      matchValue = normalizeOutageNumber(text);
      if (!/^\d{3,50}$/.test(matchValue)) {
        await sendMessage(
          env,
          chatId,
          "شماره خاموشی باید فقط شامل ۳ تا ۵۰ رقم باشد. دوباره ارسال کنید.",
        );
        return true;
      }
    } else {
      matchValue = normalizePersianText(text);
      if (matchValue.length < 2 || matchValue.length > 100) {
        await sendMessage(
          env,
          chatId,
          "کلمه آدرس باید بین ۲ تا ۱۰۰ نویسه باشد. دوباره ارسال کنید.",
        );
        return true;
      }
    }

    await savePersonalOutageProfile(
      env.DB,
      telegramUserId,
      flow.city_key,
      flow.match_mode,
      matchValue,
    );
    await clearPersonalizationFlow(env.DB, telegramUserId);
    const profile = await getPersonalOutageProfile(env.DB, telegramUserId);
    if (!profile) {
      throw new Error("Personal outage profile was not saved.");
    }
    await sendMessage(env, chatId, "تنظیم «خاموشی من» ذخیره شد.");
    await showPersonalOutage(env, chatId, profile);
    return true;
  }

  if (flow.state === PERSONALIZATION_FLOW_DELETE) {
    if (text !== CONFIRM_DELETE_BUTTON) {
      await sendMessage(
        env,
        chatId,
        "برای حذف، دکمه تأیید را بزنید یا انصراف دهید.",
        deleteConfirmationKeyboard(),
      );
      return true;
    }
    await deletePersonalOutageProfile(env.DB, telegramUserId);
    await clearPersonalizationFlow(env.DB, telegramUserId);
    await sendMessage(
      env,
      chatId,
      "تنظیم «خاموشی من» حذف شد.",
      mainMenuKeyboard(),
    );
    return true;
  }

  await clearPersonalizationFlow(env.DB, telegramUserId);
  return false;
}

async function handleTextMessage(
  env: Env,
  message: TelegramMessage,
  text: string,
): Promise<void> {
  const chatId = String(message.chat.id);
  const telegramUser = message.from;
  const telegramUserId = telegramUser ? String(telegramUser.id) : null;

  if (telegramUser) {
    await upsertTelegramUser(env.DB, telegramUser, chatId);
  }

  if (text === "/start" || text === MAIN_MENU_BUTTON) {
    await setChatSession(env.DB, chatId, null, false);
    if (telegramUserId) {
      await clearPersonalizationFlow(env.DB, telegramUserId);
    }
    await sendMessage(
      env,
      chatId,
      "یک گزینه را انتخاب کنید:",
      mainMenuKeyboard(),
    );
    return;
  }

  if (telegramUser && telegramUserId) {
    const flow = await getPersonalizationFlow(env.DB, telegramUserId);
    if (flow) {
      const handled = await handlePersonalizationFlow(
        env,
        message,
        telegramUser,
        text,
        flow,
      );
      if (handled) {
        return;
      }
    }
  }

  if (text === PERSONAL_OUTAGE_BUTTON) {
    if (!telegramUser) {
      await sendMessage(
        env,
        chatId,
        "شناسه کاربر تلگرام در این پیام در دسترس نیست.",
        mainMenuKeyboard(),
      );
      return;
    }
    await openPersonalOutage(env, message, telegramUser);
    return;
  }

  if (text === EDIT_PERSONAL_OUTAGE_BUTTON) {
    if (!telegramUserId) {
      return;
    }
    const authorized = await ensureAuthorizedUser(env, chatId, telegramUserId);
    if (authorized) {
      await beginPersonalizationSetup(env, chatId, telegramUserId);
    }
    return;
  }

  if (text === DELETE_PERSONAL_OUTAGE_BUTTON) {
    if (!telegramUserId) {
      return;
    }
    const authorized = await ensureAuthorizedUser(env, chatId, telegramUserId);
    if (!authorized) {
      return;
    }
    const profile = await getPersonalOutageProfile(env.DB, telegramUserId);
    if (!profile) {
      await sendMessage(
        env,
        chatId,
        "تنظیمی برای حذف وجود ندارد.",
        mainMenuKeyboard(),
      );
      return;
    }
    await setPersonalizationFlow(
      env.DB,
      telegramUserId,
      chatId,
      PERSONALIZATION_FLOW_DELETE,
      profile.city_key,
      profile.match_mode,
    );
    await sendMessage(
      env,
      chatId,
      "تنظیم «خاموشی من» حذف شود؟",
      deleteConfirmationKeyboard(),
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
    "برای شروع، یکی از گزینه‌های منوی اصلی را انتخاب کنید.",
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

    await handleTextMessage(env, message, text);
  } catch (error) {
    await releaseUpdate(env.DB, update.update_id);
    throw error;
  }
}
