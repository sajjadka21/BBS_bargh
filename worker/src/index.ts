import { listSyncStatuses } from "./database";
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
