import type { D1Database, Env } from "./types";

export type ManualOperationType =
  | "fetch"
  | "fetch_cities"
  | "fetch_special"
  | "fetch_all"
  | "discover_pending"
  | "discover_all";

export interface ManualOperationResult {
  operationId: string;
  operationType: ManualOperationType;
  runUrl: string;
}

export interface ManualOperationRun {
  operation_id: string;
  operation_type: string;
  requested_by: string;
  status: string;
  run_url: string;
  error_text: string;
  created_at: string;
  updated_at: string;
}

const ACTIVE_OPERATION_STATUSES = [
  "dispatching",
  "queued",
  "waiting_for_runner",
  "running",
];

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
      "???? GitHub ???????? ????? ?? ?????? ????? ??? ???. " +
      "????? Secret ???? ??? ???? ???????? ????."
    );
  }
  if (status === 403 || /resource not accessible/i.test(detail)) {
    return (
      "???? ?? ???? ?????? ???? ?????. ???? Actions: Read and write ?? ????? ????."
    );
  }
  if (status === 404) {
    return (
      "???? ?? Workflow ???? ???. ??? ???? ? ???? manual-operations.yml ?? ????? ????."
    );
  }
  if (status === 422) {
    return (
      "GitHub ??????? Workflow ?? ???????. ???? main ? ????????? Workflow ?? ????? ????."
    );
  }
  return detail || `HTTP ${status}`;
}

async function saveRun(
  db: D1Database,
  operationId: string,
  operationType: string,
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
      "run_url = CASE WHEN excluded.run_url <> '' THEN excluded.run_url ELSE admin_operation_runs.run_url END, " +
      "error_text = excluded.error_text, updated_at = excluded.updated_at",
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

export async function getManualOperation(
  db: D1Database,
  operationId: string,
): Promise<ManualOperationRun | null> {
  return db.prepare(
    "SELECT operation_id, operation_type, requested_by, status, run_url, " +
      "error_text, created_at, updated_at FROM admin_operation_runs " +
      "WHERE operation_id = ?",
  ).bind(operationId).first<ManualOperationRun>();
}

export async function listManualOperationRuns(
  db: D1Database,
  limit = 8,
): Promise<ManualOperationRun[]> {
  const safeLimit = Math.max(1, Math.min(Math.trunc(limit), 20));

  const result = await db.prepare(
    "SELECT operation_id, operation_type, requested_by, status, run_url, " +
      "error_text, created_at, updated_at FROM admin_operation_runs " +
      "ORDER BY created_at DESC LIMIT ?",
  ).bind(safeLimit).all<ManualOperationRun>();

  return result.results;
}

async function getActiveManualOperation(
  db: D1Database,
): Promise<ManualOperationRun | null> {
  const placeholders = ACTIVE_OPERATION_STATUSES.map(() => "?").join(", ");

  return db.prepare(
    "SELECT operation_id, operation_type, requested_by, status, run_url, " +
      "error_text, created_at, updated_at FROM admin_operation_runs " +
      `WHERE status IN (${placeholders}) ORDER BY created_at ASC LIMIT 1`,
  ).bind(...ACTIVE_OPERATION_STATUSES).first<ManualOperationRun>();
}

export async function dispatchManualOperation(
  env: Env,
  operationType: ManualOperationType,
  requestedBy: string,
): Promise<ManualOperationResult> {
  const active = await getActiveManualOperation(env.DB);

  if (active) {
    throw new Error(
      `?????? ????? ???? ?? ????? ?${active.status}? ???. ` +
        `?????: ${active.operation_id.slice(0, 8)}. ` +
        "????? ????? ???? ?????? ?? ????? ????.",
    );
  }

  const token = env.GITHUB_ACTIONS_TOKEN?.trim();
  if (!token) {
    throw new Error("Secret GITHUB_ACTIONS_TOKEN ????? ???? ???.");
  }

  const repository = githubRepository(env);
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
    throw new Error("GITHUB_REPOSITORY ??????? ???.");
  }

  const operationId = crypto.randomUUID().replaceAll("-", "");

  await saveRun(
    env.DB,
    operationId,
    operationType,
    requestedBy,
    "dispatching",
  );

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

  await saveRun(
    env.DB,
    operationId,
    operationType,
    requestedBy,
    "queued",
    runUrl,
  );

  return { operationId, operationType, runUrl };
}

export async function markManualOperationStarted(
  db: D1Database,
  operationId: string,
  runUrl = "",
): Promise<ManualOperationRun | null> {
  await db.prepare(
    "UPDATE admin_operation_runs SET status = 'running', " +
      "run_url = CASE WHEN ? <> '' THEN ? ELSE run_url END, " +
      "error_text = '', updated_at = ? WHERE operation_id = ? " +
      "AND status IN ('dispatching', 'queued', 'waiting_for_runner', 'running')",
  ).bind(
    runUrl,
    runUrl,
    new Date().toISOString(),
    operationId,
  ).run();

  return getManualOperation(db, operationId);
}

export async function markWaitingManualOperations(
  db: D1Database,
): Promise<ManualOperationRun[]> {
  const result = await db.prepare(
    "SELECT operation_id, operation_type, requested_by, status, run_url, " +
      "error_text, created_at, updated_at FROM admin_operation_runs " +
      "WHERE status = 'queued' " +
      "AND julianday(created_at) <= julianday('now', '-5 minutes') " +
      "ORDER BY created_at ASC LIMIT 10",
  ).all<ManualOperationRun>();

  const waiting = result.results;

  if (waiting.length === 0) {
    return [];
  }

  await db.batch(
    waiting.map((run) =>
      db.prepare(
        "UPDATE admin_operation_runs SET status = 'waiting_for_runner', " +
          "updated_at = ? WHERE operation_id = ? AND status = 'queued'",
      ).bind(new Date().toISOString(), run.operation_id),
    ),
  );

  return waiting.map((run) => ({
    ...run,
    status: "waiting_for_runner",
    updated_at: new Date().toISOString(),
  }));
}

export async function completeManualOperation(
  db: D1Database,
  operationId: string,
  status: "completed" | "failed",
  errorText = "",
): Promise<ManualOperationRun | null> {
  await db.prepare(
    "UPDATE admin_operation_runs SET status = ?, error_text = ?, updated_at = ? " +
      "WHERE operation_id = ?",
  ).bind(
    status,
    errorText.slice(0, 1000),
    new Date().toISOString(),
    operationId,
  ).run();

  return getManualOperation(db, operationId);
}
