import { cityByKey } from "./config";
import {
  activateCitySnapshot,
  clearPendingCitySnapshot,
  getCitySyncStatus,
  getPendingCitySnapshot,
  listCityOutagesForIdentity,
  mergeCitySnapshot,
  recordOutageNumberObservations,
  savePendingCitySnapshot,
  updateCitySyncMetadata,
} from "./database";
import { normalizePersianText } from "./persian";
import {
  compareJalaliDateText,
  isSnapshotTimeEligible,
  requiredConsecutiveFetches,
} from "./snapshot-policy";
import {
  notifyNewOutages,
  notifyPersonalOutageChangesForCityDate,
  notifyPersonalOutagesForCityDate,
} from "./telegram";
import type {
  Env,
  NormalizedOutage,
  NormalizedOutageObservation,
  OutageInput,
  OutageObservationInput,
  OutageRow,
} from "./types";

interface CitySnapshotInput {
  city_key?: unknown;
  snapshot_date?: unknown;
  rows?: unknown;
  observations?: unknown;
  sources_complete?: unknown;
}

interface SyncPayload {
  fetched_at?: unknown;
  jalali_date?: unknown;
  cities?: unknown;
}

function requireText(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== "string") {
    throw new Error(`${field} must be a string.`);
  }
  const normalized = normalizePersianText(value);
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
  return normalizePersianText(value).slice(0, maxLength);
}

function normalizeIdentifier(value: unknown): string {
  if (typeof value !== "string" && typeof value !== "number") {
    throw new Error("Outage identifiers must be strings or numbers.");
  }

  return String(value)
    .trim()
    .replace(/[\u06F0-\u06F9]/g, (digit) =>
      String(digit.charCodeAt(0) - 0x06f0),
    )
    .replace(/[\u0660-\u0669]/g, (digit) =>
      String(digit.charCodeAt(0) - 0x0660),
    )
    .replace(/\s+/g, "");
}

function optionalIdentifierArray(
  value: unknown,
  field: string,
  maxItems: number,
): string[] {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new Error(`${field} must be an array.`);
  }
  if (value.length > maxItems) {
    throw new Error(`${field} has too many items.`);
  }

  return [
    ...new Set(
      value
        .map((item) => normalizeIdentifier(item))
        .filter((item) => item.length > 0),
    ),
  ].sort((left, right) => left.localeCompare(right, "en", { numeric: true }));
}

function parseStoredIdentifierArray(value: string): string[] {
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
          .map((item) => normalizeIdentifier(item))
          .filter(Boolean),
      ),
    ].sort((left, right) => left.localeCompare(right, "en", { numeric: true }));
  } catch {
    return [];
  }
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

async function outageIdentityKey(
  cityKey: string,
  address: string,
): Promise<string> {
  return sha256([cityKey, address].join("\u001f"));
}

async function snapshotIdentityFingerprint(
  rows: NormalizedOutage[],
): Promise<string> {
  return sha256(
    rows
      .map((row) => row.outageKey)
      .sort((left, right) => left.localeCompare(right))
      .join("\u001e"),
  );
}

async function normalizeRows(
  cityKey: string,
  rawRows: unknown,
  fetchedAt: string,
  snapshotDate: string,
): Promise<NormalizedOutage[]> {
  if (!Array.isArray(rawRows)) {
    throw new Error(`rows for ${cityKey} must be an array.`);
  }
  if (rawRows.length > 1000) {
    throw new Error(`rows for ${cityKey} exceeds the 1000-row safety limit.`);
  }

  const normalized = await Promise.all(
    rawRows.map(async (rawRow, index): Promise<NormalizedOutage> => {
      if (!rawRow || typeof rawRow !== "object") {
        throw new Error(`rows[${index}] for ${cityKey} must be an object.`);
      }
      const row = rawRow as OutageInput;
      const address = requireText(row.address, `rows[${index}].address`, 2000);
      const outageType = optionalText(row.type, 300);
      const fromTime = optionalText(row.from, 100);
      const toTime = optionalText(row.to, 100);
      const outageDate = optionalText(row.date, 100) || snapshotDate;
      if (compareJalaliDateText(outageDate, snapshotDate) !== 0) {
        throw new Error(
          `rows[${index}].date for ${cityKey} does not match snapshot_date.`,
        );
      }
      const outageNumbers = optionalIdentifierArray(
        row.outage_numbers,
        `rows[${index}].outage_numbers`,
        50,
      );
      const sourceCityIds = optionalIdentifierArray(
        row.source_city_ids,
        `rows[${index}].source_city_ids`,
        50,
      );

      return {
        cityKey,
        outageKey: await outageIdentityKey(cityKey, address),
        address,
        outageType,
        fromTime,
        toTime,
        outageDate,
        outageNumbers,
        sourceCityIds,
        fetchedAt,
      };
    }),
  );

  const merged = new Map<string, NormalizedOutage>();
  for (const row of normalized) {
    const existing = merged.get(row.outageKey);
    if (!existing) {
      merged.set(row.outageKey, row);
      continue;
    }

    merged.set(row.outageKey, {
      ...existing,
      outageType: existing.outageType || row.outageType,
      fromTime: existing.fromTime || row.fromTime,
      toTime: existing.toTime || row.toTime,
      outageDate: snapshotDate,
      outageNumbers: [...new Set([...existing.outageNumbers, ...row.outageNumbers])]
        .sort((left, right) => left.localeCompare(right, "en", { numeric: true })),
      sourceCityIds: [...new Set([...existing.sourceCityIds, ...row.sourceCityIds])]
        .sort((left, right) => left.localeCompare(right, "en", { numeric: true })),
    });
  }

  return [...merged.values()].sort((left, right) =>
    left.outageKey.localeCompare(right.outageKey),
  );
}

function normalizeObservations(
  cityKey: string,
  rawObservations: unknown,
  fetchedAt: string,
  snapshotDate: string,
): NormalizedOutageObservation[] {
  if (rawObservations === undefined || rawObservations === null) {
    return [];
  }
  if (!Array.isArray(rawObservations)) {
    throw new Error(`observations for ${cityKey} must be an array.`);
  }
  if (rawObservations.length > 3000) {
    throw new Error(
      `observations for ${cityKey} exceeds the 3000-row safety limit.`,
    );
  }

  const deduplicated = new Map<string, NormalizedOutageObservation>();

  rawObservations.forEach((rawObservation, index) => {
    if (!rawObservation || typeof rawObservation !== "object") {
      throw new Error(
        `observations[${index}] for ${cityKey} must be an object.`,
      );
    }
    const observation = rawObservation as OutageObservationInput;
    const originalAddress = requireText(
      observation.address,
      `observations[${index}].address`,
      2000,
    );
    if (
      (typeof observation.outage_number !== "string" &&
        typeof observation.outage_number !== "number") ||
      (typeof observation.source_city_id !== "string" &&
        typeof observation.source_city_id !== "number")
    ) {
      return;
    }
    const outageNumber = normalizeIdentifier(observation.outage_number);
    if (!outageNumber) {
      return;
    }
    const sourceCityId = normalizeIdentifier(observation.source_city_id);
    const outageDate = optionalText(observation.date, 100) || snapshotDate;
    if (compareJalaliDateText(outageDate, snapshotDate) !== 0) {
      throw new Error(
        `observations[${index}].date for ${cityKey} does not match snapshot_date.`,
      );
    }
    const outageTime = optionalText(observation.from, 100);

    const normalized: NormalizedOutageObservation = {
      cityKey,
      outageDate,
      normalizedAddress: normalizePersianText(originalAddress),
      originalAddress,
      outageNumber,
      sourceCityId,
      outageTime,
      outageType: optionalText(observation.type, 300),
      registrationDate: optionalText(observation.reg_date, 100),
      registerer: optionalText(observation.registerer, 200),
      fetchedAt,
    };

    const key = [
      normalized.cityKey,
      normalized.outageDate,
      normalized.normalizedAddress,
      normalized.outageNumber,
      normalized.sourceCityId,
      normalized.outageTime,
    ].join("\u001f");
    deduplicated.set(key, normalized);
  });

  return [...deduplicated.values()];
}

function inferActiveDate(rows: OutageRow[]): string {
  const dates = [
    ...new Set(
      rows
        .map((row) => normalizePersianText(row.outage_date))
        .filter(Boolean),
    ),
  ];
  if (dates.length === 0) {
    return "";
  }
  return dates.sort((left, right) => compareJalaliDateText(left, right)).at(-1) ?? "";
}

function mergeIncomingWithStored(
  incomingRows: NormalizedOutage[],
  storedRows: OutageRow[],
): NormalizedOutage[] {
  const storedByKey = new Map(storedRows.map((row) => [row.outage_key, row]));
  return incomingRows.map((row) => {
    const stored = storedByKey.get(row.outageKey);
    if (!stored) {
      return row;
    }
    return {
      ...row,
      // The current value is derived from the short code at the beginning of
      // the address. Replace historical provider outage numbers instead of
      // unioning them, otherwise the old long identifiers remain visible.
      outageNumbers: [...row.outageNumbers],
      sourceCityIds: [
        ...new Set([
          ...parseStoredIdentifierArray(stored.source_city_ids),
          ...row.sourceCityIds,
        ]),
      ].sort((left, right) => left.localeCompare(right, "en", { numeric: true })),
    };
  });
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
    outage_numbers: JSON.stringify(row.outageNumbers),
    source_city_ids: JSON.stringify(row.sourceCityIds),
    fetched_at: row.fetchedAt,
  };
}

async function safelyNotify(
  env: Env,
  cityKey: string,
  cityLabel: string,
  rows: NormalizedOutage[],
): Promise<string | null> {
  if (rows.length === 0) {
    return null;
  }
  try {
    await notifyNewOutages(env, cityKey, cityLabel, rows.map(toDatabaseRow));
    return null;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown notification error";
    console.error("New-outage notification failed:", error);
    return message;
  }
}


async function safelyNotifyPersonalChanges(
  env: Env,
  cityKey: string,
  cityLabel: string,
  snapshotDate: string,
  previousRows: OutageRow[],
  currentRows: OutageRow[],
): Promise<Record<string, unknown>> {
  try {
    const result = await notifyPersonalOutageChangesForCityDate(
      env,
      cityKey,
      cityLabel,
      snapshotDate,
      previousRows,
      currentRows,
    );
    return {
      personal_change_users_notified: result.usersNotified,
      personal_change_events_notified: result.eventsNotified,
      personal_change_notification_errors: result.errors,
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown personal change notification error";
    console.error("Personal outage change processing failed:", error);
    return {
      personal_change_users_notified: 0,
      personal_change_events_notified: 0,
      personal_change_notification_errors: [message],
    };
  }
}

async function safelyNotifyPersonal(
  env: Env,
  cityKey: string,
  cityLabel: string,
  snapshotDate: string,
  rows: OutageRow[],
): Promise<Record<string, unknown>> {
  try {
    const result = await notifyPersonalOutagesForCityDate(
      env,
      cityKey,
      cityLabel,
      snapshotDate,
      rows,
    );
    return {
      personal_users_notified: result.usersNotified,
      personal_profiles_notified: result.profilesNotified,
      personal_notification_errors: result.errors,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown personal notification error";
    console.error("Personal outage notification processing failed:", error);
    return {
      personal_users_notified: 0,
      personal_profiles_notified: 0,
      personal_notification_errors: [message],
    };
  }
}

export async function synchronizeSnapshots(
  env: Env,
  rawPayload: unknown,
): Promise<Record<string, unknown>> {
  if (!rawPayload || typeof rawPayload !== "object") {
    throw new Error("Request body must be a JSON object.");
  }

  const payload = rawPayload as SyncPayload;
  if (typeof payload.fetched_at !== "string") {
    throw new Error("fetched_at must be a string.");
  }
  const fetchedAt = payload.fetched_at.trim();
  if (!fetchedAt) {
    throw new Error("fetched_at cannot be empty.");
  }
  if (fetchedAt.length > 100) {
    throw new Error("fetched_at is too long.");
  }
  if (Number.isNaN(Date.parse(fetchedAt))) {
    throw new Error("fetched_at must be a valid ISO date-time.");
  }

  const fallbackSnapshotDate =
    typeof payload.jalali_date === "string"
      ? requireText(payload.jalali_date, "jalali_date", 100)
      : "";

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
    if (cityInput.sources_complete === false) {
      throw new Error(`Source collection for ${cityKey} is incomplete.`);
    }

    const snapshotDate =
      typeof cityInput.snapshot_date === "string"
        ? requireText(cityInput.snapshot_date, "snapshot_date", 100)
        : fallbackSnapshotDate;
    if (!snapshotDate) {
      throw new Error(`snapshot_date is required for ${cityKey}.`);
    }
    // Parse/validate once even if the city has no rows.
    compareJalaliDateText(snapshotDate, snapshotDate);

    const rows = await normalizeRows(
      cityKey,
      cityInput.rows,
      fetchedAt,
      snapshotDate,
    );
    const observations = normalizeObservations(
      cityKey,
      cityInput.observations,
      fetchedAt,
      snapshotDate,
    );
    await recordOutageNumberObservations(env.DB, observations);

    const status = await getCitySyncStatus(env.DB, cityKey);
    const storedRows = await listCityOutagesForIdentity(env.DB, cityKey);
    const activeDate = status?.active_date || inferActiveDate(storedRows);
    const hasActiveSnapshot = storedRows.length > 0 && Boolean(activeDate);
    const isInitialSync = !hasActiveSnapshot;

    if (activeDate) {
      const dateOrder = compareJalaliDateText(snapshotDate, activeDate);

      if (dateOrder < 0) {
        await clearPendingCitySnapshot(env.DB, cityKey);
        await updateCitySyncMetadata(
          env.DB,
          cityKey,
          fetchedAt,
          storedRows.length,
          activeDate,
          "ignored_older_date",
          snapshotDate,
        );
        results.push({
          city_key: cityKey,
          snapshot_date: snapshotDate,
          active_date: activeDate,
          decision: "ignored_older_date",
          stored_count: storedRows.length,
          incoming_count: rows.length,
          new_count: 0,
          initial_sync: false,
          observation_count: observations.length,
        });
        continue;
      }

      if (dateOrder === 0) {
        // Any different-date fetch breaks a pending consecutive sequence.
        await clearPendingCitySnapshot(env.DB, cityKey);

        const storedKeys = new Set(storedRows.map((row) => row.outage_key));
        const newRows = rows.filter((row) => !storedKeys.has(row.outageKey));
        const mergedIncoming = mergeIncomingWithStored(rows, storedRows);
        const totalRowCount = new Set([
          ...storedRows.map((row) => row.outage_key),
          ...rows.map((row) => row.outageKey),
        ]).size;

        await mergeCitySnapshot(
          env.DB,
          cityKey,
          mergedIncoming,
          fetchedAt,
          activeDate,
          totalRowCount,
          "merged_same_date",
        );
        const notificationError = await safelyNotify(
          env,
          city.key,
          city.label,
          newRows,
        );
        const activeRowsByKey = new Map(
          storedRows.map((row) => [row.outage_key, row]),
        );
        for (const row of mergedIncoming) {
          activeRowsByKey.set(row.outageKey, toDatabaseRow(row));
        }
        const activeRows = [...activeRowsByKey.values()];
        const personalChangeNotification = await safelyNotifyPersonalChanges(
          env,
          city.key,
          city.label,
          snapshotDate,
          storedRows,
          activeRows,
        );
        const personalNotification = await safelyNotifyPersonal(
          env,
          city.key,
          city.label,
          snapshotDate,
          activeRows,
        );

        results.push({
          city_key: cityKey,
          snapshot_date: snapshotDate,
          active_date: activeDate,
          decision: "merged_same_date",
          stored_count: totalRowCount,
          incoming_count: rows.length,
          new_count: newRows.length,
          initial_sync: false,
          observation_count: observations.length,
          notification_error: notificationError,
          ...personalChangeNotification,
          ...personalNotification,
        });
        continue;
      }
    }

    const fingerprint = await snapshotIdentityFingerprint(rows);
    const pending = await getPendingCitySnapshot(env.DB, cityKey);
    const samePendingCandidate =
      pending?.snapshot_date === snapshotDate &&
      pending.fingerprint === fingerprint;
    const consecutiveCount = samePendingCandidate
      ? pending.consecutive_count + 1
      : 1;
    const firstSeenAt = samePendingCandidate
      ? pending.first_seen_at
      : fetchedAt;
    const requiredCount = requiredConsecutiveFetches(rows.length);
    const timeEligible = isSnapshotTimeEligible(snapshotDate, fetchedAt);
    const contentEligible =
      requiredCount !== null && consecutiveCount >= requiredCount;

    if (!timeEligible || !contentEligible) {
      const decision =
        rows.length === 0
          ? "pending_empty_never_activates"
          : !timeEligible
            ? "pending_before_23"
            : "pending_needs_confirmation";

      await savePendingCitySnapshot(
        env.DB,
        cityKey,
        snapshotDate,
        fingerprint,
        rows,
        consecutiveCount,
        firstSeenAt,
        fetchedAt,
        activeDate,
        storedRows.length,
        decision,
      );

      results.push({
        city_key: cityKey,
        snapshot_date: snapshotDate,
        active_date: activeDate || null,
        decision,
        stored_count: storedRows.length,
        incoming_count: rows.length,
        pending_count: rows.length,
        pending_consecutive_count: consecutiveCount,
        required_consecutive_count: requiredCount,
        time_eligible: timeEligible,
        new_count: 0,
        initial_sync: isInitialSync,
        observation_count: observations.length,
      });
      continue;
    }

    const decision = hasActiveSnapshot
      ? "activated_new_date"
      : "activated_initial_snapshot";
    await activateCitySnapshot(
      env.DB,
      cityKey,
      rows,
      fetchedAt,
      activeDate,
      snapshotDate,
      decision,
    );

    const notificationError = hasActiveSnapshot
      ? await safelyNotify(env, city.key, city.label, rows)
      : null;
    const personalNotification = await safelyNotifyPersonal(
      env,
      city.key,
      city.label,
      snapshotDate,
      rows.map(toDatabaseRow),
    );

    results.push({
      city_key: cityKey,
      snapshot_date: snapshotDate,
      active_date: snapshotDate,
      previous_active_date: activeDate || null,
      decision,
      stored_count: rows.length,
      incoming_count: rows.length,
      new_count: hasActiveSnapshot ? rows.length : 0,
      initial_sync: isInitialSync,
      pending_consecutive_count: consecutiveCount,
      required_consecutive_count: requiredCount,
      time_eligible: timeEligible,
      observation_count: observations.length,
      notification_error: notificationError,
      ...personalNotification,
    });
  }

  return {
    ok: true,
    fetched_at: fetchedAt,
    cities: results,
  };
}
