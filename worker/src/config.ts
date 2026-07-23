import type { CityConfig, ReplyKeyboardMarkup } from "./types";

export const CITIES: CityConfig[] = [
  { key: "babol", label: "بابل" },
  { key: "babolsar", label: "بابلسر" },
  { key: "sari", label: "ساری" },
  { key: "qaemshahr", label: "قائم‌شهر" },
];

export const MAZANDARAN_BUTTON = "🗺 استان مازندران";
export const SEARCH_BUTTON = "🔍 جستجو";
export const SHOW_ALL_BUTTON = "📋 نمایش همه";
export const CHANGE_CITY_BUTTON = "🏙 تغییر شهر";
export const MAIN_MENU_BUTTON = "🏠 منوی اصلی";

export function cityByKey(key: string | null | undefined): CityConfig | null {
  return CITIES.find((city) => city.key === key) ?? null;
}

export function cityByLabel(label: string): CityConfig | null {
  return CITIES.find((city) => city.label === label) ?? null;
}

export function mainMenuKeyboard(): ReplyKeyboardMarkup {
  return {
    keyboard: [[{ text: MAZANDARAN_BUTTON }]],
    resize_keyboard: true,
    is_persistent: true,
    input_field_placeholder: "استان را انتخاب کنید",
  };
}

export function cityMenuKeyboard(): ReplyKeyboardMarkup {
  return {
    keyboard: [
      CITIES.slice(0, 2).map((city) => ({ text: city.label })),
      CITIES.slice(2, 4).map((city) => ({ text: city.label })),
      [{ text: MAIN_MENU_BUTTON }],
    ],
    resize_keyboard: true,
    is_persistent: true,
    input_field_placeholder: "شهر را انتخاب کنید",
  };
}

export function cityActionKeyboard(): ReplyKeyboardMarkup {
  return {
    keyboard: [
      [{ text: SEARCH_BUTTON }, { text: SHOW_ALL_BUTTON }],
      [{ text: CHANGE_CITY_BUTTON }],
      [{ text: MAIN_MENU_BUTTON }],
    ],
    resize_keyboard: true,
    is_persistent: true,
    input_field_placeholder: "یک گزینه را انتخاب کنید",
  };
}
