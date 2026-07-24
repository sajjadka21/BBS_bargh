import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(
  fileURLToPath(import.meta.url),
);
const workerRoot = path.resolve(
  scriptDirectory,
  "..",
);
const repositoryRoot = path.resolve(
  workerRoot,
  "..",
);

const telegram = fs.readFileSync(
  path.join(workerRoot, "src", "telegram.ts"),
  "utf8",
);
const config = fs.readFileSync(
  path.join(workerRoot, "src", "config.ts"),
  "utf8",
);
const workflow = fs.readFileSync(
  path.join(
    repositoryRoot,
    ".github",
    "workflows",
    "manual-operations.yml",
  ),
  "utf8",
);

const errors = [];

function requireText(source, value, label) {
  if (!source.includes(value)) {
    errors.push(`${label}: missing ${value}`);
  }
}

function requireOccurrences(source, value, minimum, label) {
  const count = source.split(value).length - 1;

  if (count < minimum) {
    errors.push(
      `${label}: ${value} occurs ${count} time(s), expected at least ${minimum}`,
    );
  }
}

requireText(
  config,
  'ADMIN_UPDATES_BUTTON = "🔄 مرکز بروزرسانی"',
  "admin menu button",
);
requireOccurrences(
  config,
  "ADMIN_UPDATES_BUTTON",
  2,
  "admin menu button wiring",
);

const adminCallbacks = [
  "ADMIN_UPDATES_CALLBACK",
  "ADMIN_UPDATE_STATUS_CALLBACK",
  "ADMIN_FETCH_ALL_CALLBACK",
  "ADMIN_FETCH_CITIES_CALLBACK",
  "ADMIN_FETCH_SPECIAL_CALLBACK",
];

for (const callback of adminCallbacks) {
  requireOccurrences(
    telegram,
    callback,
    3,
    "admin callback wiring",
  );
}

const confirmationPrefixes = [
  "SUPPORT_TETHER_APPROVE_CONFIRM_PREFIX",
  "SUPPORT_TETHER_REJECT_CONFIRM_PREFIX",
];

for (const callback of confirmationPrefixes) {
  requireOccurrences(
    telegram,
    callback,
    3,
    "support confirmation callback wiring",
  );
}

for (const operation of [
  "fetch_all",
  "fetch_cities",
  "fetch_special",
  "discover_pending",
  "discover_all",
]) {
  requireText(
    telegram,
    `"${operation}"`,
    "Telegram operation",
  );
  requireText(
    workflow,
    `- ${operation}`,
    "Workflow operation",
  );
}

if (telegram.includes("با سیاست Snapshot همگام")) {
  errors.push(
    "legacy Snapshot wording still exists in Telegram messages",
  );
}

if (errors.length > 0) {
  console.error("Telegram callback audit failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(
  "Telegram callback and update-center audit passed.",
);
