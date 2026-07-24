import type { D1Database, Env } from "./types";

export type ManualOperationType = "fetch" | "discover_pending" | "discover_all";

export interface ManualOperationResult {
  operationId: string;
  operationType: ManualOperationType;
  runUrl: string;
}

function githubRepository(env: Env): string {
  return env.GITHUB_REPOSITORY?.trim() || "sajjadka21/BBS_bargh";
}

function githubWorkflow(env: Env): string {
  return env.GITHUB_WORKFLOW_FILE?.trim() || "manual-operations.yml";
}

function githubRef(env: Env): string {
  return env.GITHUB_REF?.trim() || "main";
}

function githubDispatchError(status: number, detail: string): string {
  if (status === 401 || /bad credentials/i.test(detail)) {
    return (
      "توکن GitHub نامعتبر، منقضی یا اشتباه ذخیره شده است. " +
      "مقدار Secret باید خود توکن تولیدشده (مثل github_pat_...) باشد، نه نام توکن. " +
      "اسکریپت configure_github_actions_token.ps1 را اجرا کنید."
    );
  }
  if (status === 403 || /resource not accessible/i.test(detail)) {
    return (
      "توکن به مخزن دسترسی کافی ندارد. در Fine-grained token، مخزن " +
      "sajjadka21/BBS_bargh و مجوز Actions: Read and write را انتخاب کنید."
    );
  }
  if (status === 404) {
    return (
      "مخزن یا فایل Workflow برای این توکن پیدا نشد. دسترسی Repository، " +
      "نام مخزن و وجود .github/workflows/manual-operations.yml را بررسی کنید."
    );
  }
  if (status === 422) {
    return (
      "GitHub درخواست Workflow را نپذیرفت. شاخه main، ورودی‌های workflow_dispatch " +
      "و فعال‌بودن فایل manual-operations.yml را بررسی کنید."
    );
  }
  return detail || `HTTP ${status}`;
}

async function saveRun(
  db: D1Database,
  operationId: string,
  operationType: ManualOperationType,
  requestedBy: string,
  status: string,
  runUrl = "",
  errorText = "",
): Promise<void> {
  const now = new Date().toISOString();
  await db.prepare(
    "INSERT INTO admin_operation_runs " +
      "(operation_id, operation_type, requested_by, status, run_url, error_text, created_at, updated_at) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?, ?) " +
      "ON CONFLICT(operation_id) DO UPDATE SET status = excluded.status, " +
      "run_url = excluded.run_url, error_text = excluded.error_text, updated_at = excluded.updated_at",
  ).bind(
    operationId,
    operationType,
    requestedBy,
    status,
    runUrl,
    errorText,
    now,
    now,
  ).run();
}

export async function dispatchManualOperation(
  env: Env,
  operationType: ManualOperationType,
  requestedBy: string,
): Promise<ManualOperationResult> {
  const token = env.GITHUB_ACTIONS_TOKEN?.trim();
  if (!token) {
    throw new Error("Secret GITHUB_ACTIONS_TOKEN تنظیم نشده است.");
  }
  const repository = githubRepository(env);
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
    throw new Error("GITHUB_REPOSITORY نامعتبر است.");
  }
  const operationId = crypto.randomUUID().replaceAll("-", "");
  await saveRun(env.DB, operationId, operationType, requestedBy, "dispatching");

  const response = await fetch(
    `https://api.github.com/repos/${repository}/actions/workflows/${encodeURIComponent(githubWorkflow(env))}/dispatches`,
    {
      method: "POST",
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${token}`,
        "content-type": "application/json; charset=utf-8",
        "user-agent": "bbs-bargh-worker",
        "x-github-api-version": "2022-11-28",
      },
      body: JSON.stringify({
        ref: githubRef(env),
        inputs: {
          operation: operationType,
          operation_id: operationId,
        },
      }),
    },
  );

  let body: Record<string, unknown> = {};
  const raw = await response.text();
  if (raw) {
    try {
      body = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      body = {};
    }
  }
  if (!response.ok) {
    const rawDetail = String(
      body.message ?? raw ?? `HTTP ${response.status}`,
    ).slice(0, 800);
    const detail = githubDispatchError(response.status, rawDetail);
    await saveRun(
      env.DB,
      operationId,
      operationType,
      requestedBy,
      "failed",
      "",
      `${detail} [GitHub: ${rawDetail}]`,
    );
    throw new Error(`GitHub Actions: ${detail}`);
  }

  const runUrl = String(body.html_url ?? "");
  await saveRun(env.DB, operationId, operationType, requestedBy, "queued", runUrl);
  return { operationId, operationType, runUrl };
}

export async function completeManualOperation(
  db: D1Database,
  operationId: string,
  status: "completed" | "failed",
  errorText = "",
): Promise<void> {
  await db.prepare(
    "UPDATE admin_operation_runs SET status = ?, error_text = ?, updated_at = ? WHERE operation_id = ?",
  ).bind(status, errorText.slice(0, 1000), new Date().toISOString(), operationId).run();
}
