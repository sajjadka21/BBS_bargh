import {
  getOutageNumberAnalysis,
  listSyncStatuses,
  revokeTelegramUser,
  runDatabaseMaintenance,
} from "./database";
import {
  createBulkDiscoveryBatch,
  createCitySourceProposal,
  listActiveCityConfigs,
  listManagedCities,
  listPendingDiscoveryCities,
  parseBulkDiscoverySummary,
} from "./cities";
import { cityByKey, setRuntimeCities } from "./config";
import {
  getTelegramWebhookInfo,
  handleTelegramUpdate,
  notifyAdminProviderHealth,
  notifySpecialOutageChanges,
  runScheduledPersonalReminders,
  runScheduledSpecialReminders,
  setTelegramWebhook,
} from "./telegram";
import { synchronizeSnapshots } from "./sync";
import {
  completeManualOperation,
  markManualOperationStarted,
  markWaitingManualOperations,
} from "./manual-operations";
import {
  listSpecialFetchTargets,
  synchronizeSpecialOutages,
  updateProviderHealth,
} from "./special-outages";
import type {
  Env,
  ExecutionContextLike,
  ScheduledControllerLike,
  TelegramUpdate,
} from "./types";

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function unauthorized(): Response {
  return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function hasBearerSecret(request: Request, expected: string): boolean {
  return request.headers.get("authorization") === `Bearer ${expected}`;
}

async function parseJson(request: Request): Promise<unknown> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new Error("Content-Type must be application/json.");
  }
  return request.json();
}

function parseAnalysisLimit(value: string | null): number {
  if (!value) return 200;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error("limit must be a positive integer.");
  }
  return Math.min(parsed, 500);
}

function parsePositiveIds(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(Number).filter((n) => Number.isInteger(n) && n > 0))]
    .sort((a, b) => a - b);
}

async function refreshRuntimeCities(env: Env): Promise<void> {
  const cities = await listActiveCityConfigs(env.DB);
  setRuntimeCities(cities);
}

async function callTelegram(
  env: Env,
  method: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const response = await fetch(
    `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`,
    {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify(payload),
    },
  );
  if (!response.ok) {
    throw new Error(`Telegram ${method} failed with HTTP ${response.status}.`);
  }
}

async function notifyAdminDiscoveryProposal(
  env: Env,
  proposal: {
    proposal_id: string;
    city_label: string;
    source_ids_json: string;
    error_text: string;
  },
): Promise<void> {
  const adminId = env.ADMIN_TELEGRAM_USER_ID?.trim() ?? "";
  if (!adminId) return;
  const ids = parsePositiveIds(JSON.parse(proposal.source_ids_json || "[]"));
  const text = proposal.error_text
    ? [
        "⚠️ <b>کشف خودکار منابع شهر ناموفق بود</b>",
        `🏙 <b>شهر:</b> ${escapeHtml(proposal.city_label)}`,
        `📝 <b>خطا:</b> ${escapeHtml(proposal.error_text)}`,
        "",
        "می‌توانید از بخش مدیریت شهرها شماره‌ها را دستی وارد کنید.",
      ].join("\n")
    : [
        "🔎 <b>شماره‌های منبع Maztozi پیدا شد</b>",
        `🏙 <b>شهر:</b> ${escapeHtml(proposal.city_label)}`,
        `🔢 <b>شماره‌ها:</b> ${ids.join("، ") || "هیچ موردی"}`,
        "",
        "پس از تأیید، شهر فعال می‌شود و می‌توانید از پنل مدیریت «Fetch کامل الان» را اجرا کنید.",
      ].join("\n");
  const replyMarkup = proposal.error_text
    ? undefined
    : {
        inline_keyboard: [
          [
            {
              text: "✅ تأیید و فعال‌سازی",
              callback_data: `admin_city_accept:${proposal.proposal_id}`,
            },
            {
              text: "❌ رد",
              callback_data: `admin_city_reject:${proposal.proposal_id}`,
            },
          ],
          [{ text: "🏠 منوی اصلی", callback_data: "go_main" }],
        ],
      };
  await callTelegram(env, "sendMessage", {
    chat_id: adminId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  });
}


async function notifyAdminBulkDiscovery(
  env: Env,
  batch: {
    batch_id: string;
    discovered_city_count: number;
    clean_city_count: number;
    conflict_count: number;
    error_count: number;
    summary_json: string;
  },
): Promise<void> {
  const adminId = env.ADMIN_TELEGRAM_USER_ID?.trim() ?? "";
  if (!adminId) return;
  const summary = parseBulkDiscoverySummary(batch as never);
  const conflictLines = summary.conflicts.slice(0, 8).map(
    (row) => `• ${escapeHtml(row.label)}: ${escapeHtml(row.detail)}`,
  );
  const errorLines = summary.errors.slice(0, 8).map(
    (row) => `• ${escapeHtml(row.label)}: ${escapeHtml(row.detail)}`,
  );
  const text = [
    "🌐 <b>کشف همه شهرهای Maztozi پایان یافت</b>",
    "",
    `🏙 <b>شهرهای بررسی‌شده:</b> ${batch.discovered_city_count}`,
    `✅ <b>قابل اعمال:</b> ${batch.clean_city_count}`,
    `⚠️ <b>دارای تداخل:</b> ${batch.conflict_count}`,
    `❌ <b>ناموفق:</b> ${batch.error_count}`,
    ...(conflictLines.length ? ["", "<b>تداخل‌ها:</b>", ...conflictLines] : []),
    ...(errorLines.length ? ["", "<b>خطاها:</b>", ...errorLines] : []),
    "",
    "با تأیید، فقط موارد بدون تداخل ذخیره و فعال می‌شوند. هیچ شهر فعلی خودکار حذف نمی‌شود.",
  ].join("\n");
  await callTelegram(env, "sendMessage", {
    chat_id: adminId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: "✅ اعمال موارد سالم",
            callback_data: `admin_bulk_accept:${batch.batch_id}`,
          },
          {
            text: "❌ رد همه",
            callback_data: `admin_bulk_reject:${batch.batch_id}`,
          },
        ],
        [{ text: "🏠 منوی اصلی", callback_data: "go_main" }],
      ],
    },
  });
}

function manualOperationLabel(
  operationType: string,
): string {
  if (operationType === "fetch_all") {
    return "????????? ???";
  }

  if (
    operationType === "fetch_cities" ||
    operationType === "fetch"
  ) {
    return "????????? ?????? Maztozi";
  }

  if (operationType === "fetch_special") {
    return "????????? ??????????? ????";
  }

  if (operationType === "discover_pending") {
    return "??? ?????? ?? ??????";
  }

  if (operationType === "discover_all") {
    return "??? ??? ??????????? Maztozi";
  }

  return operationType;
}

async function notifyAdminManualOperationStarted(
  env: Env,
  operation: {
    operation_id: string;
    operation_type: string;
    run_url: string;
  },
): Promise<void> {
  const adminId = env.ADMIN_TELEGRAM_USER_ID?.trim() ?? "";

  if (!adminId) {
    return;
  }

  await callTelegram(env, "sendMessage", {
    chat_id: adminId,
    text: [
      "?? <b>?????? ??? Runner ???? ??</b>",
      `???: ${escapeHtml(
        manualOperationLabel(operation.operation_type),
      )}`,
      `?????: <code>${escapeHtml(operation.operation_id)}</code>`,
      operation.run_url
        ? `?? ${escapeHtml(operation.run_url)}`
        : "",
    ].filter(Boolean).join("\n"),
    parse_mode: "HTML",
    disable_web_page_preview: true,
  });
}

async function notifyAdminWaitingManualOperations(
  env: Env,
): Promise<number> {
  const waiting = await markWaitingManualOperations(env.DB);
  const adminId = env.ADMIN_TELEGRAM_USER_ID?.trim() ?? "";

  if (!adminId || waiting.length === 0) {
    return waiting.length;
  }

  await callTelegram(env, "sendMessage", {
    chat_id: adminId,
    text: [
      "?? <b>Runner ???? ?? ????? ????</b>",
      "",
      ...waiting.map(
        (operation) =>
          `? ${escapeHtml(
            manualOperationLabel(operation.operation_type),
          )} ? <code>${escapeHtml(
            operation.operation_id.slice(0, 8),
          )}</code>`,
      ),
      "",
      "?????? ?? ?? GitHub ???? ???????.",
      "?????? ???? ????? ?????? ? Runner ?????? ?? ??? ???? ????.",
    ].join("\n"),
    parse_mode: "HTML",
  });

  return waiting.length;
}

async function notifyAdminManualOperationResult(
  env: Env,
  operation: {
    operation_id: string;
    operation_type: string;
    run_url: string;
  } | null,
  ok: boolean,
  errorText: string,
): Promise<void> {
  const adminId = env.ADMIN_TELEGRAM_USER_ID?.trim() ?? "";

  if (!adminId) {
    return;
  }

  const operationId = operation?.operation_id ?? "??????";
  const operationType = operation?.operation_type ?? "??????";
  const runUrl = operation?.run_url ?? "";

  await callTelegram(env, "sendMessage", {
    chat_id: adminId,
    text: [
      ok
        ? "? <b>?????? ?? ?????? ????? ????</b>"
        : "?? <b>?????? ?????? ???</b>",
      `???: ${escapeHtml(
        manualOperationLabel(operationType),
      )}`,
      `?????: <code>${escapeHtml(operationId)}</code>`,
      !ok
        ? `???: ${escapeHtml(errorText || "???? ??????")}`
        : "",
      runUrl
        ? `?? ${escapeHtml(runUrl)}`
        : "",
    ].filter(Boolean).join("\n"),
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: "?? ???? ????",
            callback_data: "go_main",
          },
        ],
      ],
    },
  });
}

async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);

  if (request.method === "GET" && url.pathname === "/health") {
    await refreshRuntimeCities(env);
    const [statuses, managed] = await Promise.all([
      listSyncStatuses(env.DB),
      listManagedCities(env.DB),
    ]);
    return jsonResponse({
      ok: true,
      service: "bbs-bargh-bot",
      now: new Date().toISOString(),
      cities: statuses,
      managed_cities: managed,
    });
  }

  if (
    request.method === "GET" &&
    (url.pathname === "/fetch-config" || url.pathname === "/admin/fetch-config")
  ) {
    if (!hasBearerSecret(request, env.SYNC_SECRET)) return unauthorized();
    const [managed, pendingDiscovery] = await Promise.all([
      listManagedCities(env.DB),
      listPendingDiscoveryCities(env.DB),
    ]);
    return jsonResponse({
      ok: true,
      cities: managed
        .filter((city) => city.is_active === 1 && city.source_city_ids.length > 0)
        .map((city) => ({
          key: city.key,
          label: city.label,
          source_city_ids: city.source_city_ids,
          pgds: "",
        })),
      pending_discovery: pendingDiscovery,
    });
  }

  if (
    request.method === "POST" &&
    url.pathname === "/admin/city-discovery-result"
  ) {
    if (!hasBearerSecret(request, env.SYNC_SECRET)) return unauthorized();
    const raw = await parseJson(request);
    if (!raw || typeof raw !== "object") {
      return jsonResponse({ ok: false, error: "JSON object required." }, 400);
    }
    const body = raw as Record<string, unknown>;
    const cityKey = String(body.city_key ?? "").trim();
    const cityLabel = String(body.city_label ?? "").trim();
    const errorText = String(body.error ?? "").trim().slice(0, 1000);
    const ids = parsePositiveIds(body.source_city_ids);
    if (!cityKey || !cityLabel || (!errorText && ids.length === 0)) {
      return jsonResponse({ ok: false, error: "Invalid discovery result." }, 400);
    }
    const proposal = await createCitySourceProposal(
      env.DB,
      cityKey,
      cityLabel,
      ids,
      errorText,
    );
    await notifyAdminDiscoveryProposal(env, proposal);
    return jsonResponse({ ok: true, proposal_id: proposal.proposal_id });
  }

  if (
    request.method === "POST" &&
    url.pathname === "/admin/city-discovery-bulk-result"
  ) {
    if (!hasBearerSecret(request, env.SYNC_SECRET)) return unauthorized();
    const raw = await parseJson(request);
    if (!raw || typeof raw !== "object") {
      return jsonResponse({ ok: false, error: "JSON object required." }, 400);
    }
    const cities = (raw as { cities?: unknown }).cities;
    if (!Array.isArray(cities) || cities.length === 0 || cities.length > 200) {
      return jsonResponse({ ok: false, error: "cities must be a non-empty array." }, 400);
    }
    const normalized = cities.map((item) => {
      const row = item && typeof item === "object" ? item as Record<string, unknown> : {};
      return {
        label: String(row.label ?? "").trim(),
        source_city_ids: parsePositiveIds(row.source_city_ids),
        error: String(row.error ?? "").trim().slice(0, 900),
      };
    });
    const batch = await createBulkDiscoveryBatch(env.DB, normalized);
    await notifyAdminBulkDiscovery(env, batch);
    return jsonResponse({ ok: true, batch_id: batch.batch_id });
  }

  if (
    request.method === "POST" &&
    url.pathname === "/admin/manual-operation-started"
  ) {
    if (!hasBearerSecret(request, env.SYNC_SECRET)) {
      return unauthorized();
    }

    const raw = await parseJson(request);

    if (!raw || typeof raw !== "object") {
      return jsonResponse(
        { ok: false, error: "JSON object required." },
        400,
      );
    }

    const body = raw as Record<string, unknown>;
    const operationId = String(
      body.operation_id ?? "",
    ).trim();
    const runUrl = String(
      body.run_url ?? "",
    ).trim().slice(0, 1000);

    if (!/^[a-f0-9]{32}$/i.test(operationId)) {
      return jsonResponse(
        {
          ok: false,
          error: "operation_id is invalid.",
        },
        400,
      );
    }

    const operation = await markManualOperationStarted(
      env.DB,
      operationId,
      runUrl,
    );

    if (!operation) {
      return jsonResponse(
        {
          ok: false,
          error: "Operation was not found.",
        },
        404,
      );
    }

    await notifyAdminManualOperationStarted(
      env,
      operation,
    );

    return jsonResponse({
      ok: true,
      operation,
    });
  }

  if (
    request.method === "POST" &&
    url.pathname === "/admin/manual-operation-result"
  ) {
    if (!hasBearerSecret(request, env.SYNC_SECRET)) return unauthorized();
    const raw = await parseJson(request);
    if (!raw || typeof raw !== "object") {
      return jsonResponse({ ok: false, error: "JSON object required." }, 400);
    }
    const body = raw as Record<string, unknown>;
    const operationId = String(body.operation_id ?? "").trim();
    const ok = body.ok === true;
    const errorText = String(body.error ?? "").trim().slice(0, 1000);
    if (!/^[a-f0-9]{32}$/i.test(operationId)) {
      return jsonResponse({ ok: false, error: "operation_id is invalid." }, 400);
    }
    const operation = await completeManualOperation(
      env.DB,
      operationId,
      ok ? "completed" : "failed",
      errorText,
    );

    await notifyAdminManualOperationResult(
      env,
      operation,
      ok,
      errorText,
    );

    return jsonResponse({
      ok: true,
      operation,
    });
  }

  if (request.method === "GET" && url.pathname === "/special/fetch-config") {
    if (!hasBearerSecret(request, env.SYNC_SECRET)) return unauthorized();
    return jsonResponse({
      ok: true,
      provider: "bargheman",
      targets: await listSpecialFetchTargets(env),
    });
  }

  if (request.method === "POST" && url.pathname === "/special/sync") {
    if (!hasBearerSecret(request, env.SYNC_SECRET)) return unauthorized();
    const payload = await parseJson(request);
    const result = await synchronizeSpecialOutages(env, payload);
    const notifications = await notifySpecialOutageChanges(env, result.changed);
    return jsonResponse({
      ok: true,
      processed: result.processed,
      errors: result.errors,
      notifications,
    });
  }

  if (request.method === "POST" && url.pathname === "/special/provider-health") {
    if (!hasBearerSecret(request, env.SYNC_SECRET)) return unauthorized();
    const payload = await parseJson(request);
    const health = await updateProviderHealth(env.DB, payload);
    await notifyAdminProviderHealth(env, health);
    return jsonResponse({ ok: true, health });
  }

  if (request.method === "POST" && url.pathname === "/sync") {
    if (!hasBearerSecret(request, env.SYNC_SECRET)) return unauthorized();
    await refreshRuntimeCities(env);
    const payload = await parseJson(request);
    return jsonResponse(await synchronizeSnapshots(env, payload));
  }

  if (request.method === "POST" && url.pathname === "/telegram") {
    const suppliedSecret = request.headers.get(
      "x-telegram-bot-api-secret-token",
    );
    if (suppliedSecret !== env.TELEGRAM_WEBHOOK_SECRET) return unauthorized();
    await refreshRuntimeCities(env);
    const update = (await parseJson(request)) as TelegramUpdate;
    await handleTelegramUpdate(env, update);
    return jsonResponse({ ok: true });
  }

  if (request.method === "POST" && url.pathname === "/admin/set-webhook") {
    if (!hasBearerSecret(request, env.SYNC_SECRET)) return unauthorized();
    const webhookUrl = `${url.origin}/telegram`;
    const result = await setTelegramWebhook(env, webhookUrl);
    return jsonResponse({ ok: true, webhook_url: webhookUrl, result });
  }

  if (request.method === "GET" && url.pathname === "/admin/webhook-info") {
    if (!hasBearerSecret(request, env.SYNC_SECRET)) return unauthorized();
    return jsonResponse({ ok: true, result: await getTelegramWebhookInfo(env) });
  }

  if (request.method === "POST" && url.pathname === "/admin/revoke-user") {
    if (!hasBearerSecret(request, env.SYNC_SECRET)) return unauthorized();
    const rawBody = await parseJson(request);
    if (!rawBody || typeof rawBody !== "object") {
      return jsonResponse({ ok: false, error: "JSON object required." }, 400);
    }
    const candidate = (rawBody as { telegram_user_id?: unknown }).telegram_user_id;
    if (typeof candidate !== "string" && typeof candidate !== "number") {
      return jsonResponse({ ok: false, error: "telegram_user_id is required." }, 400);
    }
    const telegramUserId = String(candidate).trim();
    if (!/^\d+$/.test(telegramUserId)) {
      return jsonResponse({ ok: false, error: "telegram_user_id must contain digits only." }, 400);
    }
    const revoked = await revokeTelegramUser(env.DB, telegramUserId);
    return jsonResponse({ ok: true, telegram_user_id: telegramUserId, revoked });
  }

  if (
    request.method === "GET" &&
    url.pathname === "/admin/outage-number-analysis"
  ) {
    if (!hasBearerSecret(request, env.SYNC_SECRET)) return unauthorized();
    await refreshRuntimeCities(env);
    const cityKey = (url.searchParams.get("city") ?? "").trim();
    if (cityKey && !cityByKey(cityKey)) {
      return jsonResponse({ ok: false, error: `Unsupported city: ${cityKey}` }, 400);
    }
    const limit = parseAnalysisLimit(url.searchParams.get("limit"));
    const analysis = await getOutageNumberAnalysis(env.DB, cityKey, limit);
    return jsonResponse({ ok: true, ...analysis });
  }

  return jsonResponse({ ok: false, error: "Not found" }, 404);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await route(request, env);
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : "Unknown error";
      return jsonResponse({ ok: false, error: message }, 500);
    }
  },

  async scheduled(
    controller: ScheduledControllerLike,
    env: Env,
    ctx: ExecutionContextLike,
  ): Promise<void> {
    await refreshRuntimeCities(env);
    if (controller.cron === "20 0 1 * *") {
      ctx.waitUntil(
        runDatabaseMaintenance(env.DB).then((result) => {
          console.log("Monthly database maintenance completed", result);
        }),
      );
      return;
    }
    ctx.waitUntil(
      Promise.all([
        runScheduledPersonalReminders(env),
        runScheduledSpecialReminders(env),
        notifyAdminWaitingManualOperations(env),
      ]).then(
        ([
          personal,
          special,
          waitingOperations,
        ]) => {
          console.log(
            "Scheduled checks completed",
            {
              personal,
              special,
              waitingOperations,
            },
          );
        },
      ),
    );
  },
};
