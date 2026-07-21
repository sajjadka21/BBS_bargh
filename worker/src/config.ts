import type { CityConfig, ReplyKeyboardMarkup } from "./types";

export const CITIES: CityConfig[] = [
  { key: "babolsar", label: "بابلسر" },
  { key: "sari", label: "ساری" },
];

export const SEARCH_BUTTON = "🔍 جستجو";
export const SHOW_ALL_BUTTON = "📋 نمایش همه";
export const BACK_BUTTON = "⬅️ بازگشت";

export function cityByKey(key: string | null | undefined): CityConfig | null {
  return CITIES.find((city) => city.key === key) ?? null;
}

export function cityByLabel(label: string): CityConfig | null {
  return CITIES.find((city) => city.label === label) ?? null;
}

export function cityMenuKeyboard(): ReplyKeyboardMarkup {
  return {
    keyboard: [CITIES.map((city) => ({ text: city.label }))],
    resize_keyboard: true,
    is_persistent: true,
    input_field_placeholder: "شهر را انتخاب کنید",
  };
}

export function cityActionKeyboard(): ReplyKeyboardMarkup {
  return {
    keyboard: [
      [{ text: SEARCH_BUTTON }, { text: SHOW_ALL_BUTTON }],
      [{ text: BACK_BUTTON }],
    ],
    resize_keyboard: true,
    is_persistent: true,
    input_field_placeholder: "یک گزینه را انتخاب کنید",
  };
}
