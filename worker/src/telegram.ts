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

function formatOutage(cityLabel: string, row: OutageRow): string {
  return [
    `🏙 <b>${escapeHtml(cityLabel)}</b>`,
    `📍 ${escapeHtml(row.address)}`,
    `🕒 ${escapeHtml(row.from_time)} تا ${escapeHtml(row.to_time)}`,
    `📅 ${escapeHtml(row.outage_date)} (${escapeHtml(row.outage_type)})`,
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

  const blocks = [
    `⚡️ <b>${rows.length} خاموشی جدید در ${escapeHtml(cityLabel)}</b>`,
    ...rows.map((row) => formatOutage(cityLabel, row)),
  ];
  await sendBlocks(env, chatId, blocks);
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

    await sendBlocks(
      env,
      chatId,
      rows.map((row) => formatOutage(selectedCity.label, row)),
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

    await sendBlocks(
      env,
      chatId,
      matches.map((row) => formatOutage(selectedCity.label, row)),
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
