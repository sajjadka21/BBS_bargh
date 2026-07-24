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
    // Convert underscores and every common dash variant, including repeated
    // separators such as __ and --, to exactly one plain spaced hyphen.
    .replace(/\s*(?:[_\-‐‑‒–—−]+\s*)+\s*/g, " - ")
    // Keep address text readable by separating letters and Persian digits.
    .replace(/([\p{L}])(?=[۰-۹])/gu, "$1 ")
    .replace(/([۰-۹])(?=[\p{L}])/gu, "$1 ")
    .replace(/\s+/g, " ")
    .replace(/\s*(?:[_\-‐‑‒–—−]+\s*)+\s*/g, " - ")
    .trim();
}


/**
 * Build a conservative identity value for outage addresses.
 *
 * Only presentation differences are removed. There is deliberately no fuzzy
 * matching: different meaningful words or numbers always create a new block.
 */
export function canonicalizeAddressIdentity(value: string): string {
  return normalizePersianText(value)
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[\u200C\u200D]/g, " ")
    .replace(/[_.,\u060C:\u061B;!?\u061F()\[\]{}"'\/\\|+=*#@~`<>\-\u00AB\u00BB\u2010-\u2015\u2212]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function toPersianDigits(value: string | number): string {
  return String(value).replace(/[0-9٠-٩]/g, mapDigitToPersian);
}
