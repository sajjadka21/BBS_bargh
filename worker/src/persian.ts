const ASCII_ZERO = "0".charCodeAt(0);
const ARABIC_INDIC_ZERO = "٠".charCodeAt(0);
const PERSIAN_ZERO = "۰".charCodeAt(0);

function mapDigitToPersian(digit: string): string {
  const code = digit.charCodeAt(0);
  if (code >= ASCII_ZERO && code <= ASCII_ZERO + 9) {
    return String.fromCharCode(PERSIAN_ZERO + code - ASCII_ZERO);
  }
  if (code >= ARABIC_INDIC_ZERO && code <= ARABIC_INDIC_ZERO + 9) {
    return String.fromCharCode(PERSIAN_ZERO + code - ARABIC_INDIC_ZERO);
  }
  return digit;
}

export function normalizePersianText(value: string): string {
  return value
    .replace(/[يى]/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[0-9٠-٩]/g, mapDigitToPersian)
    .replace(/ـ/g, "")
    .replace(/\s*[-‐‑‒–—−]+\s*/g, " - ")
    .replace(/\s+/g, " ")
    .trim();
}

export function toPersianDigits(value: string | number): string {
  return String(value).replace(/[0-9٠-٩]/g, mapDigitToPersian);
}
