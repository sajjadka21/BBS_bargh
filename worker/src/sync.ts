import { cityByKey } from "./config";
import {
  getCitySyncStatus,
  getExistingOutageKeys,
  replaceCitySnapshot,
} from "./database";
import { notifyNewOutages } from "./telegram";
import type {
  Env,
  NormalizedOutage,
  OutageInput,
  OutageRow,
} from "./types";

interface CitySnapshotInput {
  city_key?: unknown;
  rows?: unknown;
}

interface SyncPayload {
  fetched_at?: unknown;
  cities?: unknown;
}

function requireText(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== "string") {
    throw new Error(`${field} must be a string.`);
  }
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`${field} cannot be empty.`);
  }
  if (normalized.length > maxLength) {
    throw new Error(`${field} is too long.`);
  }
  return normalized;
}

function optionalText(value: unknown, maxLength: number): string {
  if (value === undefined || value === null) {
    return "";
  }
  if (typeof value !== "string") {
    throw new Error("Outage fields must be strings.");
  }
  return value.trim().slice(0, maxLength);
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function normalizeRows(
  cityKey: string,
  rawRows: unknown,
  fetchedAt: string,
): Promise<NormalizedOutage[]> {
  if (!Array.isArray(rawRows)) {
    throw new Error(`rows for ${cityKey} must be an array.`);
  }
  if (rawRows.length > 500) {
    throw new Error(`rows for ${cityKey} exceeds the 500-row safety limit.`);
  }

  const normalized = await Promise.all(
    rawRows.map(async (rawRow, index): Promise<NormalizedOutage> => {
      if (!rawRow || typeof rawRow !== "object") {
        throw new Error(`rows[${index}] for ${cityKey} must be an object.`);
      }
      const row = rawRow as OutageInput;
      const address = requireText(row.address, `rows[${index}].address`, 1000);
      const outageType = optionalText(row.type, 200);
      const fromTime = optionalText(row.from, 100);
      const toTime = optionalText(row.to, 100);
      const outageDate = optionalText(row.date, 100);
      // End time is derived from the site's two-hour display rule. Keep it
      // out of the identity key so enriching existing rows does not create a
      // false "new outage" notification for every stored outage.
      const sourceKey = [
        cityKey,
        address,
        outageType,
        fromTime,
        "",
        outageDate,
      ].join("\u001f");

      return {
        cityKey,
        outageKey: await sha256(sourceKey),
        address,
        outageType,
        fromTime,
        toTime,
        outageDate,
        fetchedAt,
      };
    }),
  );

  // Prevent duplicate source rows from violating the composite primary key.
  return [...new Map(normalized.map((row) => [row.outageKey, row])).values()];
}

function toDatabaseRow(row: NormalizedOutage): OutageRow {
  return {
    city_key: row.cityKey,
    outage_key: row.outageKey,
    address: row.address,
    outage_type: row.outageType,
    from_time: row.fromTime,
    to_time: row.toTime,
    outage_date: row.outageDate,
    fetched_at: row.fetchedAt,
  };
}

export async function synchronizeSnapshots(
  env: Env,
  rawPayload: unknown,
): Promise<Record<string, unknown>> {
  if (!rawPayload || typeof rawPayload !== "object") {
    throw new Error("Request body must be a JSON object.");
  }

  const payload = rawPayload as SyncPayload;
  const fetchedAt = requireText(payload.fetched_at, "fetched_at", 100);
  if (Number.isNaN(Date.parse(fetchedAt))) {
    throw new Error("fetched_at must be a valid ISO date-time.");
  }
  if (!Array.isArray(payload.cities) || payload.cities.length === 0) {
    throw new Error("cities must be a non-empty array.");
  }

  const results: Array<Record<string, unknown>> = [];

  for (const rawCity of payload.cities) {
    if (!rawCity || typeof rawCity !== "object") {
      throw new Error("Each cities entry must be an object.");
    }

    const cityInput = rawCity as CitySnapshotInput;
    const cityKey = requireText(cityInput.city_key, "city_key", 50);
    const city = cityByKey(cityKey);
    if (!city) {
      throw new Error(`Unsupported city_key: ${cityKey}`);
    }

    const rows = await normalizeRows(cityKey, cityInput.rows, fetchedAt);
    const previousStatus = await getCitySyncStatus(env.DB, cityKey);
    const existingKeys = await getExistingOutageKeys(env.DB, cityKey);
    const newRows = rows.filter((row) => !existingKeys.has(row.outageKey));

    await replaceCitySnapshot(env.DB, cityKey, rows, fetchedAt);

    let notificationError: string | null = null;
    if (previousStatus && newRows.length > 0) {
      try {
        await notifyNewOutages(
          env,
          city.label,
          newRows.map(toDatabaseRow),
        );
      } catch (error) {
        notificationError =
          error instanceof Error ? error.message : "Unknown notification error";
        console.error("New-outage notification failed:", error);
      }
    }

    results.push({
      city_key: cityKey,
      stored_count: rows.length,
      new_count: previousStatus ? newRows.length : 0,
      initial_sync: previousStatus === null,
      notification_error: notificationError,
    });
  }

  return {
    ok: true,
    fetched_at: fetchedAt,
    cities: results,
  };
}
