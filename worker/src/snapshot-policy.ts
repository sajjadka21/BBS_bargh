export interface JalaliDateParts {
  year: number;
  month: number;
  day: number;
}

export interface TehranClock extends JalaliDateParts {
  minutes: number;
}

export function asciiDigits(value: string): string {
  return value
    .replace(/[\u06F0-\u06F9]/g, (digit) =>
      String(digit.charCodeAt(0) - 0x06f0),
    )
    .replace(/[\u0660-\u0669]/g, (digit) =>
      String(digit.charCodeAt(0) - 0x0660),
    );
}

export function parseJalaliDate(value: string): JalaliDateParts | null {
  const match = asciiDigits(value.trim()).match(
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

export function compareJalaliDates(
  left: JalaliDateParts,
  right: JalaliDateParts,
): number {
  return (
    left.year - right.year || left.month - right.month || left.day - right.day
  );
}

export function compareJalaliDateText(left: string, right: string): number {
  const leftParts = parseJalaliDate(left);
  const rightParts = parseJalaliDate(right);
  if (!leftParts || !rightParts) {
    throw new Error(`Invalid Jalali date comparison: ${left} / ${right}`);
  }
  return compareJalaliDates(leftParts, rightParts);
}

export function getTehranClockAt(date: Date): TehranClock | null {
  const parts = new Intl.DateTimeFormat("en-US-u-ca-persian-nu-latn", {
    timeZone: "Asia/Tehran",
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

/**
 * A future snapshot may become active at 23:00 Tehran time. If its date has
 * already started (or passed), activation is immediately time-eligible.
 */
export function isSnapshotTimeEligible(
  snapshotDate: string,
  fetchedAt: string,
): boolean {
  const target = parseJalaliDate(snapshotDate);
  const instant = new Date(fetchedAt);
  if (!target || Number.isNaN(instant.getTime())) {
    throw new Error("Cannot evaluate snapshot activation time.");
  }

  const tehran = getTehranClockAt(instant);
  if (!tehran) {
    throw new Error("Cannot determine Tehran date/time.");
  }

  if (compareJalaliDates(target, tehran) <= 0) {
    return true;
  }

  return tehran.minutes >= 23 * 60;
}

/**
 * Empty snapshots are never activation candidates. One to three blocks need
 * two consecutive identical successful fetches. Four or more need one.
 */
export function requiredConsecutiveFetches(rowCount: number): number | null {
  if (!Number.isInteger(rowCount) || rowCount < 0) {
    throw new Error("rowCount must be a non-negative integer.");
  }
  if (rowCount === 0) {
    return null;
  }
  return rowCount <= 3 ? 2 : 1;
}
