import {
  getOutageNumberAnalysis,
  listSyncStatuses,
  revokeTelegramUser,
} from "./database";
import { cityByKey } from "./config";
import {
  getTelegramWebhookInfo,
  handleTelegramUpdate,
  setTelegramWebhook,
} from "./telegram";
import { synchronizeSnapshots } from "./sync";
import type { Env, TelegramUpdate } from "./types";

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
  if (!value) {
    return 200;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error("limit must be a positive integer.");
  }
  return Math.min(parsed, 500);
}

async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);

  if (request.method === "GET" && url.pathname === "/health") {
    const statuses = await listSyncStatuses(env.DB);
    return jsonResponse({
      ok: true,
      service: "bbs-bargh-bot",
      now: new Date().toISOString(),
      cities: statuses,
    });
  }

  if (request.method === "POST" && url.pathname === "/sync") {
    if (!hasBearerSecret(request, env.SYNC_SECRET)) {
      return unauthorized();
    }
    const payload = await parseJson(request);
    return jsonResponse(await synchronizeSnapshots(env, payload));
  }

  if (request.method === "POST" && url.pathname === "/telegram") {
    const suppliedSecret = request.headers.get(
      "x-telegram-bot-api-secret-token",
    );
    if (suppliedSecret !== env.TELEGRAM_WEBHOOK_SECRET) {
      return unauthorized();
    }

    const update = (await parseJson(request)) as TelegramUpdate;
    await handleTelegramUpdate(env, update);
    return jsonResponse({ ok: true });
  }

  if (request.method === "POST" && url.pathname === "/admin/set-webhook") {
    if (!hasBearerSecret(request, env.SYNC_SECRET)) {
      return unauthorized();
    }
    const webhookUrl = `${url.origin}/telegram`;
    const result = await setTelegramWebhook(env, webhookUrl);
    return jsonResponse({ ok: true, webhook_url: webhookUrl, result });
  }

  if (request.method === "GET" && url.pathname === "/admin/webhook-info") {
    if (!hasBearerSecret(request, env.SYNC_SECRET)) {
      return unauthorized();
    }
    return jsonResponse({ ok: true, result: await getTelegramWebhookInfo(env) });
  }

  if (request.method === "POST" && url.pathname === "/admin/revoke-user") {
    if (!hasBearerSecret(request, env.SYNC_SECRET)) {
      return unauthorized();
    }
    const rawBody = await parseJson(request);
    if (!rawBody || typeof rawBody !== "object") {
      return jsonResponse({ ok: false, error: "JSON object required." }, 400);
    }
    const candidate = (rawBody as { telegram_user_id?: unknown }).telegram_user_id;
    if (typeof candidate !== "string" && typeof candidate !== "number") {
      return jsonResponse(
        { ok: false, error: "telegram_user_id is required." },
        400,
      );
    }
    const telegramUserId = String(candidate).trim();
    if (!/^\d+$/.test(telegramUserId)) {
      return jsonResponse(
        { ok: false, error: "telegram_user_id must contain digits only." },
        400,
      );
    }
    const revoked = await revokeTelegramUser(env.DB, telegramUserId);
    return jsonResponse({ ok: true, telegram_user_id: telegramUserId, revoked });
  }

  if (
    request.method === "GET" &&
    url.pathname === "/admin/outage-number-analysis"
  ) {
    if (!hasBearerSecret(request, env.SYNC_SECRET)) {
      return unauthorized();
    }
    const cityKey = (url.searchParams.get("city") ?? "").trim();
    if (cityKey && !cityByKey(cityKey)) {
      return jsonResponse(
        { ok: false, error: `Unsupported city: ${cityKey}` },
        400,
      );
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
};
