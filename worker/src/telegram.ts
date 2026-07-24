import {
  ADMIN_PANEL_BUTTON,
  ADMIN_STATUS_BUTTON,
  ADMIN_USERS_BUTTON,
  ADMIN_CITIES_BUTTON,
  ADMIN_UPDATES_BUTTON,
  ADMIN_SPECIAL_REQUESTS_BUTTON,
  ADMIN_ADD_CITY_BUTTON,
  ADMIN_AUTO_SOURCE_BUTTON,
  ADMIN_MANUAL_SOURCE_BUTTON,
  CANCEL_BUTTON,
  CHANGE_CITY_BUTTON,
  MAIN_MENU_BUTTON,
  MAZANDARAN_BUTTON,
  PERSONAL_ADDRESS_MODE_BUTTON,
  PERSONAL_NUMBER_MODE_BUTTON,
  PERSONAL_OUTAGE_BUTTON,
  SPECIAL_LOOKUP_BUTTON,
  SUPPORT_BUTTON,
  REMINDER_30_BUTTON,
  REMINDER_60_BUTTON,
  REMINDER_NONE_BUTTON,
  SEARCH_BUTTON,
  SHOW_ALL_BUTTON,
  adminMenuKeyboard,
  adminSourceModeKeyboard,
  cityActionKeyboard,
  cityByKey,
  cityByLabel,
  cityMenuKeyboard,
  mainMenuKeyboard,
  personalizationCityKeyboard,
  personalizationModeKeyboard,
  personalizationReminderKeyboard,
} from "./config";
import {
  acceptCitySourceProposal,
  adminFlowSourceIds,
  applyBulkDiscoveryBatch,
  clearAdminFlow,
  deactivateManagedCity,
  findCityByLabel,
  findSourceConflicts,
  getAdminFlow,
  getBulkDiscoveryBatch,
  getCitySourceProposal,
  getManagedCity,
  listManagedCities,
  parseBulkDiscoverySummary,
  rejectBulkDiscoveryBatch,
  rejectCitySourceProposal,
  requestCityDiscovery,
  saveManagedCity,
  setAdminFlow,
} from "./cities";
import {
  dispatchManualOperation,
  listManualOperationRuns,
  type ManualOperationType,
} from "./manual-operations";
import {
  clearSpecialLookupFlow,
  createSpecialLookupRequest,
  decideSpecialLookupRequest,
  getSpecialLookupFlow,
  getSpecialLookupRequest,
  listSpecialLookupRequests,
  listUserSpecialLookupRequests,
  maskBillId,
  protectBillId,
  revealBillId,
  setSpecialLookupFlow,
  type SpecialLookupRequest,
} from "./special-requests";
import {
  getUserSpecialRequestWithOutages,
  listDueSpecialReminders,
  recordSpecialChangeEvent,
  recordSpecialReminder,
  setSpecialReminderMinutes,
  type ProviderHealthUpdate,
  type SpecialOutageRow,
  type SpecialSyncChange,
} from "./special-outages";
import {
  clearSupportFlow,
  createTetherSubmission,
  decideTetherSubmission,
  getSupportFlow,
  getTetherSubmission,
  recordStarSupportPayment,
  setSupportFlow,
} from "./support";
import {
  authorizeTelegramUser,
  claimUpdate,
  clearPersonalizationFlow,
  createNotificationBatch,
  deletePersonalOutageProfile,
  getAdminSystemStats,
  getChatSession,
  getNotificationBatch,
  getPersonalOutageProfile,
  getPersonalizationFlow,
  getTelegramUser,
  listAuthorizedPersonalProfilesByCity,
  listAuthorizedPersonalProfilesWithReminders,
  listAuthorizedTelegramUsers,
  listCityOutages,
  listSentPersonalChangeEventKeys,
  listSentReminderKeys,
  listSyncStatuses,
  listPersonalOutageProfiles,
  listSentPersonalNotificationProfileIds,
  recordPasswordFailure,
  recordPersonalChangeDeliveries,
  recordPersonalNotificationDeliveries,
  recordReminderDeliveries,
  releaseUpdate,
  revokeTelegramUser,
  savePersonalOutageProfile,
  searchCityOutages,
  setChatSession,
  setPersonalizationFlow,
  upsertTelegramUser,
} from "./database";
import { normalizePersianText, toPersianDigits } from "./persian";
import type {
  AuthorizedPersonalProfile,
  Env,
  InlineKeyboardMarkup,
  OutageRow,
  PersonalMatchMode,
  PersonalOutageProfile,
  PersonalizationFlow,
  TelegramCallbackQuery,
  TelegramMessage,
  TelegramPreCheckoutQuery,
  TelegramReplyMarkup,
  TelegramUpdate,
  TelegramUser,
  TelegramUserRecord,
} from "./types";

const TELEGRAM_MESSAGE_LIMIT = 3500;
const RESULTS_PER_MESSAGE = 3;
const TEHRAN_TIME_ZONE = "Asia/Tehran";
const SHOW_NEW_OUTAGES_PREFIX = "show_new:";
const PERSONAL_ADD_CALLBACK = "personal_add";
const PERSONAL_DASHBOARD_CALLBACK = "personal_dashboard";
const PERSONAL_SHOW_PREFIX = "personal_show:";
const PERSONAL_EDIT_PREFIX = "personal_edit:";
const PERSONAL_DELETE_PREFIX = "personal_delete:";
const PERSONAL_DELETE_CONFIRM_PREFIX = "personal_delete_yes:";
const MAIN_MENU_CALLBACK = "go_main";
const ADMIN_HOME_CALLBACK = "admin_home";
const ADMIN_REFRESH_CALLBACK = "admin_users";
const ADMIN_STATUS_CALLBACK = "admin_status";
const ADMIN_CITIES_CALLBACK = "admin_cities";
const ADMIN_UPDATES_CALLBACK = "admin_updates";
const ADMIN_UPDATE_STATUS_CALLBACK = "admin_update_status";
const ADMIN_FETCH_ALL_CALLBACK = "admin_fetch_all";
const ADMIN_FETCH_CITIES_CALLBACK = "admin_fetch_cities";
const ADMIN_FETCH_SPECIAL_CALLBACK = "admin_fetch_special";
const ADMIN_CITY_ADD_CALLBACK = "admin_city_add";
const ADMIN_CITY_EDIT_PREFIX = "admin_city_edit:";
const ADMIN_CITY_DISABLE_PREFIX = "admin_city_disable:";
const ADMIN_CITY_DISABLE_CONFIRM_PREFIX = "admin_city_disable_yes:";
const ADMIN_CITY_SAVE_CONFIRM_CALLBACK = "admin_city_save_yes";
const ADMIN_CITY_DISCOVERY_CONFIRM_CALLBACK = "admin_city_discovery_yes";
const ADMIN_CITY_ACCEPT_PREFIX = "admin_city_accept:";
const ADMIN_CITY_REJECT_PREFIX = "admin_city_reject:";
const ADMIN_REVOKE_PREFIX = "admin_revoke:";
const ADMIN_REVOKE_CONFIRM_PREFIX = "admin_revoke_yes:";
const ADMIN_MANUAL_FETCH_CALLBACK = "admin_manual_fetch";
const ADMIN_DISCOVER_PENDING_CALLBACK = "admin_discover_pending";
const ADMIN_DISCOVER_ALL_CALLBACK = "admin_discover_all";
const ADMIN_OPERATION_CONFIRM_PREFIX = "admin_operation_yes:";
const ADMIN_BULK_ACCEPT_PREFIX = "admin_bulk_accept:";
const ADMIN_BULK_REJECT_PREFIX = "admin_bulk_reject:";
const ADMIN_SPECIAL_CALLBACK = "admin_special";
const ADMIN_SPECIAL_SHOW_PREFIX = "admin_special_show:";
const ADMIN_SPECIAL_APPROVE_PREFIX = "admin_special_approve:";
const ADMIN_SPECIAL_REJECT_PREFIX = "admin_special_reject:";
const ADMIN_SPECIAL_APPROVE_CONFIRM_PREFIX = "admin_special_approve_yes:";
const ADMIN_SPECIAL_REJECT_CONFIRM_PREFIX = "admin_special_reject_yes:";
const ADMIN_SPECIAL_REVEAL_PREFIX = "admin_special_reveal:";
const ADMIN_SPECIAL_REVEAL_CONFIRM_PREFIX = "admin_special_reveal_yes:";
const SPECIAL_HOME_CALLBACK = "special_home";
const SPECIAL_ADD_CALLBACK = "special_add";
const SPECIAL_SUBMIT_CALLBACK = "special_submit_yes";
const SPECIAL_CANCEL_CALLBACK = "special_cancel";
const SPECIAL_VIEW_PREFIX = "special_view:";
const SPECIAL_REMINDER_PREFIX = "special_reminder:";
const SPECIAL_REMINDER_SET_PREFIX = "special_reminder_set:";
const SUPPORT_HOME_CALLBACK = "support_home";
const SUPPORT_STARS_PREFIX = "support_stars:";
const SUPPORT_TETHER_CALLBACK = "support_tether";
const SUPPORT_TETHER_APPROVE_PREFIX = "support_tether_ok:";
const SUPPORT_TETHER_REJECT_PREFIX = "support_tether_no:";
const SUPPORT_TETHER_APPROVE_CONFIRM_PREFIX = "support_tether_ok_yes:";
const SUPPORT_TETHER_REJECT_CONFIRM_PREFIX = "support_tether_no_yes:";

const PASSWORD_WINDOW_MINUTES = 15;
const PERSONALIZATION_FLOW_PASSWORD = "awaiting_password";
const PERSONALIZATION_FLOW_LABEL = "awaiting_label";
const PERSONALIZATION_FLOW_CITY = "choosing_city";
const PERSONALIZATION_FLOW_MODE = "choosing_mode";
const PERSONALIZATION_FLOW_VALUE = "awaiting_value";
const PERSONALIZATION_FLOW_REMINDER = "choosing_reminder";

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
  keyboard?: TelegramReplyMarkup,
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


function manualOperationLabel(
  operation: ManualOperationType | string,
): string {
  if (operation === "fetch_all") {
    return "بروزرسانی همه";
  }

  if (
    operation === "fetch_cities" ||
    operation === "fetch"
  ) {
    return "بروزرسانی شهرهای Maztozi";
  }

  if (operation === "fetch_special") {
    return "بروزرسانی استعلام‌های ویژه برق‌من";
  }

  if (operation === "discover_pending") {
    return "کشف شهرهای در انتظار";
  }

  if (operation === "discover_all") {
    return "کشف همه شهرستان‌های Maztozi";
  }

  return operation;
}

function manualOperationStatusLabel(
  status: string,
): string {
  if (status === "dispatching") {
    return "در حال ارسال به GitHub";
  }

  if (status === "queued") {
    return "در صف GitHub";
  }

  if (status === "waiting_for_runner") {
    return "در انتظار Runner";
  }

  if (status === "running") {
    return "در حال اجرا";
  }

  if (status === "completed") {
    return "موفق";
  }

  if (status === "failed") {
    return "ناموفق";
  }

  return status || "نامشخص";
}

function manualOperationStatusEmoji(
  status: string,
): string {
  if (status === "completed") {
    return "✅";
  }

  if (status === "failed") {
    return "❌";
  }

  if (status === "running") {
    return "▶️";
  }

  if (status === "waiting_for_runner") {
    return "💻";
  }

  if (
    status === "queued" ||
    status === "dispatching"
  ) {
    return "⏳";
  }

  return "⚪️";
}

function updateCenterKeyboard(): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        {
          text: "🚀 بروزرسانی همه",
          callback_data: ADMIN_FETCH_ALL_CALLBACK,
        },
      ],
      [
        {
          text: "🏙 بروزرسانی شهرهای Maztozi",
          callback_data: ADMIN_FETCH_CITIES_CALLBACK,
        },
      ],
      [
        {
          text: "⭐ بروزرسانی استعلام‌های ویژه",
          callback_data: ADMIN_FETCH_SPECIAL_CALLBACK,
        },
      ],
      [
        {
          text: "🔎 کشف شهرهای در انتظار",
          callback_data: ADMIN_DISCOVER_PENDING_CALLBACK,
        },
      ],
      [
        {
          text: "🌐 کشف همه شهرستان‌های Maztozi",
          callback_data: ADMIN_DISCOVER_ALL_CALLBACK,
        },
      ],
      [
        {
          text: "📋 بازخوانی وضعیت عملیات",
          callback_data: ADMIN_UPDATE_STATUS_CALLBACK,
        },
      ],
      [
        {
          text: "⬅️ پنل مدیریت",
          callback_data: ADMIN_HOME_CALLBACK,
        },
      ],
      [
        {
          text: "🏠 منوی اصلی",
          callback_data: MAIN_MENU_CALLBACK,
        },
      ],
    ],
  };
}

async function openAdminUpdateCenter(
  env: Env,
  chatId: string,
  telegramUserId: string,
): Promise<void> {
  if (!isAdmin(env, telegramUserId)) {
    await sendMessage(
      env,
      chatId,
      "دسترسی مدیریت برای این حساب فعال نیست.",
    );
    return;
  }

  const operations = await listManualOperationRuns(
    env.DB,
    6,
  );

  const operationBlocks =
    operations.length === 0
      ? ["هنوز عملیات دستی ثبت نشده است."]
      : operations.map((operation) => {
          const lines = [
            `${manualOperationStatusEmoji(
              operation.status,
            )} <b>${escapeHtml(
              manualOperationLabel(
                operation.operation_type,
              ),
            )}</b>`,
            `وضعیت: ${escapeHtml(
              manualOperationStatusLabel(
                operation.status,
              ),
            )}`,
            `شناسه: <code>${escapeHtml(
              operation.operation_id.slice(0, 8),
            )}</code>`,
            `آخرین تغییر: ${escapeHtml(
              formatTehranDateTime(
                operation.updated_at,
              ),
            )}`,
          ];

          if (
            operation.status === "failed" &&
            operation.error_text
          ) {
            lines.push(
              `خطا: ${escapeHtml(
                operation.error_text.slice(0, 300),
              )}`,
            );
          }

          return lines.join("\n");
        });

  await sendMessage(
    env,
    chatId,
    [
      "🔄 <b>مرکز بروزرسانی</b>",
      "",
      "عملیات‌ها روی Self-hosted Runner ویندوز اجرا می‌شوند.",
      "اگر لپ‌تاپ یا Runner خاموش باشد، درخواست در صف GitHub باقی می‌ماند.",
      "",
      "📋 <b>آخرین عملیات‌ها</b>",
      "",
      ...operationBlocks,
    ].join("\n\n"),
    updateCenterKeyboard(),
  );
}

async function showManualOperationConfirmation(
  env: Env,
  chatId: string,
  operation: ManualOperationType,
): Promise<void> {
  let warning: string;

  if (operation === "fetch_all") {
    warning = [
      "ابتدا خاموشی شهرهای Maztozi دریافت می‌شود.",
      "سپس تمام استعلام‌های ویژه فعال برق‌من بروزرسانی می‌شوند.",
    ].join(" ");
  } else if (
    operation === "fetch_cities" ||
    operation === "fetch"
  ) {
    warning =
      "فقط خاموشی شهرهای فعال Maztozi دریافت و با منطق افزایشی همگام می‌شوند. غیبت یک بلوک باعث حذف آن نمی‌شود.";
  } else if (operation === "fetch_special") {
    warning =
      "فقط درخواست‌های فعال و تأییدشده برق‌من بررسی می‌شوند.";
  } else if (operation === "discover_pending") {
    warning =
      "فقط شهرهایی که برای آن‌ها درخواست کشف ثبت شده بررسی می‌شوند.";
  } else {
    warning =
      "مرورگر همه شهرستان‌های Maztozi را بررسی می‌کند. نتیجه بدون تأیید مدیر اعمال نمی‌شود.";
  }

  await sendMessage(
    env,
    chatId,
    [
      "⚠️ <b>تأیید عملیات</b>",
      `عملیات: <b>${escapeHtml(
        manualOperationLabel(operation),
      )}</b>`,
      "",
      warning,
      "",
      "Self-hosted Runner باید روشن و آنلاین باشد.",
      "در صورت خاموش‌بودن Runner، درخواست در صف باقی می‌ماند.",
    ].join("\n"),
    {
      inline_keyboard: [
        [
          {
            text: "✅ بله، اجرا شود",
            callback_data:
              `${ADMIN_OPERATION_CONFIRM_PREFIX}${operation}`,
          },
          {
            text: "❌ انصراف",
            callback_data: ADMIN_UPDATES_CALLBACK,
          },
        ],
        [
          {
            text: "⬅️ مرکز بروزرسانی",
            callback_data: ADMIN_UPDATES_CALLBACK,
          },
        ],
        [
          {
            text: "🏠 منوی اصلی",
            callback_data: MAIN_MENU_CALLBACK,
          },
        ],
      ],
    },
  );
}

function specialStatusLabel(status: string): string {
  if (status === "pending") return "در انتظار بررسی مدیر";
  if (status === "approved") return "پذیرفته‌شده";
  if (status === "active") return "فعال و قابل استعلام";
  if (status === "rejected") return "امکان پشتیبانی ندارد";
  return status;
}

function specialRequestSummary(request: SpecialLookupRequest): string {
  return [
    `🏷 <b>نام:</b> ${escapeHtml(request.request_label)}`,
    `🗺 <b>استان:</b> ${escapeHtml(request.province)}`,
    `🏙 <b>شهرستان:</b> ${escapeHtml(request.county)}`,
    `🧾 <b>شناسه قبض:</b> <code>${maskBillId(request.bill_id_last4)}</code>`,
    `📌 <b>وضعیت:</b> ${escapeHtml(specialStatusLabel(request.status))}`,
  ].join("\n");
}

function specialReminderLabel(minutes: number): string {
  if (minutes === 30) return "۳۰ دقیقه قبل";
  if (minutes === 60) return "۶۰ دقیقه قبل";
  return "خاموش";
}

function formatSpecialOutageBlock(row: SpecialOutageRow): string {
  const lines = [
    row.outage_date ? `📅 <b>تاریخ:</b> ${escapeHtml(row.outage_date)}` : "",
    row.from_time || row.to_time
      ? `🕒 <b>زمان:</b> ${escapeHtml(row.from_time || "اعلام نشده")} تا ${escapeHtml(row.to_time || "اعلام نشده")}`
      : "",
    row.address ? `📍 <b>آدرس:</b> ${escapeHtml(row.address)}` : "",
    row.description ? `📝 <b>توضیح:</b> ${escapeHtml(row.description)}` : "",
  ].filter(Boolean);
  return lines.join("\n");
}

async function openSpecialLookupHome(
  env: Env,
  chatId: string,
  telegramUserId: string,
): Promise<void> {
  const requests = await listUserSpecialLookupRequests(env.DB, telegramUserId, 10);
  const text = requests.length
    ? [
        "⭐ <b>استعلام ویژه با شناسه قبض</b>",
        "",
        "درخواست‌های شما:",
        ...requests.map((request, index) =>
          `${toPersianDigits(index + 1)}. ${escapeHtml(request.request_label)} — ${escapeHtml(specialStatusLabel(request.status))} — ${maskBillId(request.bill_id_last4)}${request.status === "active" ? ` — یادآوری: ${specialReminderLabel(request.reminder_minutes)}` : ""}`,
        ),
        "",
        "درخواست فعال از آخرین داده ذخیره‌شده پاسخ می‌دهد و پس از هر Fetch به‌روزرسانی می‌شود.",
      ].join("\n")
    : [
        "⭐ <b>استعلام ویژه با شناسه قبض</b>",
        "",
        "شناسه قبض را ثبت می‌کنید. پس از تأیید مدیر، استعلام دستی و یادآوری ۳۰ یا ۶۰ دقیقه‌ای فعال می‌شود.",
      ].join("\n");
  const rows: InlineKeyboardMarkup["inline_keyboard"] = [];
  for (const request of requests) {
    if (request.status === "active") {
      rows.push([
        {
          text: `🔎 ${request.request_label.slice(0, 20)}`,
          callback_data: `${SPECIAL_VIEW_PREFIX}${request.request_id}`,
        },
        {
          text: "⏰ یادآوری",
          callback_data: `${SPECIAL_REMINDER_PREFIX}${request.request_id}`,
        },
      ]);
    }
  }
  rows.push([{ text: "➕ ثبت درخواست جدید", callback_data: SPECIAL_ADD_CALLBACK }]);
  rows.push([{ text: "🔄 تازه‌سازی", callback_data: SPECIAL_HOME_CALLBACK }]);
  rows.push([{ text: "🏠 منوی اصلی", callback_data: MAIN_MENU_CALLBACK }]);
  await sendMessage(env, chatId, text, { inline_keyboard: rows });
}

async function openSpecialLookupResult(
  env: Env,
  chatId: string,
  telegramUserId: string,
  requestId: string,
): Promise<void> {
  const request = await getUserSpecialRequestWithOutages(
    env.DB,
    requestId,
    telegramUserId,
  );
  if (!request) {
    await sendMessage(env, chatId, "درخواست پیدا نشد یا متعلق به این حساب نیست.");
    return;
  }
  const keyboard: InlineKeyboardMarkup = {
    inline_keyboard: [
      [{ text: "⏰ تنظیم یادآوری", callback_data: `${SPECIAL_REMINDER_PREFIX}${requestId}` }],
      [{ text: "🔄 تازه‌سازی", callback_data: `${SPECIAL_VIEW_PREFIX}${requestId}` }],
      [{ text: "⬅️ درخواست‌های ویژه", callback_data: SPECIAL_HOME_CALLBACK }],
      [{ text: "🏠 منوی اصلی", callback_data: MAIN_MENU_CALLBACK }],
    ],
  };
  if (request.status !== "active") {
    await sendMessage(
      env,
      chatId,
      `${specialRequestSummary(request)}\n\nاین درخواست هنوز فعال نیست.`,
      keyboard,
    );
    return;
  }
  if (request.last_fetch_status !== "ok") {
    const detail = request.last_error
      ? `\n📝 ${escapeHtml(request.last_error)}`
      : "";
    await sendMessage(
      env,
      chatId,
      [
        `⭐ <b>${escapeHtml(request.request_label)}</b>`,
        `📌 وضعیت Fetch: ${escapeHtml(request.last_fetch_status === "never" ? "هنوز اجرا نشده" : request.last_fetch_status)}`,
        request.last_fetched_at
          ? `🕒 آخرین تلاش: ${escapeHtml(formatTehranDateTime(request.last_fetched_at))}`
          : "",
        detail,
      ].filter(Boolean).join("\n"),
      keyboard,
    );
    return;
  }
  if (request.outages.length === 0) {
    await sendMessage(
      env,
      chatId,
      [
        `✅ <b>${escapeHtml(request.request_label)}</b>`,
        "در آخرین استعلام، خاموشی برنامه‌ریزی‌شده‌ای برای این قبض گزارش نشده است.",
        request.last_fetched_at
          ? `🕒 آخرین به‌روزرسانی: ${escapeHtml(formatTehranDateTime(request.last_fetched_at))}`
          : "",
      ].filter(Boolean).join("\n"),
      keyboard,
    );
    return;
  }
  await sendBlocks(
    env,
    chatId,
    [
      `⭐ <b>خاموشی ${escapeHtml(request.request_label)}</b>`,
      ...request.outages.map(formatSpecialOutageBlock),
    ],
    keyboard,
  );
}

async function openSpecialReminderMenu(
  env: Env,
  chatId: string,
  telegramUserId: string,
  requestId: string,
): Promise<void> {
  const request = await getUserSpecialRequestWithOutages(env.DB, requestId, telegramUserId);
  if (!request || request.status !== "active") {
    await sendMessage(env, chatId, "این اشتراک فعال نیست یا متعلق به این حساب نیست.");
    return;
  }
  await sendMessage(
    env,
    chatId,
    `⏰ <b>یادآوری ${escapeHtml(request.request_label)}</b>\n\nتنظیم فعلی: <b>${specialReminderLabel(request.reminder_minutes)}</b>`,
    {
      inline_keyboard: [
        [
          { text: "۳۰ دقیقه", callback_data: `${SPECIAL_REMINDER_SET_PREFIX}${requestId}:30` },
          { text: "۶۰ دقیقه", callback_data: `${SPECIAL_REMINDER_SET_PREFIX}${requestId}:60` },
        ],
        [{ text: "خاموش", callback_data: `${SPECIAL_REMINDER_SET_PREFIX}${requestId}:0` }],
        [{ text: "⬅️ بازگشت", callback_data: `${SPECIAL_VIEW_PREFIX}${requestId}` }],
        [{ text: "🏠 منوی اصلی", callback_data: MAIN_MENU_CALLBACK }],
      ],
    },
  );
}

async function beginSpecialLookupRequest(
  env: Env,
  chatId: string,
  telegramUserId: string,
): Promise<void> {
  await clearSpecialLookupFlow(env.DB, telegramUserId);
  await setSpecialLookupFlow(env.DB, telegramUserId, chatId, "awaiting_province");
  await sendMessage(
    env,
    chatId,
    "نام استان را وارد کنید؛ مثلاً «تهران» یا «فارس».",
    {
      keyboard: [[{ text: CANCEL_BUTTON }, { text: MAIN_MENU_BUTTON }]],
      resize_keyboard: true,
      is_persistent: true,
    },
  );
}

async function notifyAdminSpecialRequest(
  env: Env,
  request: SpecialLookupRequest,
): Promise<void> {
  const adminId = env.ADMIN_TELEGRAM_USER_ID?.trim();
  if (!adminId) return;
  await sendMessage(
    env,
    adminId,
    [
      "⭐ <b>درخواست استعلام ویژه جدید</b>",
      `👤 <b>کاربر:</b> <code>${request.telegram_user_id}</code>`,
      specialRequestSummary(request),
      "",
      "برای بررسی سایت استان، می‌توانید پس از تأیید حساس شناسه کامل را نمایش دهید.",
    ].join("\n"),
    {
      inline_keyboard: [
        [
          {
            text: "🔎 بررسی درخواست",
            callback_data: `${ADMIN_SPECIAL_SHOW_PREFIX}${request.request_id}`,
          },
        ],
        [{ text: "🏠 منوی اصلی", callback_data: MAIN_MENU_CALLBACK }],
      ],
    },
  );
}

async function handleSpecialLookupTextFlow(
  env: Env,
  chatId: string,
  telegramUserId: string,
  text: string,
): Promise<boolean> {
  const flow = await getSpecialLookupFlow(env.DB, telegramUserId);
  if (!flow) return false;
  if (text === CANCEL_BUTTON || text === MAIN_MENU_BUTTON) {
    await clearSpecialLookupFlow(env.DB, telegramUserId);
    if (text === MAIN_MENU_BUTTON) {
      await sendMessage(env, chatId, "یک گزینه را انتخاب کنید:", mainMenuFor(env, telegramUserId));
    } else {
      await openSpecialLookupHome(env, chatId, telegramUserId);
    }
    return true;
  }
  const value = normalizePersianText(text);
  if (flow.state === "awaiting_province") {
    if (value.length < 2 || value.length > 50) {
      await sendMessage(env, chatId, "نام استان باید بین ۲ تا ۵۰ نویسه باشد.");
      return true;
    }
    await setSpecialLookupFlow(env.DB, telegramUserId, chatId, "awaiting_county", {
      province: value,
    });
    await sendMessage(env, chatId, "نام شهرستان را وارد کنید؛ مثلاً «تهران» یا «شیراز».");
    return true;
  }
  if (flow.state === "awaiting_county") {
    if (value.length < 2 || value.length > 50) {
      await sendMessage(env, chatId, "نام شهرستان باید بین ۲ تا ۵۰ نویسه باشد.");
      return true;
    }
    await setSpecialLookupFlow(env.DB, telegramUserId, chatId, "awaiting_label", {
      county: value,
    });
    await sendMessage(env, chatId, "یک نام دلخواه برای این اشتراک وارد کنید؛ مثلاً «خانه» یا «مغازه».");
    return true;
  }
  if (flow.state === "awaiting_label") {
    if (value.length < 2 || value.length > 30) {
      await sendMessage(env, chatId, "نام اشتراک باید بین ۲ تا ۳۰ نویسه باشد.");
      return true;
    }
    await setSpecialLookupFlow(env.DB, telegramUserId, chatId, "awaiting_bill_id", {
      request_label: value,
    });
    await sendMessage(
      env,
      chatId,
      "شناسه قبض را فقط به‌صورت عدد ارسال کنید. مقدار کامل رمزگذاری می‌شود و در فهرست‌ها نمایش داده نخواهد شد.",
    );
    return true;
  }
  if (flow.state === "awaiting_bill_id") {
    try {
      const protectedValue = await protectBillId(env, text);
      await setSpecialLookupFlow(env.DB, telegramUserId, chatId, "confirm_submit", {
        bill_id_ciphertext: protectedValue.ciphertext,
        bill_id_hash: protectedValue.hash,
        bill_id_last4: protectedValue.last4,
      });
      const updated = await getSpecialLookupFlow(env.DB, telegramUserId);
      if (!updated) throw new Error("اطلاعات درخواست منقضی شد.");
      await sendMessage(
        env,
        chatId,
        [
          "⚠️ <b>تأیید ارسال اطلاعات حساس</b>",
          `🏷 <b>نام:</b> ${escapeHtml(updated.request_label)}`,
          `🗺 <b>استان:</b> ${escapeHtml(updated.province)}`,
          `🏙 <b>شهرستان:</b> ${escapeHtml(updated.county)}`,
          `🧾 <b>شناسه قبض:</b> <code>${maskBillId(updated.bill_id_last4)}</code>`,
          "",
          "این اطلاعات برای بررسی امکان اتصال به سامانه رسمی برق در اختیار مدیر ربات قرار می‌گیرد.",
        ].join("\n"),
        {
          inline_keyboard: [
            [
              { text: "✅ تأیید و ارسال", callback_data: SPECIAL_SUBMIT_CALLBACK },
              { text: "❌ انصراف", callback_data: SPECIAL_CANCEL_CALLBACK },
            ],
            [{ text: "🏠 منوی اصلی", callback_data: MAIN_MENU_CALLBACK }],
          ],
        },
      );
    } catch (error) {
      await sendMessage(
        env,
        chatId,
        `⚠️ ${escapeHtml(error instanceof Error ? error.message : "شناسه قبض نامعتبر است.")}`,
      );
    }
    return true;
  }
  if (flow.state === "confirm_submit") {
    await sendMessage(env, chatId, "برای ارسال یا لغو، یکی از دکمه‌های پیام تأیید را بزنید.");
    return true;
  }
  return false;
}

async function openAdminSpecialRequests(
  env: Env,
  chatId: string,
  telegramUserId: string,
): Promise<void> {
  if (!isAdmin(env, telegramUserId)) {
    await sendMessage(env, chatId, "دسترسی مدیریت برای این حساب فعال نیست.");
    return;
  }
  const requests = await listSpecialLookupRequests(env.DB, "pending", 50);
  const rows: InlineKeyboardMarkup["inline_keyboard"] = requests.map((request) => [
    {
      text: `${request.province} / ${request.county} / ${request.request_label}`.slice(0, 55),
      callback_data: `${ADMIN_SPECIAL_SHOW_PREFIX}${request.request_id}`,
    },
  ]);
  rows.push([{ text: "🔄 تازه‌سازی", callback_data: ADMIN_SPECIAL_CALLBACK }]);
  rows.push([{ text: "⬅️ پنل مدیریت", callback_data: ADMIN_HOME_CALLBACK }]);
  rows.push([{ text: "🏠 منوی اصلی", callback_data: MAIN_MENU_CALLBACK }]);
  await sendMessage(
    env,
    chatId,
    requests.length
      ? `⭐ <b>درخواست‌های ویژه</b>\n\n${toPersianDigits(requests.length)} درخواست در انتظار بررسی است.`
      : "⭐ <b>درخواست‌های ویژه</b>\n\nدرخواست در انتظاری وجود ندارد.",
    { inline_keyboard: rows },
  );
}

async function showAdminSpecialRequest(
  env: Env,
  chatId: string,
  requestId: string,
): Promise<void> {
  const request = await getSpecialLookupRequest(env.DB, requestId);
  if (!request) {
    await sendMessage(env, chatId, "درخواست پیدا نشد.", adminMenuKeyboard());
    return;
  }
  await sendMessage(
    env,
    chatId,
    [
      "⭐ <b>بررسی درخواست ویژه</b>",
      `👤 <b>کاربر:</b> <code>${request.telegram_user_id}</code>`,
      specialRequestSummary(request),
      "",
      "با تأیید، درخواست فعال می‌شود و در اجرای بعدی استعلام ویژه برق‌من بررسی خواهد شد.",
    ].join("\n"),
    {
      inline_keyboard: [
        [
          {
            text: "🔐 نمایش شناسه کامل",
            callback_data: `${ADMIN_SPECIAL_REVEAL_PREFIX}${request.request_id}`,
          },
        ],
        [
          {
            text: "✅ تأیید و فعال‌سازی",
            callback_data: `${ADMIN_SPECIAL_APPROVE_PREFIX}${request.request_id}`,
          },
          {
            text: "❌ امکان‌پذیر نیست",
            callback_data: `${ADMIN_SPECIAL_REJECT_PREFIX}${request.request_id}`,
          },
        ],
        [{ text: "⬅️ درخواست‌ها", callback_data: ADMIN_SPECIAL_CALLBACK }],
        [{ text: "🏠 منوی اصلی", callback_data: MAIN_MENU_CALLBACK }],
      ],
    },
  );
}

async function openSupportHome(env: Env, chatId: string): Promise<void> {
  const tetherAvailable = Boolean(env.SUPPORT_USDT_ADDRESS?.trim());
  const rows: InlineKeyboardMarkup["inline_keyboard"] = [
    [
      { text: "⭐ ۲۵ استار", callback_data: `${SUPPORT_STARS_PREFIX}25` },
      { text: "⭐ ۵۰ استار", callback_data: `${SUPPORT_STARS_PREFIX}50` },
    ],
    [
      { text: "⭐ ۱۰۰ استار", callback_data: `${SUPPORT_STARS_PREFIX}100` },
      { text: "⭐ ۲۵۰ استار", callback_data: `${SUPPORT_STARS_PREFIX}250` },
    ],
  ];
  if (tetherAvailable) {
    rows.push([{ text: "₮ حمایت با تتر", callback_data: SUPPORT_TETHER_CALLBACK }]);
  }
  rows.push([{ text: "🏠 منوی اصلی", callback_data: MAIN_MENU_CALLBACK }]);
  await sendMessage(
    env,
    chatId,
    [
      "💛 <b>حمایت از پروژه</b>",
      "",
      "حمایت کاملاً داوطلبانه است و دسترسی ویژه یا نتیجه استعلام را تغییر نمی‌دهد.",
      "پرداخت با Stars داخل تلگرام خودکار تأیید می‌شود.",
      tetherAvailable
        ? "پرداخت تتر پس از ثبت هش تراکنش، دستی توسط مدیر تأیید می‌شود."
        : "درگاه تتر فعلاً تنظیم نشده است.",
    ].join("\n"),
    { inline_keyboard: rows },
  );
}

async function sendStarInvoice(
  env: Env,
  chatId: string,
  telegramUserId: string,
  amount: number,
): Promise<void> {
  const payload = `support:${telegramUserId}:${amount}:${crypto.randomUUID().slice(0, 8)}`;
  await callTelegram(env, "sendInvoice", {
    chat_id: chatId,
    title: "حمایت از BBS برق",
    description: "حمایت داوطلبانه از نگهداری و توسعه ربات خاموشی",
    payload,
    currency: "XTR",
    prices: [{ label: "حمایت", amount }],
  });
}

async function handlePreCheckoutQuery(
  env: Env,
  query: TelegramPreCheckoutQuery,
): Promise<void> {
  const valid =
    query.currency === "XTR" &&
    Number.isInteger(query.total_amount) &&
    [25, 50, 100, 250].includes(query.total_amount) &&
    query.invoice_payload.startsWith(`support:${query.from.id}:`);
  await callTelegram(env, "answerPreCheckoutQuery", {
    pre_checkout_query_id: query.id,
    ok: valid,
    ...(valid ? {} : { error_message: "اطلاعات پرداخت معتبر نیست. دوباره از منوی حمایت اقدام کنید." }),
  });
}

async function handleSuccessfulSupportPayment(
  env: Env,
  message: TelegramMessage,
): Promise<void> {
  const payment = message.successful_payment;
  const telegramUserId = message.from ? String(message.from.id) : "";
  const chatId = String(message.chat.id);
  if (!payment || !telegramUserId || payment.currency !== "XTR") return;
  const inserted = await recordStarSupportPayment(env.DB, {
    telegramUserId,
    chatId,
    amount: payment.total_amount,
    invoicePayload: payment.invoice_payload,
    telegramChargeId: payment.telegram_payment_charge_id,
    providerChargeId: payment.provider_payment_charge_id,
  });
  if (inserted) {
    await sendMessage(
      env,
      chatId,
      `💛 حمایت شما با ${toPersianDigits(payment.total_amount)} استار با موفقیت ثبت شد. واقعاً ممنونم.`,
      mainMenuFor(env, telegramUserId),
    );
  }
}

async function beginTetherSupport(
  env: Env,
  chatId: string,
  telegramUserId: string,
): Promise<void> {
  const address = env.SUPPORT_USDT_ADDRESS?.trim();
  const network = env.SUPPORT_USDT_NETWORK?.trim() || "TRC20";
  if (!address) {
    await sendMessage(env, chatId, "درگاه تتر هنوز تنظیم نشده است.");
    return;
  }
  await setSupportFlow(env.DB, telegramUserId, chatId, "awaiting_amount");
  await sendMessage(
    env,
    chatId,
    [
      "₮ <b>حمایت با تتر</b>",
      `🌐 <b>شبکه:</b> ${escapeHtml(network)}`,
      `📮 <b>آدرس:</b> <code>${escapeHtml(address)}</code>`,
      "",
      "شبکه مبدأ و مقصد باید دقیقاً یکسان باشد. ابتدا مقدار ارسالی را بنویسید؛ مثلاً <code>5 USDT</code>.",
    ].join("\n"),
    {
      keyboard: [[{ text: CANCEL_BUTTON }, { text: MAIN_MENU_BUTTON }]],
      resize_keyboard: true,
      is_persistent: true,
    },
  );
}

async function handleSupportTextFlow(
  env: Env,
  chatId: string,
  telegramUserId: string,
  text: string,
): Promise<boolean> {
  const flow = await getSupportFlow(env.DB, telegramUserId);
  if (!flow) return false;
  if (text === CANCEL_BUTTON || text === MAIN_MENU_BUTTON) {
    await clearSupportFlow(env.DB, telegramUserId);
    if (text === MAIN_MENU_BUTTON) {
      await sendMessage(env, chatId, "یک گزینه را انتخاب کنید:", mainMenuFor(env, telegramUserId));
    } else {
      await openSupportHome(env, chatId);
    }
    return true;
  }
  if (flow.state === "awaiting_amount") {
    const amount = text.trim().slice(0, 40);
    if (!/\d/.test(normalizeDigits(amount))) {
      await sendMessage(env, chatId, "مقدار باید شامل عدد باشد؛ مثلاً <code>5 USDT</code>.");
      return true;
    }
    await setSupportFlow(env.DB, telegramUserId, chatId, "awaiting_tx_hash", amount);
    await sendMessage(env, chatId, "حالا هش تراکنش (TXID) را ارسال کنید.");
    return true;
  }
  if (flow.state === "awaiting_tx_hash") {
    try {
      const submission = await createTetherSubmission(env.DB, {
        telegramUserId,
        chatId,
        network: env.SUPPORT_USDT_NETWORK?.trim() || "TRC20",
        amountText: flow.amount_text,
        txHash: text,
      });
      await clearSupportFlow(env.DB, telegramUserId);
      await sendMessage(
        env,
        chatId,
        "✅ هش تراکنش ثبت شد و پس از بررسی مدیر نتیجه اعلام می‌شود.",
        mainMenuFor(env, telegramUserId),
      );
      const adminId = env.ADMIN_TELEGRAM_USER_ID?.trim();
      if (adminId) {
        await sendMessage(
          env,
          adminId,
          [
            "₮ <b>حمایت تتر در انتظار بررسی</b>",
            `👤 <b>کاربر:</b> <code>${telegramUserId}</code>`,
            `🌐 <b>شبکه:</b> ${escapeHtml(submission.network)}`,
            `💵 <b>مقدار اعلامی:</b> ${escapeHtml(submission.amount_text)}`,
            `🔗 <b>TXID:</b> <code>${escapeHtml(submission.tx_hash)}</code>`,
          ].join("\n"),
          {
            inline_keyboard: [
              [
                { text: "✅ تأیید", callback_data: `${SUPPORT_TETHER_APPROVE_PREFIX}${submission.submission_id}` },
                { text: "❌ رد", callback_data: `${SUPPORT_TETHER_REJECT_PREFIX}${submission.submission_id}` },
              ],
              [{ text: "🏠 منوی اصلی", callback_data: MAIN_MENU_CALLBACK }],
            ],
          },
        );
      }
    } catch (error) {
      await sendMessage(env, chatId, `⚠️ ${escapeHtml(error instanceof Error ? error.message : "ثبت تراکنش ناموفق بود.")}`);
    }
    return true;
  }
  return false;
}

async function sendOutageResults(
  env: Env,
  chatId: string,
  cityLabel: string,
  rows: OutageRow[],
  title: string,
  keyboard?: TelegramReplyMarkup,
): Promise<void> {
  for (let start = 0; start < rows.length; start += RESULTS_PER_MESSAGE) {
    const pageRows = rows.slice(start, start + RESULTS_PER_MESSAGE);
    const end = start + pageRows.length;
    const header = `${title}\n<b>نتایج ${toPersianDigits(start + 1)} تا ${toPersianDigits(end)} از ${toPersianDigits(rows.length)}</b>`;
    const blocks = pageRows.map((row, index) =>
      formatOutage(cityLabel, row, start + index + 1, rows.length),
    );
    const message = [header, ...blocks].join("\n\n━━━━━━━━━━━━\n\n");
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
    allowed_updates: ["message", "callback_query", "pre_checkout_query"],
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
      [{ text: "نمایش", callback_data: `${SHOW_NEW_OUTAGES_PREFIX}${batchId}` }],
      [{ text: "🏠 منوی اصلی", callback_data: MAIN_MENU_CALLBACK }],
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

function normalizeOutageNumber(value: string): string {
  return normalizeDigits(value).replace(/\s+/g, "").trim();
}

function profileMatchesRows(
  profile: Pick<PersonalOutageProfile, "match_mode" | "match_value">,
  rows: OutageRow[],
): OutageRow[] {
  if (profile.match_mode === "address_keyword") {
    const expected = normalizePersianText(profile.match_value);
    return rows.filter((row) =>
      normalizePersianText(row.address).includes(expected),
    );
  }
  const expected = normalizeOutageNumber(profile.match_value);
  return rows.filter((row) =>
    parseStoredStringArray(row.outage_numbers).some(
      (number) => normalizeOutageNumber(number) === expected,
    ),
  );
}

export async function notifyPersonalOutagesForCityDate(
  env: Env,
  cityKey: string,
  cityLabel: string,
  snapshotDate: string,
  rows: OutageRow[],
): Promise<{ usersNotified: number; profilesNotified: number; errors: string[] }> {
  if (rows.length === 0) {
    return { usersNotified: 0, profilesNotified: 0, errors: [] };
  }
  const profiles = await listAuthorizedPersonalProfilesByCity(env.DB, cityKey);
  const sentProfileIds = await listSentPersonalNotificationProfileIds(
    env.DB,
    cityKey,
    snapshotDate,
  );
  const grouped = new Map<
    string,
    {
      chatId: string;
      profiles: Array<{
        profile: AuthorizedPersonalProfile;
        rows: OutageRow[];
      }>;
    }
  >();
  for (const profile of profiles) {
    if (sentProfileIds.has(profile.profile_id)) {
      continue;
    }
    const matches = profileMatchesRows(profile, rows);
    if (matches.length === 0) {
      continue;
    }
    const current = grouped.get(profile.telegram_user_id) ?? {
      chatId: profile.chat_id,
      profiles: [],
    };
    current.profiles.push({ profile, rows: matches });
    grouped.set(profile.telegram_user_id, current);
  }

  let usersNotified = 0;
  let profilesNotified = 0;
  const errors: string[] = [];
  for (const [telegramUserId, group] of grouped) {
    const uniqueRows = new Map<string, OutageRow>();
    for (const item of group.profiles) {
      for (const row of item.rows) {
        uniqueRows.set(row.outage_key, row);
      }
    }
    const labels = group.profiles
      .map((item) => escapeHtml(item.profile.profile_label))
      .join("، ");
    try {
      await sendOutageResults(
        env,
        group.chatId,
        cityLabel,
        [...uniqueRows.values()],
        [
          "🔔 <b>اعلان خودکار خاموشی من</b>",
          `📅 <b>برنامه:</b> ${escapeHtml(snapshotDate)}`,
          `🏷 <b>تنظیم‌های مطابق:</b> ${labels}`,
        ].join("\n"),
      );
      await recordPersonalNotificationDeliveries(
        env.DB,
        snapshotDate,
        group.profiles.map((item) => ({
          profile: item.profile,
          matchedOutageKeys: item.rows.map((row) => row.outage_key),
        })),
      );
      usersNotified += 1;
      profilesNotified += group.profiles.length;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown Telegram error";
      errors.push(`${telegramUserId}: ${message}`);
      console.error("Personal outage notification failed:", error);
    }
  }
  return { usersNotified, profilesNotified, errors };
}


interface PersonalChangeEvent {
  eventKey: string;
  profile: AuthorizedPersonalProfile;
  changeType: "added" | "updated";
  previousRow: OutageRow | null;
  currentRow: OutageRow;
}

function outageComparableSignature(row: OutageRow): string {
  return JSON.stringify({
    address: normalizePersianText(row.address),
    from: row.from_time,
    to: row.to_time,
    type: row.outage_type,
  });
}

async function sha256Text(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function formatNumberList(value: string): string {
  const values = parseStoredStringArray(value);
  return values.length > 0
    ? values.map((item) => toPersianDigits(item)).join("، ")
    : "اعلام نشده";
}

function formatPersonalChangeEvent(
  cityLabel: string,
  event: PersonalChangeEvent,
): string {
  const profileLabel = escapeHtml(event.profile.profile_label);
  const current = event.currentRow;
  if (event.changeType === "added" || !event.previousRow) {
    return [
      `➕ <b>مورد جدید مطابق «${profileLabel}»</b>`,
      `🏙 ${escapeHtml(cityLabel)}`,
      `📍 ${escapeHtml(current.address)}`,
      `📅 ${escapeHtml(current.outage_date)}`,
      `🕒 ${escapeHtml(current.from_time || "اعلام نشده")} تا ${escapeHtml(current.to_time || "اعلام نشده")}`,
      `🔢 ${escapeHtml(formatNumberList(current.outage_numbers))}`,
    ].join("\n");
  }

  const previous = event.previousRow;
  const lines = [
    `🔄 <b>تغییر برنامه «${profileLabel}»</b>`,
    `🏙 ${escapeHtml(cityLabel)}`,
    `📍 ${escapeHtml(current.address)}`,
  ];
  if (
    previous.from_time !== current.from_time ||
    previous.to_time !== current.to_time
  ) {
    lines.push(
      `🕒 قبلی: ${escapeHtml(previous.from_time || "اعلام نشده")} تا ${escapeHtml(previous.to_time || "اعلام نشده")}`,
      `🕒 جدید: ${escapeHtml(current.from_time || "اعلام نشده")} تا ${escapeHtml(current.to_time || "اعلام نشده")}`,
    );
  }
  if (previous.outage_type !== current.outage_type) {
    lines.push(
      `📝 توضیح قبلی: ${escapeHtml(previous.outage_type || "اعلام نشده")}`,
      `📝 توضیح جدید: ${escapeHtml(current.outage_type || "اعلام نشده")}`,
    );
  }
  return lines.join("\n");
}

export async function notifyPersonalOutageChangesForCityDate(
  env: Env,
  cityKey: string,
  cityLabel: string,
  snapshotDate: string,
  previousRows: OutageRow[],
  currentRows: OutageRow[],
): Promise<{ usersNotified: number; eventsNotified: number; errors: string[] }> {
  const previousByKey = new Map(
    previousRows.map((row) => [row.outage_key, row] as const),
  );
  const rawChanges: Array<{
    changeType: "added" | "updated";
    previousRow: OutageRow | null;
    currentRow: OutageRow;
  }> = [];
  for (const currentRow of currentRows) {
    const previousRow = previousByKey.get(currentRow.outage_key) ?? null;
    if (!previousRow) {
      rawChanges.push({ changeType: "added", previousRow, currentRow });
      continue;
    }
    if (
      outageComparableSignature(previousRow) !==
      outageComparableSignature(currentRow)
    ) {
      rawChanges.push({ changeType: "updated", previousRow, currentRow });
    }
  }
  if (rawChanges.length === 0) {
    return { usersNotified: 0, eventsNotified: 0, errors: [] };
  }

  const [profiles, sentDailyProfileIds, sentEventKeys] = await Promise.all([
    listAuthorizedPersonalProfilesByCity(env.DB, cityKey),
    listSentPersonalNotificationProfileIds(env.DB, cityKey, snapshotDate),
    listSentPersonalChangeEventKeys(env.DB, cityKey, snapshotDate),
  ]);
  const grouped = new Map<
    string,
    { chatId: string; events: PersonalChangeEvent[] }
  >();

  for (const profile of profiles) {
    // A change alert is only useful after this profile has already received its
    // first daily notification for the date. Otherwise the normal daily alert
    // below will deliver the current version once.
    if (!sentDailyProfileIds.has(profile.profile_id)) {
      continue;
    }
    for (const rawChange of rawChanges) {
      const oldMatch = rawChange.previousRow
        ? profileMatchesRows(profile, [rawChange.previousRow]).length > 0
        : false;
      const newMatch =
        profileMatchesRows(profile, [rawChange.currentRow]).length > 0;
      if (!oldMatch && !newMatch) {
        continue;
      }
      const eventKey = await sha256Text(
        [
          profile.profile_id,
          snapshotDate,
          rawChange.currentRow.outage_key,
          rawChange.changeType,
          rawChange.previousRow
            ? outageComparableSignature(rawChange.previousRow)
            : "",
          outageComparableSignature(rawChange.currentRow),
        ].join("\u001f"),
      );
      if (sentEventKeys.has(eventKey)) {
        continue;
      }
      const current = grouped.get(profile.telegram_user_id) ?? {
        chatId: profile.chat_id,
        events: [],
      };
      current.events.push({ eventKey, profile, ...rawChange });
      grouped.set(profile.telegram_user_id, current);
    }
  }

  let usersNotified = 0;
  let eventsNotified = 0;
  const errors: string[] = [];
  for (const [telegramUserId, group] of grouped) {
    try {
      await sendBlocks(env, group.chatId, [
        "🔄 <b>تغییر برنامه خاموشی من</b>",
        ...group.events.map((event) => formatPersonalChangeEvent(cityLabel, event)),
      ]);
      await recordPersonalChangeDeliveries(
        env.DB,
        group.events.map((event) => ({
          eventKey: event.eventKey,
          profile: event.profile,
          snapshotDate,
          outageKey: event.currentRow.outage_key,
          changeType: event.changeType,
        })),
      );
      usersNotified += 1;
      eventsNotified += group.events.length;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown Telegram error";
      errors.push(`${telegramUserId}: ${message}`);
      console.error("Personal outage change notification failed:", error);
    }
  }
  return { usersNotified, eventsNotified, errors };
}

function datePartsToPersianText(parts: DateParts): string {
  return `${String(parts.year).padStart(4, "0")}/${String(parts.month).padStart(2, "0")}/${String(parts.day).padStart(2, "0")}`
    .replace(/[0-9]/g, (digit) => toPersianDigits(digit));
}

function minutesUntilOutage(
  row: OutageRow,
  now: TehranNow,
  tomorrow: DateParts,
): number | null {
  const rowDate = parseJalaliDate(row.outage_date);
  const start = parseTimeMinutes(row.from_time);
  if (!rowDate || start === null) {
    return null;
  }
  if (compareDates(rowDate, now) === 0) {
    return start - now.minutes;
  }
  if (compareDates(rowDate, tomorrow) === 0) {
    return 24 * 60 - now.minutes + start;
  }
  return null;
}

export async function runScheduledPersonalReminders(
  env: Env,
): Promise<{ usersNotified: number; remindersSent: number; errors: string[] }> {
  const nowDate = new Date();
  const now = getTehranNowAt(nowDate);
  const tomorrow = getTehranNowAt(
    new Date(nowDate.getTime() + 24 * 60 * 60 * 1000),
  );
  if (!now || !tomorrow) {
    throw new Error("Could not resolve Tehran date for reminder processing.");
  }
  const profiles = await listAuthorizedPersonalProfilesWithReminders(env.DB);
  if (profiles.length === 0) {
    return { usersNotified: 0, remindersSent: 0, errors: [] };
  }

  const dateTexts = [
    datePartsToPersianText(now),
    datePartsToPersianText(tomorrow),
  ];
  const sentKeys = await listSentReminderKeys(env.DB, dateTexts);
  const rowsByCity = new Map<string, OutageRow[]>();
  const grouped = new Map<
    string,
    {
      chatId: string;
      items: Array<{
        profile: AuthorizedPersonalProfile;
        row: OutageRow;
        minutesUntil: number;
      }>;
    }
  >();

  for (const profile of profiles) {
    let cityRows = rowsByCity.get(profile.city_key);
    if (!cityRows) {
      cityRows = await listCityOutages(env.DB, profile.city_key);
      rowsByCity.set(profile.city_key, cityRows);
    }
    for (const row of profileMatchesRows(profile, cityRows)) {
      const remaining = minutesUntilOutage(row, now, tomorrow);
      if (
        remaining === null ||
        remaining <= 0 ||
        remaining > profile.reminder_minutes
      ) {
        continue;
      }
      const key = `${profile.profile_id}|${row.outage_date}|${row.outage_key}|${profile.reminder_minutes}`;
      if (sentKeys.has(key)) {
        continue;
      }
      const current = grouped.get(profile.telegram_user_id) ?? {
        chatId: profile.chat_id,
        items: [],
      };
      current.items.push({ profile, row, minutesUntil: remaining });
      grouped.set(profile.telegram_user_id, current);
    }
  }

  let usersNotified = 0;
  let remindersSent = 0;
  const errors: string[] = [];
  for (const [telegramUserId, group] of grouped) {
    const blocks = group.items.map(({ profile, row, minutesUntil }) => {
      const city = cityByKey(profile.city_key);
      return [
        `⏰ <b>${escapeHtml(profile.profile_label)}</b>`,
        `🏙 ${escapeHtml(city?.label ?? profile.city_key)}`,
        `📍 ${escapeHtml(row.address)}`,
        `🕒 ${escapeHtml(row.from_time)} تا ${escapeHtml(row.to_time || "اعلام نشده")}`,
        `⌛️ شروع حدود ${toPersianDigits(minutesUntil)} دقیقه دیگر`,
      ].join("\n");
    });
    try {
      await sendBlocks(env, group.chatId, [
        "⏰ <b>یادآوری خاموشی</b>",
        ...blocks,
      ]);
      await recordReminderDeliveries(
        env.DB,
        group.items.map(({ profile, row }) => ({
          profile,
          snapshotDate: row.outage_date,
          outageKey: row.outage_key,
        })),
      );
      usersNotified += 1;
      remindersSent += group.items.length;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown Telegram error";
      errors.push(`${telegramUserId}: ${message}`);
      console.error("Personal outage reminder failed:", error);
    }
  }
  return { usersNotified, remindersSent, errors };
}

export async function notifySpecialOutageChanges(
  env: Env,
  changes: SpecialSyncChange[],
): Promise<{ usersNotified: number; eventsRecorded: number; errors: string[] }> {
  let usersNotified = 0;
  let eventsRecorded = 0;
  const errors: string[] = [];
  for (const change of changes) {
    const heading = change.eventType === "initial"
      ? "⭐ <b>برنامه خاموشی ویژه ثبت شد</b>"
      : change.eventType === "cleared"
        ? "✅ <b>برنامه خاموشی ویژه حذف شد</b>"
        : "🔄 <b>برنامه خاموشی ویژه تغییر کرد</b>";
    const blocks = change.current.length > 0
      ? change.current.map(formatSpecialOutageBlock)
      : ["در آخرین استعلام، خاموشی برنامه‌ریزی‌شده‌ای گزارش نشد."];
    try {
      await sendBlocks(
        env,
        change.request.chat_id,
        [
          heading,
          `🏷 <b>${escapeHtml(change.request.request_label)}</b>`,
          ...blocks,
        ],
        {
          inline_keyboard: [
            [{
              text: "🔎 مشاهده آخرین نتیجه",
              callback_data: `${SPECIAL_VIEW_PREFIX}${change.request.request_id}`,
            }],
            [{ text: "🏠 منوی اصلی", callback_data: MAIN_MENU_CALLBACK }],
          ],
        },
      );
      await recordSpecialChangeEvent(env.DB, change);
      usersNotified += 1;
      eventsRecorded += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown Telegram error";
      errors.push(`${change.request.telegram_user_id}: ${message}`);
      console.error("Special outage change notification failed:", error);
    }
  }
  return { usersNotified, eventsRecorded, errors };
}

export async function runScheduledSpecialReminders(
  env: Env,
): Promise<{ usersNotified: number; remindersSent: number; errors: string[] }> {
  const due = await listDueSpecialReminders(env.DB);
  const grouped = new Map<string, typeof due>();
  for (const item of due) {
    const current = grouped.get(item.request.telegram_user_id) ?? [];
    current.push(item);
    grouped.set(item.request.telegram_user_id, current);
  }
  let usersNotified = 0;
  let remindersSent = 0;
  const errors: string[] = [];
  for (const [telegramUserId, items] of grouped) {
    const first = items[0];
    if (!first) continue;
    try {
      await sendBlocks(env, first.request.chat_id, [
        "⏰ <b>یادآوری خاموشی ویژه</b>",
        ...items.map((item) => [
          `🏷 <b>${escapeHtml(item.request.request_label)}</b>`,
          formatSpecialOutageBlock(item.outage),
          `⌛️ شروع حدود ${toPersianDigits(item.minutes_until)} دقیقه دیگر`,
        ].join("\n")),
      ]);
      for (const item of items) {
        await recordSpecialReminder(
          env.DB,
          item.request.request_id,
          item.outage.outage_key,
          item.request.reminder_minutes,
        );
      }
      usersNotified += 1;
      remindersSent += items.length;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown Telegram error";
      errors.push(`${telegramUserId}: ${message}`);
      console.error("Special outage reminder failed:", error);
    }
  }
  return { usersNotified, remindersSent, errors };
}

export async function notifyAdminProviderHealth(
  env: Env,
  health: ProviderHealthUpdate,
): Promise<void> {
  if (!health.should_notify_admin) return;
  const adminId = env.ADMIN_TELEGRAM_USER_ID?.trim();
  if (!adminId) return;
  await sendMessage(
    env,
    adminId,
    [
      "⚠️ <b>نیاز به ورود دوباره برق‌من</b>",
      `🔌 <b>ارائه‌دهنده:</b> ${escapeHtml(health.provider_key)}`,
      `📌 <b>وضعیت:</b> ${escapeHtml(health.status)}`,
      health.token_expires_at
        ? `⏳ <b>انقضای توکن:</b> ${escapeHtml(formatTehranDateTime(health.token_expires_at))}`
        : "",
      health.detail ? `📝 ${escapeHtml(health.detail)}` : "",
      "",
      "روی رایانه شخصی اسکریپت bargheman_bootstrap.py را دوباره اجرا کنید تا Secretهای GitHub به‌روزرسانی شوند.",
    ].filter(Boolean).join("\n"),
    adminMenuKeyboard(),
  );
}

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

function isPrivateConversation(
  message: TelegramMessage,
  user: TelegramUser,
): boolean {
  return (
    message.chat.type === "private" ||
    (message.chat.type === undefined &&
      String(message.chat.id) === String(user.id))
  );
}

function activeLockMinutes(lockedUntil: string | null): number {
  if (!lockedUntil) {
    return 0;
  }
  const remaining = Date.parse(lockedUntil) - Date.now();
  return remaining > 0 ? Math.max(1, Math.ceil(remaining / 60000)) : 0;
}

function isAdmin(env: Env, telegramUserId: string | null): boolean {
  const configured = env.ADMIN_TELEGRAM_USER_ID?.trim() ?? "";
  return Boolean(configured && telegramUserId && configured === telegramUserId);
}

function mainMenuFor(env: Env, telegramUserId: string | null) {
  return mainMenuKeyboard(isAdmin(env, telegramUserId));
}

function profileModeLabel(mode: PersonalMatchMode): string {
  return mode === "outage_number"
    ? "شماره خاموشی (کد ابتدای آدرس)"
    : "کلمه آدرس";
}

function reminderLabel(minutes: number): string {
  if (minutes === 60) {
    return "۶۰ دقیقه قبل";
  }
  if (minutes === 30) {
    return "۳۰ دقیقه قبل";
  }
  return "بدون یادآوری";
}

function reminderMinutesFromButton(text: string): number | null {
  if (text === REMINDER_60_BUTTON) {
    return 60;
  }
  if (text === REMINDER_30_BUTTON) {
    return 30;
  }
  if (text === REMINDER_NONE_BUTTON) {
    return 0;
  }
  return null;
}

function profileDisplayValue(profile: PersonalOutageProfile): string {
  return profile.match_mode === "outage_number"
    ? toPersianDigits(profile.match_value)
    : profile.match_value;
}

function personalDashboardKeyboard(
  profiles: PersonalOutageProfile[],
): InlineKeyboardMarkup {
  const rows: InlineKeyboardMarkup["inline_keyboard"] = [];
  profiles.forEach((profile, index) => {
    rows.push([
      {
        text: `🔎 ${toPersianDigits(index + 1)}. ${profile.profile_label}`,
        callback_data: `${PERSONAL_SHOW_PREFIX}${profile.profile_id}`,
      },
    ]);
    rows.push([
      {
        text: "✏️ ویرایش",
        callback_data: `${PERSONAL_EDIT_PREFIX}${profile.profile_id}`,
      },
      {
        text: "🗑 حذف",
        callback_data: `${PERSONAL_DELETE_PREFIX}${profile.profile_id}`,
      },
    ]);
  });
  if (profiles.length < 3) {
    rows.push([{ text: "➕ افزودن خاموشی", callback_data: PERSONAL_ADD_CALLBACK }]);
  }
  rows.push([{ text: "🔄 تازه‌سازی", callback_data: PERSONAL_DASHBOARD_CALLBACK }]);
  rows.push([{ text: "🏠 منوی اصلی", callback_data: MAIN_MENU_CALLBACK }]);
  return { inline_keyboard: rows };
}

function personalProfileActionsKeyboard(
  profile: PersonalOutageProfile,
): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        {
          text: "✏️ ویرایش",
          callback_data: `${PERSONAL_EDIT_PREFIX}${profile.profile_id}`,
        },
        {
          text: "🗑 حذف",
          callback_data: `${PERSONAL_DELETE_PREFIX}${profile.profile_id}`,
        },
      ],
      [{ text: "⬅️ فهرست خاموشی من", callback_data: PERSONAL_DASHBOARD_CALLBACK }],
      [{ text: "🏠 منوی اصلی", callback_data: MAIN_MENU_CALLBACK }],
    ],
  };
}

async function showPersonalDashboard(
  env: Env,
  chatId: string,
  telegramUserId: string,
): Promise<void> {
  const profiles = await listPersonalOutageProfiles(env.DB, telegramUserId);
  const lines = ["⚡️ <b>خاموشی من</b>"];
  if (profiles.length === 0) {
    lines.push("", "هنوز خاموشی شخصی ذخیره نکرده‌اید.");
  } else {
    lines.push("", `می‌توانید حداکثر ۳ تنظیم ذخیره کنید. اکنون ${toPersianDigits(profiles.length)} تنظیم دارید.`, "");
    profiles.forEach((profile, index) => {
      const city = cityByKey(profile.city_key);
      lines.push(
        `${toPersianDigits(index + 1)}. <b>${escapeHtml(profile.profile_label)}</b> — ${escapeHtml(city?.label ?? profile.city_key)}`,
        `   ${escapeHtml(profileModeLabel(profile.match_mode))}: ${escapeHtml(profileDisplayValue(profile))}`,
        `   یادآوری: ${escapeHtml(reminderLabel(profile.reminder_minutes))}`,
      );
    });
  }
  await sendMessage(
    env,
    chatId,
    lines.join("\n"),
    personalDashboardKeyboard(profiles),
  );
}

async function showPersonalProfile(
  env: Env,
  chatId: string,
  profile: PersonalOutageProfile,
): Promise<void> {
  const city = cityByKey(profile.city_key);
  if (!city) {
    await sendMessage(
      env,
      chatId,
      "شهر ذخیره‌شده دیگر معتبر نیست. این تنظیم را ویرایش یا حذف کنید.",
      personalProfileActionsKeyboard(profile),
    );
    return;
  }
  const rows = profileMatchesRows(
    profile,
    await listCityOutages(env.DB, profile.city_key),
  );
  const title = [
    `⚡️ <b>${escapeHtml(profile.profile_label)}</b>`,
    `<b>${escapeHtml(profileModeLabel(profile.match_mode))}:</b> ${escapeHtml(profileDisplayValue(profile))}`,
    `⏰ <b>یادآوری:</b> ${escapeHtml(reminderLabel(profile.reminder_minutes))}`,
  ].join("\n");
  if (rows.length === 0) {
    await sendMessage(
      env,
      chatId,
      [title, "", "در فهرست فعال فعلی، مورد مطابقی پیدا نشد."].join("\n"),
      personalProfileActionsKeyboard(profile),
    );
    return;
  }
  await sendOutageResults(
    env,
    chatId,
    city.label,
    rows,
    title,
    personalProfileActionsKeyboard(profile),
  );
}

async function beginPersonalizationSetup(
  env: Env,
  chatId: string,
  telegramUserId: string,
  profileId: string | null = null,
): Promise<void> {
  let profile: PersonalOutageProfile | null = null;
  if (profileId) {
    profile = await getPersonalOutageProfile(env.DB, telegramUserId, profileId);
    if (!profile) {
      await sendMessage(env, chatId, "این تنظیم پیدا نشد.");
      await showPersonalDashboard(env, chatId, telegramUserId);
      return;
    }
  } else {
    const profiles = await listPersonalOutageProfiles(env.DB, telegramUserId);
    if (profiles.length >= 3) {
      await sendMessage(env, chatId, "حداکثر ۳ تنظیم «خاموشی من» قابل ذخیره است.");
      await showPersonalDashboard(env, chatId, telegramUserId);
      return;
    }
  }
  await setPersonalizationFlow(
    env.DB,
    telegramUserId,
    chatId,
    PERSONALIZATION_FLOW_LABEL,
    profile?.city_key ?? null,
    profile?.match_mode ?? null,
    profile?.profile_id ?? null,
    profile?.profile_label ?? null,
    profile?.match_value ?? null,
  );
  await sendMessage(
    env,
    chatId,
    profile
      ? `یک نام برای این تنظیم بفرستید. نام فعلی: <b>${escapeHtml(profile.profile_label)}</b>`
      : "یک نام کوتاه برای این تنظیم بفرستید؛ مثلاً «خانه»، «محل کار» یا «مغازه».",
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
      mainMenuFor(env, telegramUserId),
    );
    return false;
  }
  const configuredPassword = env.PERSONALIZATION_PASSWORD?.trim() ?? "";
  if (!configuredPassword) {
    await sendMessage(
      env,
      chatId,
      "قابلیت «خاموشی من» هنوز توسط مدیر فعال نشده است.",
      mainMenuFor(env, telegramUserId),
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
  await showPersonalDashboard(env, chatId, telegramUserId);
}

function adminUserDisplay(user: TelegramUserRecord): string {
  const name = [user.first_name, user.last_name].filter(Boolean).join(" ").trim();
  const username = user.username ? `@${user.username}` : "";
  return name || username || user.telegram_user_id;
}

async function generateCityKey(label: string): Promise<string> {
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

function parseAdminSourceIds(text: string): {
  ids: number[];
  duplicates: number[];
  invalid: string[];
} {
  const ascii = normalizeDigits(text);
  const tokens = ascii
    .split(/[\s,،;؛|/]+/)
    .map((value) => value.trim())
    .filter(Boolean);
  const ids: number[] = [];
  const duplicates: number[] = [];
  const invalid: string[] = [];
  const seen = new Set<number>();
  for (const token of tokens) {
    if (!/^\d+$/.test(token)) {
      invalid.push(token);
      continue;
    }
    const value = Number(token);
    if (!Number.isInteger(value) || value <= 0 || value > 1000000) {
      invalid.push(token);
      continue;
    }
    if (seen.has(value)) {
      duplicates.push(value);
      continue;
    }
    seen.add(value);
    ids.push(value);
  }
  ids.sort((a, b) => a - b);
  return { ids, duplicates: [...new Set(duplicates)], invalid };
}

async function openAdminHome(
  env: Env,
  chatId: string,
  telegramUserId: string,
): Promise<void> {
  if (!isAdmin(env, telegramUserId)) {
    await sendMessage(env, chatId, "دسترسی مدیریت برای این حساب فعال نیست.");
    return;
  }
  await clearAdminFlow(env.DB, telegramUserId);
  await sendMessage(
    env,
    chatId,
    "🛡 <b>پنل مدیریت</b>\n\nیکی از بخش‌ها را انتخاب کنید:",
    adminMenuKeyboard(),
  );
}

async function openAdminUsers(
  env: Env,
  chatId: string,
  telegramUserId: string,
): Promise<void> {
  if (!isAdmin(env, telegramUserId)) {
    await sendMessage(env, chatId, "دسترسی مدیریت برای این حساب فعال نیست.");
    return;
  }
  const users = await listAuthorizedTelegramUsers(env.DB, 50);
  const keyboard: InlineKeyboardMarkup = {
    inline_keyboard: [
      ...users.map((user) => [
        {
          text: `🚫 ${adminUserDisplay(user).slice(0, 28)} | ${user.telegram_user_id}`,
          callback_data: `${ADMIN_REVOKE_PREFIX}${user.telegram_user_id}`,
        },
      ]),
      [{ text: "🔄 تازه‌سازی", callback_data: ADMIN_REFRESH_CALLBACK }],
      [{ text: "⬅️ پنل مدیریت", callback_data: ADMIN_HOME_CALLBACK }],
      [{ text: "🏠 منوی اصلی", callback_data: MAIN_MENU_CALLBACK }],
    ],
  };
  await sendMessage(
    env,
    chatId,
    users.length > 0
      ? `👥 <b>مدیریت کاربران</b>\n\nبرای لغو دسترسی، روی کاربر بزنید. قبل از لغو، تأیید جداگانه گرفته می‌شود. ${toPersianDigits(users.length)} کاربر مجاز نمایش داده شده است.`
      : "👥 <b>مدیریت کاربران</b>\n\nکاربر مجازی وجود ندارد.",
    keyboard,
  );
}

function cityStatusLabel(city: {
  is_active: number;
  discovery_status: string;
  source_city_ids: number[];
}): string {
  if (city.is_active === 1) return "فعال";
  if (city.discovery_status === "requested") return "در انتظار کشف";
  if (city.discovery_status === "proposal_ready") return "در انتظار تأیید";
  if (city.discovery_status === "failed") return "کشف ناموفق";
  return "غیرفعال";
}

async function openAdminCities(
  env: Env,
  chatId: string,
  telegramUserId: string,
): Promise<void> {
  if (!isAdmin(env, telegramUserId)) {
    await sendMessage(env, chatId, "دسترسی مدیریت برای این حساب فعال نیست.");
    return;
  }
  const cities = await listManagedCities(env.DB);
  const rows: InlineKeyboardMarkup["inline_keyboard"] = [
    [
      {
        text: "➕ افزودن شهر",
        callback_data: ADMIN_CITY_ADD_CALLBACK,
      },
    ],
    [
      {
        text: "🔄 مرکز بروزرسانی",
        callback_data: ADMIN_UPDATES_CALLBACK,
      },
    ],
  ];
  for (const city of cities) {
    rows.push([
      {
        text: `✏️ ${city.label} (${toPersianDigits(city.source_city_ids.length)})`,
        callback_data: `${ADMIN_CITY_EDIT_PREFIX}${city.key}`,
      },
      {
        text: city.is_active === 1 ? "⛔ غیرفعال" : "ℹ️ جزئیات",
        callback_data: `${ADMIN_CITY_DISABLE_PREFIX}${city.key}`,
      },
    ]);
  }
  rows.push([{ text: "🔄 تازه‌سازی", callback_data: ADMIN_CITIES_CALLBACK }]);
  rows.push([{ text: "⬅️ پنل مدیریت", callback_data: ADMIN_HOME_CALLBACK }]);
  rows.push([{ text: "🏠 منوی اصلی", callback_data: MAIN_MENU_CALLBACK }]);

  const details = cities.length === 0
    ? "هنوز شهری ثبت نشده است."
    : cities.map((city) =>
        `• <b>${escapeHtml(city.label)}</b> — ${cityStatusLabel(city)} — منابع: ${city.source_city_ids.length > 0 ? city.source_city_ids.map(toPersianDigits).join("، ") : "ثبت نشده"}`,
      ).join("\n");
  await sendMessage(
    env,
    chatId,
    [
      "🏙 <b>مدیریت شهرها</b>",
      "",
      details,
      "",
      "برای تغییر شماره‌ها روی نام شهر بزنید. غیرفعال‌سازی، شهر را از منو و Fetch حذف می‌کند ولی تاریخچه و پروفایل‌ها را پاک نمی‌کند.",
      "برای بروزرسانی، کشف شناسه‌ها و مشاهده وضعیت Runner از «مرکز بروزرسانی» استفاده کنید.",
    ].join("\n"),
    { inline_keyboard: rows },
  );
}

async function beginAdminAddCity(
  env: Env,
  chatId: string,
  telegramUserId: string,
): Promise<void> {
  await setAdminFlow(
    env.DB,
    telegramUserId,
    chatId,
    "awaiting_city_label",
    null,
    null,
  );
  await sendMessage(
    env,
    chatId,
    "نام شهر را دقیقاً مطابق نام نمایش‌داده‌شده در Maztozi وارد کنید؛ مثلاً «نکا».",
    {
      keyboard: [[{ text: CANCEL_BUTTON }, { text: MAIN_MENU_BUTTON }]],
      resize_keyboard: true,
      is_persistent: true,
    },
  );
}

async function showAdminCitySaveConfirmation(
  env: Env,
  chatId: string,
  telegramUserId: string,
): Promise<void> {
  const flow = await getAdminFlow(env.DB, telegramUserId);
  if (!flow?.city_key || !flow.city_label) return;
  const ids = adminFlowSourceIds(flow);
  const conflicts = await findSourceConflicts(env.DB, ids, flow.city_key);
  if (conflicts.length > 0) {
    await sendMessage(
      env,
      chatId,
      [
        "⚠️ <b>امکان ذخیره وجود ندارد</b>",
        "شماره‌های زیر قبلاً برای شهر دیگری فعال هستند:",
        ...conflicts.map((row) =>
          `• ${toPersianDigits(row.source_city_id)} — ${escapeHtml(row.city_label)}`,
        ),
        "",
        "شماره‌ها را اصلاح و دوباره ارسال کنید.",
      ].join("\n"),
    );
    return;
  }
  const keyboard: InlineKeyboardMarkup = {
    inline_keyboard: [
      [
        { text: "✅ تأیید و ذخیره", callback_data: ADMIN_CITY_SAVE_CONFIRM_CALLBACK },
        { text: "❌ انصراف", callback_data: ADMIN_CITIES_CALLBACK },
      ],
      [{ text: "🏠 منوی اصلی", callback_data: MAIN_MENU_CALLBACK }],
    ],
  };
  await sendMessage(
    env,
    chatId,
    [
      "⚠️ <b>تأیید تغییر حساس</b>",
      `🏙 <b>شهر:</b> ${escapeHtml(flow.city_label)}`,
      `🔢 <b>شماره‌های منبع:</b> ${ids.map(toPersianDigits).join("، ")}`,
      "",
      "با تأیید، شماره‌های فعال قبلی این شهر با این فهرست جایگزین می‌شوند.",
    ].join("\n"),
    keyboard,
  );
}

async function handleAdminTextFlow(
  env: Env,
  chatId: string,
  telegramUserId: string,
  text: string,
): Promise<boolean> {
  const flow = await getAdminFlow(env.DB, telegramUserId);
  if (!flow) return false;
  if (text === CANCEL_BUTTON) {
    await clearAdminFlow(env.DB, telegramUserId);
    await sendMessage(env, chatId, "عملیات مدیریت لغو شد.", adminMenuKeyboard());
    return true;
  }
  if (flow.state === "awaiting_city_label") {
    const label = normalizePersianText(text);
    if (label.length < 2 || label.length > 50) {
      await sendMessage(env, chatId, "نام شهر باید بین ۲ تا ۵۰ نویسه باشد.");
      return true;
    }
    const existing = await findCityByLabel(env.DB, label);
    if (existing) {
      await sendMessage(
        env,
        chatId,
        `⚠️ شهر <b>${escapeHtml(label)}</b> از قبل ثبت شده است. برای تغییر شماره‌ها از فهرست مدیریت شهرها روی همان شهر بزنید.`,
        adminMenuKeyboard(),
      );
      await clearAdminFlow(env.DB, telegramUserId);
      return true;
    }
    const key = await generateCityKey(label);
    await setAdminFlow(
      env.DB,
      telegramUserId,
      chatId,
      "choosing_source_mode",
      key,
      label,
    );
    await sendMessage(
      env,
      chatId,
      "شماره‌های منبع را چگونه دریافت کنیم؟\n\nکشف خودکار فقط وقتی خودتان دکمه اجرای کشف را بزنید، سایت Maztozi را با مرورگر باز می‌کند و شماره‌ها را استخراج می‌کند. نتیجه قبل از فعال‌سازی برای تأیید شما ارسال می‌شود.",
      adminSourceModeKeyboard(),
    );
    return true;
  }
  if (flow.state === "choosing_source_mode") {
    if (text === ADMIN_AUTO_SOURCE_BUTTON) {
      await setAdminFlow(
        env.DB,
        telegramUserId,
        chatId,
        "confirm_discovery",
        flow.city_key,
        flow.city_label,
        [],
        "auto",
      );
      const keyboard: InlineKeyboardMarkup = {
        inline_keyboard: [
          [
            { text: "✅ ثبت درخواست کشف", callback_data: ADMIN_CITY_DISCOVERY_CONFIRM_CALLBACK },
            { text: "❌ انصراف", callback_data: ADMIN_CITIES_CALLBACK },
          ],
          [{ text: "🏠 منوی اصلی", callback_data: MAIN_MENU_CALLBACK }],
        ],
      };
      await sendMessage(
        env,
        chatId,
        `⚠️ درخواست کشف خودکار برای شهر <b>${escapeHtml(flow.city_label ?? "")}</b> ثبت شود؟\n\nشهر تا پیدا شدن شماره‌ها و تأیید نهایی فعال نمی‌شود.`,
        keyboard,
      );
      return true;
    }
    if (text === ADMIN_MANUAL_SOURCE_BUTTON) {
      await setAdminFlow(
        env.DB,
        telegramUserId,
        chatId,
        "awaiting_source_ids",
        flow.city_key,
        flow.city_label,
        [],
        "manual",
      );
      await sendMessage(
        env,
        chatId,
        "شماره‌ها را با فاصله یا ویرگول ارسال کنید؛ مثلاً:\n<code>۲۲، ۲۳، ۲۶</code>",
        {
          keyboard: [[{ text: CANCEL_BUTTON }, { text: MAIN_MENU_BUTTON }]],
          resize_keyboard: true,
          is_persistent: true,
        },
      );
      return true;
    }
    await sendMessage(env, chatId, "یکی از دو روش نمایش‌داده‌شده را انتخاب کنید.", adminSourceModeKeyboard());
    return true;
  }
  if (flow.state === "awaiting_source_ids") {
    const parsed = parseAdminSourceIds(text);
    if (parsed.invalid.length > 0 || parsed.ids.length === 0) {
      await sendMessage(
        env,
        chatId,
        `⚠️ ورودی معتبر نیست.${parsed.invalid.length ? ` موارد نامعتبر: ${escapeHtml(parsed.invalid.join("، "))}` : ""}\nفقط عددهای مثبت را با فاصله یا ویرگول ارسال کنید.`,
      );
      return true;
    }
    if (parsed.ids.length > 50) {
      await sendMessage(env, chatId, "حداکثر ۵۰ شماره برای هر شهر پذیرفته می‌شود.");
      return true;
    }
    await setAdminFlow(
      env.DB,
      telegramUserId,
      chatId,
      "confirm_manual_save",
      flow.city_key,
      flow.city_label,
      parsed.ids,
      "manual",
    );
    if (parsed.duplicates.length > 0) {
      await sendMessage(
        env,
        chatId,
        `⚠️ شماره‌های تکراری ${parsed.duplicates.map(toPersianDigits).join("، ")} فقط یک بار در نظر گرفته شدند.`,
      );
    }
    await showAdminCitySaveConfirmation(env, chatId, telegramUserId);
    return true;
  }
  return true;
}

function formatTehranDateTime(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return value || "نامشخص";
  }
  return new Intl.DateTimeFormat("fa-IR", {
    timeZone: TEHRAN_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(timestamp));
}

async function openAdminSystemStatus(
  env: Env,
  chatId: string,
  telegramUserId: string,
): Promise<void> {
  if (!isAdmin(env, telegramUserId)) {
    await sendMessage(env, chatId, "دسترسی مدیریت برای این حساب فعال نیست.");
    return;
  }
  const [stats, statuses] = await Promise.all([
    getAdminSystemStats(env.DB),
    listSyncStatuses(env.DB),
  ]);
  const now = Date.now();
  const staleCities = statuses.filter((status) => {
    const fetchedAt = Date.parse(status.fetched_at);
    return !Number.isFinite(fetchedAt) || now - fetchedAt > 8 * 60 * 60 * 1000;
  });
  const activeCities = statuses.filter((status) => Boolean(status.active_date));
  const latestFetch = statuses
    .map((status) => status.fetched_at)
    .filter(Boolean)
    .sort((left, right) => Date.parse(right) - Date.parse(left))[0] ?? "";
  const cityLines = statuses.map((status) => {
    const city = cityByKey(status.city_key);
    const pending = status.pending_date
      ? ` | در انتظار ${status.pending_date}`
      : "";
    return `• ${escapeHtml(city?.label ?? status.city_key)}: ${toPersianDigits(status.row_count)} مورد | ${escapeHtml(status.last_decision || "نامشخص")}${escapeHtml(pending)}`;
  });
  const keyboard: InlineKeyboardMarkup = {
    inline_keyboard: [
      [{ text: "🔄 تازه‌سازی وضعیت", callback_data: ADMIN_STATUS_CALLBACK }],
      [{ text: "👥 مدیریت کاربران", callback_data: ADMIN_REFRESH_CALLBACK }],
      [{ text: "🏙 مدیریت شهرها", callback_data: ADMIN_CITIES_CALLBACK }],
      [{ text: "⭐ درخواست‌های ویژه", callback_data: ADMIN_SPECIAL_CALLBACK }],
      [{ text: "⬅️ پنل مدیریت", callback_data: ADMIN_HOME_CALLBACK }],
      [{ text: "🏠 منوی اصلی", callback_data: MAIN_MENU_CALLBACK }],
    ],
  };
  await sendMessage(
    env,
    chatId,
    [
      "📊 <b>وضعیت سامانه</b>",
      "",
      `${staleCities.length === 0 ? "🟢" : "🟠"} <b>وضعیت:</b> ${staleCities.length === 0 ? "سالم" : "نیازمند بررسی"}`,
      `🕒 <b>آخرین Fetch:</b> ${escapeHtml(latestFetch ? formatTehranDateTime(latestFetch) : "ثبت نشده")}`,
      `🏙 <b>شهرهای فعال:</b> ${toPersianDigits(activeCities.length)} از ${toPersianDigits(statuses.length)}`,
      `⚡️ <b>خاموشی‌های فعال:</b> ${toPersianDigits(stats.active_outages)}`,
      `👤 <b>کاربران مجاز:</b> ${toPersianDigits(stats.authorized_users)}`,
      `🏠 <b>پروفایل‌های شخصی:</b> ${toPersianDigits(stats.personal_profiles)}`,
      `🔔 <b>اعلان روزانه در ۲۴ ساعت:</b> ${toPersianDigits(stats.daily_notifications_24h)}`,
      `🔄 <b>اعلان تغییر در ۲۴ ساعت:</b> ${toPersianDigits(stats.change_notifications_24h)}`,
      `⏰ <b>یادآوری در ۲۴ ساعت:</b> ${toPersianDigits(stats.reminders_24h)}`,
      `⭐ <b>درخواست ویژه در انتظار:</b> ${toPersianDigits(stats.pending_special_requests)}`,
      `💛 <b>مجموع حمایت Stars:</b> ${toPersianDigits(stats.support_stars_total)}`,
      `₮ <b>تتر در انتظار تأیید:</b> ${toPersianDigits(stats.pending_tether_submissions)}`,
      `🧰 <b>عملیات دستی در ۲۴ ساعت:</b> ${toPersianDigits(stats.manual_operations_24h)}`,
      `🗄 <b>رکوردهای آرشیو:</b> ${toPersianDigits(stats.archived_outages)}`,
      `🔢 <b>مشاهدات کد ابتدای آدرس:</b> ${toPersianDigits(stats.outage_number_observations)}`,
      staleCities.length > 0
        ? `⚠️ <b>شهرهای بدون Fetch تازه:</b> ${staleCities.map((status) => escapeHtml(cityByKey(status.city_key)?.label ?? status.city_key)).join("، ")}`
        : "✅ همه شهرها در بازه مورد انتظار به‌روز شده‌اند.",
      "",
      "<b>جزئیات شهرها:</b>",
      ...cityLines,
      "",
      "اندازه دقیق فایل D1 از داخل Worker قابل خواندن نیست؛ برای آن از wrangler d1 info استفاده کنید.",
    ].join("\n"),
    keyboard,
  );
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
    await sendMessage(env, chatId, "عملیات لغو شد.", mainMenuFor(env, telegramUserId));
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
        mainMenuFor(env, telegramUserId),
      );
      return true;
    }
    const expectedPassword = env.PERSONALIZATION_PASSWORD?.trim() ?? "";
    if (expectedPassword && secureTextEquals(text, expectedPassword)) {
      await authorizeTelegramUser(env.DB, telegramUserId);
      await clearPersonalizationFlow(env.DB, telegramUserId);
      await sendMessage(env, chatId, "دسترسی «خاموشی من» فعال شد.");
      await showPersonalDashboard(env, chatId, telegramUserId);
      return true;
    }
    const failure = await recordPasswordFailure(env.DB, telegramUserId);
    if (failure.lockedUntil) {
      await clearPersonalizationFlow(env.DB, telegramUserId);
      await sendMessage(
        env,
        chatId,
        `رمز نادرست بود. پس از ${toPersianDigits(PASSWORD_WINDOW_MINUTES)} دقیقه می‌توانید دوباره تلاش کنید.`,
        mainMenuFor(env, telegramUserId),
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

  if (flow.state === PERSONALIZATION_FLOW_LABEL) {
    const label = normalizePersianText(text);
    if (label.length < 2 || label.length > 30) {
      await sendMessage(env, chatId, "نام تنظیم باید بین ۲ تا ۳۰ نویسه باشد.");
      return true;
    }
    await setPersonalizationFlow(
      env.DB,
      telegramUserId,
      chatId,
      PERSONALIZATION_FLOW_CITY,
      flow.city_key,
      flow.match_mode,
      flow.profile_id,
      label,
      flow.match_value,
    );
    await sendMessage(
      env,
      chatId,
      "شهر مربوط به این تنظیم را انتخاب کنید:",
      personalizationCityKeyboard(),
    );
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
      flow.match_mode,
      flow.profile_id,
      flow.profile_label,
      flow.match_value,
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
      flow.profile_id,
      flow.profile_label,
      flow.match_value,
    );
    await sendMessage(
      env,
      chatId,
      mode === "outage_number"
        ? "کد عددی ابتدای آدرس را وارد کنید؛ مثلاً برای «۱۵۳ - شهرک المپیک» عدد ۱۵۳. ارقام فارسی یا انگلیسی پذیرفته می‌شوند."
        : "بخشی از آدرس را وارد کنید؛ مثلاً نام خیابان، روستا یا محله.",
    );
    return true;
  }

  if (flow.state === PERSONALIZATION_FLOW_VALUE) {
    if (
      !flow.city_key ||
      !flow.match_mode ||
      !flow.profile_label ||
      !cityByKey(flow.city_key)
    ) {
      await clearPersonalizationFlow(env.DB, telegramUserId);
      await sendMessage(
        env,
        chatId,
        "اطلاعات این مرحله ناقص بود. دوباره «خاموشی من» را انتخاب کنید.",
        mainMenuFor(env, telegramUserId),
      );
      return true;
    }
    let matchValue = "";
    if (flow.match_mode === "outage_number") {
      matchValue = normalizeOutageNumber(text);
      if (!/^\d{1,8}$/.test(matchValue)) {
        await sendMessage(
          env,
          chatId,
          "کد ابتدای آدرس باید فقط شامل ۱ تا ۸ رقم باشد. دوباره ارسال کنید.",
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
    await setPersonalizationFlow(
      env.DB,
      telegramUserId,
      chatId,
      PERSONALIZATION_FLOW_REMINDER,
      flow.city_key,
      flow.match_mode,
      flow.profile_id,
      flow.profile_label,
      matchValue,
    );
    const currentProfile = flow.profile_id
      ? await getPersonalOutageProfile(env.DB, telegramUserId, flow.profile_id)
      : null;
    await sendMessage(
      env,
      chatId,
      currentProfile
        ? `زمان یادآوری را انتخاب کنید. تنظیم فعلی: <b>${escapeHtml(reminderLabel(currentProfile.reminder_minutes))}</b>`
        : "زمان یادآوری قبل از شروع خاموشی را انتخاب کنید:",
      personalizationReminderKeyboard(),
    );
    return true;
  }

  if (flow.state === PERSONALIZATION_FLOW_REMINDER) {
    const reminderMinutes = reminderMinutesFromButton(text);
    if (
      reminderMinutes === null ||
      !flow.city_key ||
      !flow.match_mode ||
      !flow.profile_label ||
      !flow.match_value ||
      !cityByKey(flow.city_key)
    ) {
      await sendMessage(
        env,
        chatId,
        "یکی از زمان‌های یادآوری نمایش‌داده‌شده را انتخاب کنید.",
        personalizationReminderKeyboard(),
      );
      return true;
    }
    let saved: PersonalOutageProfile;
    try {
      saved = await savePersonalOutageProfile(
        env.DB,
        telegramUserId,
        flow.profile_id,
        flow.profile_label,
        flow.city_key,
        flow.match_mode,
        flow.match_value,
        reminderMinutes,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message.includes("Duplicate")) {
        await sendMessage(
          env,
          chatId,
          "این شهر و مقدار قبلاً در یکی از تنظیم‌های «خاموشی من» ذخیره شده است. عملیات را دوباره آغاز کنید.",
        );
        await clearPersonalizationFlow(env.DB, telegramUserId);
        await showPersonalDashboard(env, chatId, telegramUserId);
        return true;
      }
      if (message.includes("at most three")) {
        await clearPersonalizationFlow(env.DB, telegramUserId);
        await sendMessage(env, chatId, "حداکثر ۳ تنظیم قابل ذخیره است.");
        await showPersonalDashboard(env, chatId, telegramUserId);
        return true;
      }
      throw error;
    }
    await clearPersonalizationFlow(env.DB, telegramUserId);
    await sendMessage(
      env,
      chatId,
      `تنظیم <b>${escapeHtml(saved.profile_label)}</b> با یادآوری <b>${escapeHtml(reminderLabel(saved.reminder_minutes))}</b> ذخیره شد.`,
      mainMenuFor(env, telegramUserId),
    );
    await showPersonalProfile(env, chatId, saved);
    return true;
  }

  await clearPersonalizationFlow(env.DB, telegramUserId);
  return false;
}

async function handleShowNewCallback(
  env: Env,
  callbackQuery: TelegramCallbackQuery,
  chatId: string,
  data: string,
): Promise<boolean> {
  if (!data.startsWith(SHOW_NEW_OUTAGES_PREFIX)) {
    return false;
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
    return true;
  }
  const city = cityByKey(batch.cityKey);
  if (!city || batch.rows.length === 0) {
    await answerCallbackQuery(
      env,
      callbackQuery.id,
      "اطلاعات این اعلان کامل نیست.",
      true,
    );
    return true;
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
  return true;
}

async function handleCallbackQuery(
  env: Env,
  callbackQuery: TelegramCallbackQuery,
): Promise<void> {
  const data = callbackQuery.data?.trim() ?? "";
  const message = callbackQuery.message;
  const telegramUser = callbackQuery.from;
  const chatId = message ? String(message.chat.id) : null;
  const telegramUserId = telegramUser ? String(telegramUser.id) : null;
  if (!chatId) {
    await answerCallbackQuery(env, callbackQuery.id, "این دکمه قابل استفاده نیست.", true);
    return;
  }
  if (telegramUser) {
    await upsertTelegramUser(env.DB, telegramUser, chatId);
  }
  if (await handleShowNewCallback(env, callbackQuery, chatId, data)) {
    return;
  }

  if (data === MAIN_MENU_CALLBACK) {
    if (telegramUserId) {
      await clearAdminFlow(env.DB, telegramUserId);
      await clearPersonalizationFlow(env.DB, telegramUserId);
      await clearSpecialLookupFlow(env.DB, telegramUserId);
      await clearSupportFlow(env.DB, telegramUserId);
    }
    await answerCallbackQuery(env, callbackQuery.id, "منوی اصلی");
    await sendMessage(
      env,
      chatId,
      "یک گزینه را انتخاب کنید:",
      mainMenuFor(env, telegramUserId),
    );
    return;
  }

  const adminAction =
    data === ADMIN_HOME_CALLBACK ||
    data === ADMIN_REFRESH_CALLBACK ||
    data === ADMIN_STATUS_CALLBACK ||
    data === ADMIN_CITIES_CALLBACK ||
    data === ADMIN_UPDATES_CALLBACK ||
    data === ADMIN_UPDATE_STATUS_CALLBACK ||
    data === ADMIN_FETCH_ALL_CALLBACK ||
    data === ADMIN_FETCH_CITIES_CALLBACK ||
    data === ADMIN_FETCH_SPECIAL_CALLBACK ||
    data === ADMIN_CITY_ADD_CALLBACK ||
    data === ADMIN_CITY_SAVE_CONFIRM_CALLBACK ||
    data === ADMIN_CITY_DISCOVERY_CONFIRM_CALLBACK ||
    data === ADMIN_MANUAL_FETCH_CALLBACK ||
    data === ADMIN_DISCOVER_PENDING_CALLBACK ||
    data === ADMIN_DISCOVER_ALL_CALLBACK ||
    data === ADMIN_SPECIAL_CALLBACK ||
    data.startsWith(ADMIN_OPERATION_CONFIRM_PREFIX) ||
    data.startsWith(ADMIN_BULK_ACCEPT_PREFIX) ||
    data.startsWith(ADMIN_BULK_REJECT_PREFIX) ||
    data.startsWith(ADMIN_SPECIAL_SHOW_PREFIX) ||
    data.startsWith(ADMIN_SPECIAL_APPROVE_PREFIX) ||
    data.startsWith(ADMIN_SPECIAL_REJECT_PREFIX) ||
    data.startsWith(ADMIN_SPECIAL_APPROVE_CONFIRM_PREFIX) ||
    data.startsWith(ADMIN_SPECIAL_REJECT_CONFIRM_PREFIX) ||
    data.startsWith(ADMIN_SPECIAL_REVEAL_PREFIX) ||
    data.startsWith(ADMIN_SPECIAL_REVEAL_CONFIRM_PREFIX) ||
    data.startsWith(SUPPORT_TETHER_APPROVE_PREFIX) ||
    data.startsWith(SUPPORT_TETHER_REJECT_PREFIX) ||
    data.startsWith(SUPPORT_TETHER_APPROVE_CONFIRM_PREFIX) ||
    data.startsWith(SUPPORT_TETHER_REJECT_CONFIRM_PREFIX) ||
    data.startsWith(ADMIN_REVOKE_PREFIX) ||
    data.startsWith(ADMIN_REVOKE_CONFIRM_PREFIX) ||
    data.startsWith(ADMIN_CITY_EDIT_PREFIX) ||
    data.startsWith(ADMIN_CITY_DISABLE_PREFIX) ||
    data.startsWith(ADMIN_CITY_DISABLE_CONFIRM_PREFIX) ||
    data.startsWith(ADMIN_CITY_ACCEPT_PREFIX) ||
    data.startsWith(ADMIN_CITY_REJECT_PREFIX);

  if (adminAction) {
    if (
      !telegramUser ||
      !telegramUserId ||
      !message ||
      !isAdmin(env, telegramUserId) ||
      !isPrivateConversation(message, telegramUser)
    ) {
      await answerCallbackQuery(
        env,
        callbackQuery.id,
        "این بخش فقط برای مدیر و در گفت‌وگوی خصوصی فعال است.",
        true,
      );
      return;
    }

    if (data === ADMIN_HOME_CALLBACK) {
      await answerCallbackQuery(env, callbackQuery.id, "پنل مدیریت");
      await openAdminHome(env, chatId, telegramUserId);
      return;
    }
    if (data === ADMIN_STATUS_CALLBACK) {
      await answerCallbackQuery(env, callbackQuery.id, "وضعیت به‌روز شد.");
      await openAdminSystemStatus(env, chatId, telegramUserId);
      return;
    }
    if (data === ADMIN_REFRESH_CALLBACK) {
      await answerCallbackQuery(env, callbackQuery.id, "فهرست به‌روز شد.");
      await openAdminUsers(env, chatId, telegramUserId);
      return;
    }
    if (data === ADMIN_CITIES_CALLBACK) {
      await clearAdminFlow(env.DB, telegramUserId);
      await answerCallbackQuery(env, callbackQuery.id, "فهرست شهرها");
      await openAdminCities(env, chatId, telegramUserId);
      return;
    }
    if (
      data === ADMIN_UPDATES_CALLBACK ||
      data === ADMIN_UPDATE_STATUS_CALLBACK
    ) {
      await clearAdminFlow(env.DB, telegramUserId);

      await answerCallbackQuery(
        env,
        callbackQuery.id,
        data === ADMIN_UPDATE_STATUS_CALLBACK
          ? "وضعیت عملیات‌ها بازخوانی شد."
          : "مرکز بروزرسانی",
      );

      await openAdminUpdateCenter(
        env,
        chatId,
        telegramUserId,
      );

      return;
    }
    if (data === ADMIN_SPECIAL_CALLBACK) {
      await answerCallbackQuery(env, callbackQuery.id, "درخواست‌های ویژه");
      await openAdminSpecialRequests(env, chatId, telegramUserId);
      return;
    }
    if (
      data === ADMIN_MANUAL_FETCH_CALLBACK ||
      data === ADMIN_FETCH_ALL_CALLBACK ||
      data === ADMIN_FETCH_CITIES_CALLBACK ||
      data === ADMIN_FETCH_SPECIAL_CALLBACK ||
      data === ADMIN_DISCOVER_PENDING_CALLBACK ||
      data === ADMIN_DISCOVER_ALL_CALLBACK
    ) {
      let operation: ManualOperationType;

      if (data === ADMIN_FETCH_ALL_CALLBACK) {
        operation = "fetch_all";
      } else if (
        data === ADMIN_FETCH_CITIES_CALLBACK ||
        data === ADMIN_MANUAL_FETCH_CALLBACK
      ) {
        operation = "fetch_cities";
      } else if (
        data === ADMIN_FETCH_SPECIAL_CALLBACK
      ) {
        operation = "fetch_special";
      } else if (
        data === ADMIN_DISCOVER_PENDING_CALLBACK
      ) {
        operation = "discover_pending";
      } else {
        operation = "discover_all";
      }

      await answerCallbackQuery(
        env,
        callbackQuery.id,
      );

      await showManualOperationConfirmation(
        env,
        chatId,
        operation,
      );

      return;
    }
    if (data.startsWith(ADMIN_OPERATION_CONFIRM_PREFIX)) {
      const candidate = data.slice(ADMIN_OPERATION_CONFIRM_PREFIX.length);
      if (
        ![
          "fetch",
          "fetch_all",
          "fetch_cities",
          "fetch_special",
          "discover_pending",
          "discover_all",
        ].includes(candidate)
      ) {
        await answerCallbackQuery(env, callbackQuery.id, "عملیات نامعتبر است.", true);
        return;
      }
      const operation = candidate as ManualOperationType;
      await answerCallbackQuery(env, callbackQuery.id, "در حال ارسال به GitHub Actions…");
      try {
        const result = await dispatchManualOperation(env, operation, telegramUserId);
        await sendMessage(
          env,
          chatId,
          [
            "✅ <b>عملیات در صف اجرا قرار گرفت</b>",
            `نوع: ${manualOperationLabel(operation)}`,
            `شناسه: <code>${result.operationId}</code>`,
            "",
            "اگر Runner روشن باشد، اجرا معمولاً ظرف چند ثانیه شروع می‌شود.",
            "شروع، پایان یا خطای عملیات در همین چت اعلام خواهد شد.",
          ].join("\n"),
          updateCenterKeyboard(),
        );
      } catch (error) {
        await sendMessage(
          env,
          chatId,
          `⚠️ اجرای عملیات ممکن نشد:
${escapeHtml(error instanceof Error ? error.message : "خطای نامشخص")}`,
          adminMenuKeyboard(),
        );
      }
      return;
    }
    if (data.startsWith(ADMIN_BULK_ACCEPT_PREFIX)) {
      const batchId = data.slice(ADMIN_BULK_ACCEPT_PREFIX.length);
      const batch = await getBulkDiscoveryBatch(env.DB, batchId);
      if (!batch || batch.status !== "pending") {
        await answerCallbackQuery(env, callbackQuery.id, "این پیشنهاد دیگر قابل اعمال نیست.", true);
        return;
      }
      await answerCallbackQuery(env, callbackQuery.id, "در حال اعمال موارد سالم…");
      try {
        const result = await applyBulkDiscoveryBatch(env.DB, batchId);
        await sendMessage(
          env,
          chatId,
          `✅ ${toPersianDigits(result.applied)} شهر ذخیره یا به‌روزرسانی شد. ${toPersianDigits(result.skipped)} مورد دارای خطا یا تداخل اعمال نشد.\n\nبرای دریافت خاموشی شهرهای جدید، «Fetch کامل الان» را بزنید.`,
          adminMenuKeyboard(),
        );
        await openAdminCities(env, chatId, telegramUserId);
      } catch (error) {
        await sendMessage(env, chatId, `⚠️ اعمال دسته‌ای ناموفق بود: ${escapeHtml(error instanceof Error ? error.message : "خطای نامشخص")}`);
      }
      return;
    }
    if (data.startsWith(ADMIN_BULK_REJECT_PREFIX)) {
      const batchId = data.slice(ADMIN_BULK_REJECT_PREFIX.length);
      await rejectBulkDiscoveryBatch(env.DB, batchId);
      await answerCallbackQuery(env, callbackQuery.id, "نتیجه کشف رد شد.");
      await openAdminCities(env, chatId, telegramUserId);
      return;
    }
    if (data.startsWith(ADMIN_SPECIAL_REVEAL_CONFIRM_PREFIX)) {
      const requestId = data.slice(ADMIN_SPECIAL_REVEAL_CONFIRM_PREFIX.length);
      const request = await getSpecialLookupRequest(env.DB, requestId);
      if (!request) {
        await answerCallbackQuery(env, callbackQuery.id, "درخواست پیدا نشد.", true);
        return;
      }
      await answerCallbackQuery(env, callbackQuery.id, "شناسه نمایش داده شد.");
      try {
        const billId = await revealBillId(env, request.bill_id_ciphertext);
        await sendMessage(
          env,
          chatId,
          [
            "🔐 <b>شناسه قبض کامل</b>",
            `🗺 ${escapeHtml(request.province)} / ${escapeHtml(request.county)}`,
            `🧾 <code>${escapeHtml(billId)}</code>`,
            "",
            "این پیام حاوی اطلاعات حساس است؛ آن را برای شخص دیگری ارسال نکنید.",
          ].join("\n"),
          {
            inline_keyboard: [
              [{ text: "⬅️ بازگشت به درخواست", callback_data: `${ADMIN_SPECIAL_SHOW_PREFIX}${requestId}` }],
              [{ text: "🏠 منوی اصلی", callback_data: MAIN_MENU_CALLBACK }],
            ],
          },
        );
      } catch (error) {
        await sendMessage(env, chatId, `⚠️ رمزگشایی ناموفق بود: ${escapeHtml(error instanceof Error ? error.message : "خطای نامشخص")}`);
      }
      return;
    }
    if (data.startsWith(ADMIN_SPECIAL_REVEAL_PREFIX)) {
      const requestId = data.slice(ADMIN_SPECIAL_REVEAL_PREFIX.length);
      await answerCallbackQuery(env, callbackQuery.id);
      await sendMessage(
        env,
        chatId,
        "⚠️ <b>تأیید نمایش اطلاعات حساس</b>\n\nشناسه کامل در تاریخچه همین گفت‌وگوی خصوصی نمایش داده می‌شود. ادامه می‌دهید؟",
        {
          inline_keyboard: [
            [
              { text: "✅ بله، نمایش بده", callback_data: `${ADMIN_SPECIAL_REVEAL_CONFIRM_PREFIX}${requestId}` },
              { text: "❌ انصراف", callback_data: `${ADMIN_SPECIAL_SHOW_PREFIX}${requestId}` },
            ],
            [{ text: "🏠 منوی اصلی", callback_data: MAIN_MENU_CALLBACK }],
          ],
        },
      );
      return;
    }
    if (data.startsWith(ADMIN_SPECIAL_SHOW_PREFIX)) {
      const requestId = data.slice(ADMIN_SPECIAL_SHOW_PREFIX.length);
      await answerCallbackQuery(env, callbackQuery.id, "نمایش درخواست");
      await showAdminSpecialRequest(env, chatId, requestId);
      return;
    }
    if (
      data.startsWith(ADMIN_SPECIAL_APPROVE_CONFIRM_PREFIX) ||
      data.startsWith(ADMIN_SPECIAL_REJECT_CONFIRM_PREFIX)
    ) {
      const approved = data.startsWith(ADMIN_SPECIAL_APPROVE_CONFIRM_PREFIX);
      const prefix = approved
        ? ADMIN_SPECIAL_APPROVE_CONFIRM_PREFIX
        : ADMIN_SPECIAL_REJECT_CONFIRM_PREFIX;
      const requestId = data.slice(prefix.length);
      const request = await decideSpecialLookupRequest(
        env.DB,
        requestId,
        approved ? "active" : "rejected",
      );
      await answerCallbackQuery(env, callbackQuery.id, approved ? "درخواست پذیرفته شد." : "درخواست رد شد.");
      await sendMessage(
        env,
        request.chat_id,
        approved
          ? `✅ استعلام ویژه «${escapeHtml(request.request_label)}» فعال شد. از بخش استعلام ویژه می‌توانید آخرین نتیجه را ببینید و یادآوری ۳۰ یا ۶۰ دقیقه‌ای را تنظیم کنید.`
          : `❌ در حال حاضر امکان پشتیبانی خودکار از درخواست «${escapeHtml(request.request_label)}» فراهم نشد.`,
        mainMenuFor(env, request.telegram_user_id),
      );
      await openAdminSpecialRequests(env, chatId, telegramUserId);
      return;
    }
    if (
      data.startsWith(ADMIN_SPECIAL_APPROVE_PREFIX) ||
      data.startsWith(ADMIN_SPECIAL_REJECT_PREFIX)
    ) {
      const approved = data.startsWith(ADMIN_SPECIAL_APPROVE_PREFIX);
      const prefix = approved ? ADMIN_SPECIAL_APPROVE_PREFIX : ADMIN_SPECIAL_REJECT_PREFIX;
      const requestId = data.slice(prefix.length);
      const request = await getSpecialLookupRequest(env.DB, requestId);
      if (!request || request.status !== "pending") {
        await answerCallbackQuery(env, callbackQuery.id, "این درخواست دیگر در انتظار بررسی نیست.", true);
        return;
      }
      await answerCallbackQuery(env, callbackQuery.id);
      await sendMessage(
        env,
        chatId,
        [
          "⚠️ <b>تأیید تصمیم حساس</b>",
          specialRequestSummary(request),
          "",
          approved
            ? "این شناسه قبض فعال شود؟ بعد از تأیید، Fetch دوره‌ای، استعلام دستی و یادآوری برای کاربر قابل استفاده است."
            : "درخواست رد شود و به کاربر اعلام شود که فعلاً امکان پشتیبانی خودکار وجود ندارد؟",
        ].join("\n"),
        {
          inline_keyboard: [
            [
              {
                text: approved ? "✅ بله، بپذیر" : "✅ بله، رد کن",
                callback_data: `${approved ? ADMIN_SPECIAL_APPROVE_CONFIRM_PREFIX : ADMIN_SPECIAL_REJECT_CONFIRM_PREFIX}${requestId}`,
              },
              { text: "❌ انصراف", callback_data: `${ADMIN_SPECIAL_SHOW_PREFIX}${requestId}` },
            ],
            [{ text: "🏠 منوی اصلی", callback_data: MAIN_MENU_CALLBACK }],
          ],
        },
      );
      return;
    }
    if (
      data.startsWith(SUPPORT_TETHER_APPROVE_CONFIRM_PREFIX) ||
      data.startsWith(SUPPORT_TETHER_REJECT_CONFIRM_PREFIX)
    ) {
      const approved = data.startsWith(SUPPORT_TETHER_APPROVE_CONFIRM_PREFIX);
      const prefix = approved
        ? SUPPORT_TETHER_APPROVE_CONFIRM_PREFIX
        : SUPPORT_TETHER_REJECT_CONFIRM_PREFIX;
      const submissionId = data.slice(prefix.length);
      const submission = await decideTetherSubmission(
        env.DB,
        submissionId,
        approved ? "approved" : "rejected",
      );
      await answerCallbackQuery(env, callbackQuery.id, approved ? "تراکنش تأیید شد." : "تراکنش رد شد.");
      await sendMessage(
        env,
        submission.chat_id,
        approved
          ? `💛 حمایت تتر شما با مقدار اعلامی ${escapeHtml(submission.amount_text)} تأیید شد. سپاسگزارم.`
          : "⚠️ تراکنش تتر ثبت‌شده تأیید نشد. شبکه، آدرس و TXID را بررسی کنید.",
        mainMenuFor(env, submission.telegram_user_id),
      );
      return;
    }
    if (
      data.startsWith(SUPPORT_TETHER_APPROVE_PREFIX) ||
      data.startsWith(SUPPORT_TETHER_REJECT_PREFIX)
    ) {
      const approved = data.startsWith(SUPPORT_TETHER_APPROVE_PREFIX);
      const prefix = approved ? SUPPORT_TETHER_APPROVE_PREFIX : SUPPORT_TETHER_REJECT_PREFIX;
      const submissionId = data.slice(prefix.length);
      const submission = await getTetherSubmission(env.DB, submissionId);
      if (!submission || submission.status !== "pending") {
        await answerCallbackQuery(env, callbackQuery.id, "این تراکنش دیگر در انتظار بررسی نیست.", true);
        return;
      }
      await answerCallbackQuery(env, callbackQuery.id);
      await sendMessage(
        env,
        chatId,
        [
          "⚠️ <b>تأیید نتیجه پرداخت تتر</b>",
          `🌐 <b>شبکه:</b> ${escapeHtml(submission.network)}`,
          `💵 <b>مقدار اعلامی:</b> ${escapeHtml(submission.amount_text)}`,
          `🔗 <b>TXID:</b> <code>${escapeHtml(submission.tx_hash)}</code>`,
          "",
          approved
            ? "پس از بررسی در کیف پول یا اکسپلورر، دریافت این تراکنش را تأیید می‌کنید؟"
            : "این تراکنش رد شود و به کاربر هشدار داده شود؟",
        ].join("\n"),
        {
          inline_keyboard: [
            [
              {
                text: approved ? "✅ بله، دریافت شد" : "✅ بله، رد شود",
                callback_data: `${approved ? SUPPORT_TETHER_APPROVE_CONFIRM_PREFIX : SUPPORT_TETHER_REJECT_CONFIRM_PREFIX}${submissionId}`,
              },
              { text: "❌ انصراف", callback_data: ADMIN_HOME_CALLBACK },
            ],
            [{ text: "🏠 منوی اصلی", callback_data: MAIN_MENU_CALLBACK }],
          ],
        },
      );
      return;
    }

    if (data === ADMIN_CITY_ADD_CALLBACK) {
      await answerCallbackQuery(env, callbackQuery.id, "افزودن شهر");
      await beginAdminAddCity(env, chatId, telegramUserId);
      return;
    }
    if (data.startsWith(ADMIN_REVOKE_CONFIRM_PREFIX)) {
      const targetId = data.slice(ADMIN_REVOKE_CONFIRM_PREFIX.length);
      if (!/^\d+$/.test(targetId)) {
        await answerCallbackQuery(env, callbackQuery.id, "شناسه کاربر نامعتبر است.", true);
        return;
      }
      await revokeTelegramUser(env.DB, targetId);
      await answerCallbackQuery(env, callbackQuery.id, "دسترسی کاربر لغو شد.");
      await openAdminUsers(env, chatId, telegramUserId);
      return;
    }
    if (data.startsWith(ADMIN_REVOKE_PREFIX)) {
      const targetId = data.slice(ADMIN_REVOKE_PREFIX.length);
      if (!/^\d+$/.test(targetId)) {
        await answerCallbackQuery(env, callbackQuery.id, "شناسه کاربر نامعتبر است.", true);
        return;
      }
      await answerCallbackQuery(env, callbackQuery.id);
      await sendMessage(
        env,
        chatId,
        `⚠️ <b>تأیید تغییر حساس</b>\n\nدسترسی کاربر <code>${escapeHtml(targetId)}</code> لغو شود؟ پروفایل‌های او حذف نمی‌شوند ولی تا تأیید مجدد رمز قابل استفاده نخواهند بود.`,
        {
          inline_keyboard: [
            [
              { text: "✅ بله، لغو شود", callback_data: `${ADMIN_REVOKE_CONFIRM_PREFIX}${targetId}` },
              { text: "❌ انصراف", callback_data: ADMIN_REFRESH_CALLBACK },
            ],
            [{ text: "🏠 منوی اصلی", callback_data: MAIN_MENU_CALLBACK }],
          ],
        },
      );
      return;
    }
    if (data.startsWith(ADMIN_CITY_EDIT_PREFIX)) {
      const cityKey = data.slice(ADMIN_CITY_EDIT_PREFIX.length);
      const city = await getManagedCity(env.DB, cityKey);
      if (!city) {
        await answerCallbackQuery(env, callbackQuery.id, "شهر پیدا نشد.", true);
        return;
      }
      await setAdminFlow(
        env.DB,
        telegramUserId,
        chatId,
        "awaiting_source_ids",
        city.key,
        city.label,
        city.source_city_ids,
        "manual",
      );
      await answerCallbackQuery(env, callbackQuery.id, "ویرایش شماره‌ها");
      await sendMessage(
        env,
        chatId,
        [
          `شماره‌های منبع شهر <b>${escapeHtml(city.label)}</b> را کامل ارسال کنید.`,
          `فهرست فعلی: ${city.source_city_ids.map(toPersianDigits).join("، ") || "خالی"}`,
          "",
          "بعد از ارسال، خلاصه و هشدارها نمایش داده می‌شود و برای ذخیره تأیید جداگانه می‌گیریم.",
        ].join("\n"),
        {
          keyboard: [[{ text: CANCEL_BUTTON }, { text: MAIN_MENU_BUTTON }]],
          resize_keyboard: true,
          is_persistent: true,
        },
      );
      return;
    }
    if (data.startsWith(ADMIN_CITY_DISABLE_CONFIRM_PREFIX)) {
      const cityKey = data.slice(ADMIN_CITY_DISABLE_CONFIRM_PREFIX.length);
      await deactivateManagedCity(env.DB, cityKey);
      await answerCallbackQuery(env, callbackQuery.id, "شهر غیرفعال شد.");
      await openAdminCities(env, chatId, telegramUserId);
      return;
    }
    if (data.startsWith(ADMIN_CITY_DISABLE_PREFIX)) {
      const cityKey = data.slice(ADMIN_CITY_DISABLE_PREFIX.length);
      const city = await getManagedCity(env.DB, cityKey);
      if (!city) {
        await answerCallbackQuery(env, callbackQuery.id, "شهر پیدا نشد.", true);
        return;
      }
      if (city.is_active !== 1) {
        await answerCallbackQuery(env, callbackQuery.id, "این شهر اکنون فعال نیست.", true);
        return;
      }
      await answerCallbackQuery(env, callbackQuery.id);
      await sendMessage(
        env,
        chatId,
        [
          "⚠️ <b>تأیید تغییر حساس</b>",
          `شهر <b>${escapeHtml(city.label)}</b> غیرفعال شود؟`,
          "",
          "شهر از منوی کاربران و Fetchهای بعدی حذف می‌شود؛ داده‌های قبلی و پروفایل کاربران پاک نمی‌شوند.",
        ].join("\n"),
        {
          inline_keyboard: [
            [
              { text: "✅ بله، غیرفعال شود", callback_data: `${ADMIN_CITY_DISABLE_CONFIRM_PREFIX}${city.key}` },
              { text: "❌ انصراف", callback_data: ADMIN_CITIES_CALLBACK },
            ],
            [{ text: "🏠 منوی اصلی", callback_data: MAIN_MENU_CALLBACK }],
          ],
        },
      );
      return;
    }
    if (data === ADMIN_CITY_SAVE_CONFIRM_CALLBACK) {
      const flow = await getAdminFlow(env.DB, telegramUserId);
      if (!flow?.city_key || !flow.city_label) {
        await answerCallbackQuery(env, callbackQuery.id, "اطلاعات عملیات منقضی شده است.", true);
        return;
      }
      const ids = adminFlowSourceIds(flow);
      const conflicts = await findSourceConflicts(env.DB, ids, flow.city_key);
      if (conflicts.length > 0) {
        await answerCallbackQuery(env, callbackQuery.id, "شماره تکراری با شهر دیگر وجود دارد.", true);
        await showAdminCitySaveConfirmation(env, chatId, telegramUserId);
        return;
      }
      await saveManagedCity(env.DB, flow.city_key, flow.city_label, ids);
      await clearAdminFlow(env.DB, telegramUserId);
      await answerCallbackQuery(env, callbackQuery.id, "شهر ذخیره و فعال شد.");
      await sendMessage(env, chatId, "✅ شهر با موفقیت ذخیره شد.", adminMenuKeyboard());
      await openAdminCities(env, chatId, telegramUserId);
      return;
    }
    if (data === ADMIN_CITY_DISCOVERY_CONFIRM_CALLBACK) {
      const flow = await getAdminFlow(env.DB, telegramUserId);
      if (!flow?.city_key || !flow.city_label) {
        await answerCallbackQuery(env, callbackQuery.id, "اطلاعات عملیات منقضی شده است.", true);
        return;
      }
      await requestCityDiscovery(env.DB, flow.city_key, flow.city_label);
      await clearAdminFlow(env.DB, telegramUserId);
      await answerCallbackQuery(env, callbackQuery.id, "درخواست کشف ثبت شد.");
      await sendMessage(
        env,
        chatId,
        "✅ درخواست ثبت شد. برای اجرای فوری، دکمه «کشف الان» را بزنید. نتیجه برای تأیید نهایی به همین چت ارسال می‌شود.",
        {
          inline_keyboard: [
            [{ text: "🔎 کشف الان", callback_data: ADMIN_DISCOVER_PENDING_CALLBACK }],
            [{ text: "🏙 مدیریت شهرها", callback_data: ADMIN_CITIES_CALLBACK }],
            [{ text: "🏠 منوی اصلی", callback_data: MAIN_MENU_CALLBACK }],
          ],
        },
      );
      return;
    }
    if (data.startsWith(ADMIN_CITY_ACCEPT_PREFIX)) {
      const proposalId = data.slice(ADMIN_CITY_ACCEPT_PREFIX.length);
      const proposal = await getCitySourceProposal(env.DB, proposalId);
      if (!proposal) {
        await answerCallbackQuery(env, callbackQuery.id, "پیشنهاد پیدا نشد.", true);
        return;
      }
      try {
        const city = await acceptCitySourceProposal(env.DB, proposalId);
        await answerCallbackQuery(env, callbackQuery.id, "شهر فعال شد.");
        await sendMessage(
          env,
          chatId,
          `✅ شهر <b>${escapeHtml(city.label)}</b> با ${toPersianDigits(city.source_city_ids.length)} شماره منبع فعال شد.`,
          adminMenuKeyboard(),
        );
      } catch (error) {
        const detail = error instanceof Error ? error.message : "خطای نامشخص";
        await answerCallbackQuery(env, callbackQuery.id, "فعال‌سازی انجام نشد.", true);
        await sendMessage(
          env,
          chatId,
          `⚠️ فعال‌سازی انجام نشد: ${escapeHtml(detail)}\nاحتمالاً یکی از شماره‌ها قبلاً برای شهر دیگری فعال است.`,
          adminMenuKeyboard(),
        );
      }
      return;
    }
    if (data.startsWith(ADMIN_CITY_REJECT_PREFIX)) {
      const proposalId = data.slice(ADMIN_CITY_REJECT_PREFIX.length);
      await rejectCitySourceProposal(env.DB, proposalId);
      await answerCallbackQuery(env, callbackQuery.id, "پیشنهاد رد شد.");
      await openAdminCities(env, chatId, telegramUserId);
      return;
    }
  }

  if (!telegramUser || !telegramUserId || !message) {
    await answerCallbackQuery(env, callbackQuery.id, "اطلاعات کاربر کامل نیست.", true);
    return;
  }
  if (!isPrivateConversation(message, telegramUser)) {
    await answerCallbackQuery(env, callbackQuery.id, "این بخش فقط در گفت‌وگوی خصوصی فعال است.", true);
    return;
  }
  const specialAction =
    data === SPECIAL_HOME_CALLBACK ||
    data === SPECIAL_ADD_CALLBACK ||
    data === SPECIAL_SUBMIT_CALLBACK ||
    data === SPECIAL_CANCEL_CALLBACK ||
    data.startsWith(SPECIAL_VIEW_PREFIX) ||
    data.startsWith(SPECIAL_REMINDER_PREFIX) ||
    data.startsWith(SPECIAL_REMINDER_SET_PREFIX);
  if (specialAction) {
    const authorized = await ensureAuthorizedUser(env, chatId, telegramUserId);
    if (!authorized) {
      await answerCallbackQuery(env, callbackQuery.id);
      return;
    }
    if (data.startsWith(SPECIAL_REMINDER_SET_PREFIX)) {
      const value = data.slice(SPECIAL_REMINDER_SET_PREFIX.length);
      const separator = value.lastIndexOf(":");
      const requestId = separator >= 0 ? value.slice(0, separator) : "";
      const minutes = separator >= 0 ? Number(value.slice(separator + 1)) : Number.NaN;
      const request = await setSpecialReminderMinutes(
        env.DB,
        requestId,
        telegramUserId,
        minutes,
      );
      if (!request) {
        await answerCallbackQuery(env, callbackQuery.id, "اشتراک فعال پیدا نشد.", true);
        return;
      }
      await answerCallbackQuery(
        env,
        callbackQuery.id,
        `یادآوری: ${specialReminderLabel(request.reminder_minutes)}`,
      );
      await openSpecialReminderMenu(env, chatId, telegramUserId, requestId);
      return;
    }
    if (data.startsWith(SPECIAL_VIEW_PREFIX)) {
      const requestId = data.slice(SPECIAL_VIEW_PREFIX.length);
      await answerCallbackQuery(env, callbackQuery.id, "نمایش آخرین استعلام");
      await openSpecialLookupResult(env, chatId, telegramUserId, requestId);
      return;
    }
    if (data.startsWith(SPECIAL_REMINDER_PREFIX)) {
      const requestId = data.slice(SPECIAL_REMINDER_PREFIX.length);
      await answerCallbackQuery(env, callbackQuery.id, "تنظیم یادآوری");
      await openSpecialReminderMenu(env, chatId, telegramUserId, requestId);
      return;
    }
    if (data === SPECIAL_HOME_CALLBACK) {
      await answerCallbackQuery(env, callbackQuery.id, "درخواست‌های ویژه");
      await openSpecialLookupHome(env, chatId, telegramUserId);
      return;
    }
    if (data === SPECIAL_ADD_CALLBACK) {
      await answerCallbackQuery(env, callbackQuery.id, "ثبت درخواست جدید");
      await beginSpecialLookupRequest(env, chatId, telegramUserId);
      return;
    }
    if (data === SPECIAL_CANCEL_CALLBACK) {
      await clearSpecialLookupFlow(env.DB, telegramUserId);
      await answerCallbackQuery(env, callbackQuery.id, "درخواست لغو شد.");
      await openSpecialLookupHome(env, chatId, telegramUserId);
      return;
    }
    const flow = await getSpecialLookupFlow(env.DB, telegramUserId);
    if (!flow || flow.state !== "confirm_submit") {
      await answerCallbackQuery(env, callbackQuery.id, "اطلاعات درخواست منقضی شده است.", true);
      return;
    }
    try {
      const request = await createSpecialLookupRequest(env.DB, flow);
      await clearSpecialLookupFlow(env.DB, telegramUserId);
      await answerCallbackQuery(env, callbackQuery.id, "درخواست ارسال شد.");
      await sendMessage(
        env,
        chatId,
        "✅ درخواست ویژه ثبت شد. پس از بررسی سامانه رسمی استان، نتیجه توسط مدیر اعلام می‌شود.",
        mainMenuFor(env, telegramUserId),
      );
      await notifyAdminSpecialRequest(env, request);
    } catch (error) {
      await answerCallbackQuery(env, callbackQuery.id, "ثبت درخواست ناموفق بود.", true);
      await sendMessage(env, chatId, `⚠️ ${escapeHtml(error instanceof Error ? error.message : "خطای نامشخص")}`);
    }
    return;
  }

  const supportAction =
    data === SUPPORT_HOME_CALLBACK ||
    data === SUPPORT_TETHER_CALLBACK ||
    data.startsWith(SUPPORT_STARS_PREFIX);
  if (supportAction) {
    if (data === SUPPORT_HOME_CALLBACK) {
      await answerCallbackQuery(env, callbackQuery.id, "حمایت از پروژه");
      await openSupportHome(env, chatId);
      return;
    }
    if (data === SUPPORT_TETHER_CALLBACK) {
      await answerCallbackQuery(env, callbackQuery.id, "حمایت با تتر");
      await beginTetherSupport(env, chatId, telegramUserId);
      return;
    }
    const amount = Number(data.slice(SUPPORT_STARS_PREFIX.length));
    if (![25, 50, 100, 250].includes(amount)) {
      await answerCallbackQuery(env, callbackQuery.id, "مقدار استار نامعتبر است.", true);
      return;
    }
    await answerCallbackQuery(env, callbackQuery.id, "فاکتور ارسال شد.");
    await sendStarInvoice(env, chatId, telegramUserId, amount);
    return;
  }

  const personalAction =
    data === PERSONAL_ADD_CALLBACK ||
    data === PERSONAL_DASHBOARD_CALLBACK ||
    data.startsWith(PERSONAL_SHOW_PREFIX) ||
    data.startsWith(PERSONAL_EDIT_PREFIX) ||
    data.startsWith(PERSONAL_DELETE_PREFIX) ||
    data.startsWith(PERSONAL_DELETE_CONFIRM_PREFIX);
  if (!personalAction) {
    await answerCallbackQuery(env, callbackQuery.id, "این دکمه قابل استفاده نیست.", true);
    return;
  }
  const authorized = await ensureAuthorizedUser(env, chatId, telegramUserId);
  if (!authorized) {
    await answerCallbackQuery(env, callbackQuery.id);
    return;
  }

  if (data === PERSONAL_DASHBOARD_CALLBACK) {
    await answerCallbackQuery(env, callbackQuery.id, "در حال به‌روزرسانی…");
    await showPersonalDashboard(env, chatId, telegramUserId);
    return;
  }
  if (data === PERSONAL_ADD_CALLBACK) {
    await answerCallbackQuery(env, callbackQuery.id, "افزودن تنظیم جدید");
    await beginPersonalizationSetup(env, chatId, telegramUserId);
    return;
  }

  const prefixes = [
    PERSONAL_SHOW_PREFIX,
    PERSONAL_EDIT_PREFIX,
    PERSONAL_DELETE_CONFIRM_PREFIX,
    PERSONAL_DELETE_PREFIX,
  ];
  const prefix = prefixes.find((candidate) => data.startsWith(candidate));
  const profileId = prefix ? data.slice(prefix.length) : "";
  if (!prefix || !/^[a-f0-9]{32}$/i.test(profileId)) {
    await answerCallbackQuery(env, callbackQuery.id, "شناسه تنظیم نامعتبر است.", true);
    return;
  }
  const profile = await getPersonalOutageProfile(env.DB, telegramUserId, profileId);
  if (!profile) {
    await answerCallbackQuery(env, callbackQuery.id, "این تنظیم دیگر وجود ندارد.", true);
    await showPersonalDashboard(env, chatId, telegramUserId);
    return;
  }

  if (prefix === PERSONAL_SHOW_PREFIX) {
    await answerCallbackQuery(env, callbackQuery.id, "در حال نمایش…");
    await showPersonalProfile(env, chatId, profile);
    return;
  }
  if (prefix === PERSONAL_EDIT_PREFIX) {
    await answerCallbackQuery(env, callbackQuery.id, "ویرایش تنظیم");
    await beginPersonalizationSetup(env, chatId, telegramUserId, profileId);
    return;
  }
  if (prefix === PERSONAL_DELETE_PREFIX) {
    await answerCallbackQuery(env, callbackQuery.id);
    const keyboard: InlineKeyboardMarkup = {
      inline_keyboard: [
        [
          {
            text: "بله، حذف شود",
            callback_data: `${PERSONAL_DELETE_CONFIRM_PREFIX}${profileId}`,
          },
          { text: "انصراف", callback_data: PERSONAL_DASHBOARD_CALLBACK },
        ],
        [{ text: "🏠 منوی اصلی", callback_data: MAIN_MENU_CALLBACK }],
      ],
    };
    await sendMessage(
      env,
      chatId,
      `تنظیم <b>${escapeHtml(profile.profile_label)}</b> حذف شود؟`,
      keyboard,
    );
    return;
  }

  await deletePersonalOutageProfile(env.DB, telegramUserId, profileId);
  await answerCallbackQuery(env, callbackQuery.id, "تنظیم حذف شد.");
  await showPersonalDashboard(env, chatId, telegramUserId);
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
      await clearAdminFlow(env.DB, telegramUserId);
      await clearSpecialLookupFlow(env.DB, telegramUserId);
      await clearSupportFlow(env.DB, telegramUserId);
    }
    await sendMessage(
      env,
      chatId,
      "یک گزینه را انتخاب کنید:",
      mainMenuFor(env, telegramUserId),
    );
    return;
  }

  if (text === "/id") {
    await sendMessage(
      env,
      chatId,
      telegramUserId
        ? `شناسه عددی تلگرام شما: <code>${escapeHtml(telegramUserId)}</code>`
        : "شناسه کاربر در دسترس نیست.",
      mainMenuFor(env, telegramUserId),
    );
    return;
  }

  if (text === "/support") {
    await sendMessage(
      env,
      chatId,
      env.SUPPORT_CONTACT?.trim()
        ? `راه ارتباط با پشتیبانی: ${escapeHtml(env.SUPPORT_CONTACT.trim())}`
        : "راه ارتباط پشتیبانی هنوز تنظیم نشده است.",
      mainMenuFor(env, telegramUserId),
    );
    return;
  }

  if (text === "/terms") {
    await sendMessage(
      env,
      chatId,
      [
        "📄 <b>شرایط استفاده و حمایت</b>",
        "",
        "این ربات یک ابزار اطلاع‌رسانی کمکی است و جایگزین اطلاعیه رسمی شرکت توزیع برق نیست.",
        "حمایت با Stars یا تتر کاملاً داوطلبانه است و دسترسی ویژه، اولویت بررسی یا تضمین سرویس ایجاد نمی‌کند.",
        "برای مشکل پرداخت از دستور /paysupport و برای پشتیبانی عمومی از /support استفاده کنید.",
      ].join("\n"),
      mainMenuFor(env, telegramUserId),
    );
    return;
  }

  if (text === "/paysupport") {
    await sendMessage(
      env,
      chatId,
      `برای پیگیری پرداخت، شناسه عددی خود و توضیح مشکل را برای پشتیبانی ارسال کنید.${env.SUPPORT_CONTACT?.trim() ? `\nپشتیبانی: ${escapeHtml(env.SUPPORT_CONTACT.trim())}` : ""}`,
      mainMenuFor(env, telegramUserId),
    );
    return;
  }

  if (telegramUser && telegramUserId && isAdmin(env, telegramUserId)) {
    const handled = await handleAdminTextFlow(
      env,
      chatId,
      telegramUserId,
      text,
    );
    if (handled) return;
  }

  if (telegramUser && telegramUserId) {
    const specialHandled = await handleSpecialLookupTextFlow(
      env,
      chatId,
      telegramUserId,
      text,
    );
    if (specialHandled) return;
    const supportHandled = await handleSupportTextFlow(
      env,
      chatId,
      telegramUserId,
      text,
    );
    if (supportHandled) return;
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
      if (handled) return;
    }
  }

  if (text === ADMIN_PANEL_BUTTON || text === "/admin") {
    if (!telegramUserId) return;
    await openAdminHome(env, chatId, telegramUserId);
    return;
  }

  if (text === ADMIN_STATUS_BUTTON) {
    if (!telegramUserId) return;
    await openAdminSystemStatus(env, chatId, telegramUserId);
    return;
  }

  if (text === ADMIN_USERS_BUTTON) {
    if (!telegramUserId) return;
    await openAdminUsers(env, chatId, telegramUserId);
    return;
  }

  if (text === ADMIN_CITIES_BUTTON) {
    if (!telegramUserId) return;
    await openAdminCities(env, chatId, telegramUserId);
    return;
  }
  if (text === ADMIN_UPDATES_BUTTON) {
    if (!telegramUserId) return;

    await openAdminUpdateCenter(
      env,
      chatId,
      telegramUserId,
    );

    return;
  }

  if (text === ADMIN_SPECIAL_REQUESTS_BUTTON) {
    if (!telegramUserId) return;
    await openAdminSpecialRequests(env, chatId, telegramUserId);
    return;
  }

  if (text === SUPPORT_BUTTON) {
    await openSupportHome(env, chatId);
    return;
  }

  if (text === SPECIAL_LOOKUP_BUTTON) {
    if (!telegramUser || !telegramUserId) {
      await sendMessage(env, chatId, "شناسه کاربر در دسترس نیست.");
      return;
    }
    if (!isPrivateConversation(message, telegramUser)) {
      await sendMessage(env, chatId, "استعلام ویژه فقط در گفت‌وگوی خصوصی فعال است.");
      return;
    }
    const authorized = await ensureAuthorizedUser(env, chatId, telegramUserId);
    if (!authorized) return;
    await openSpecialLookupHome(env, chatId, telegramUserId);
    return;
  }

  if (text === PERSONAL_OUTAGE_BUTTON) {
    if (!telegramUser) {
      await sendMessage(
        env,
        chatId,
        "شناسه کاربر تلگرام در این پیام در دسترس نیست.",
        mainMenuFor(env, telegramUserId),
      );
      return;
    }
    await openPersonalOutage(env, message, telegramUser);
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
      await sendMessage(env, chatId, "ابتدا یک شهر را انتخاب کنید.", cityMenuKeyboard());
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
      await sendMessage(env, chatId, "ابتدا یک شهر را انتخاب کنید.", cityMenuKeyboard());
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
    mainMenuFor(env, telegramUserId),
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
    if (update.pre_checkout_query) {
      await handlePreCheckoutQuery(env, update.pre_checkout_query);
      return;
    }
    if (update.callback_query) {
      await handleCallbackQuery(env, update.callback_query);
      return;
    }
    const message = update.message;
    if (!message) {
      return;
    }
    if (message.successful_payment) {
      if (message.from) {
        await upsertTelegramUser(env.DB, message.from, String(message.chat.id));
      }
      await handleSuccessfulSupportPayment(env, message);
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
