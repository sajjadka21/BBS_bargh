import type { CityConfig, ReplyKeyboardMarkup } from "./types";

export const CITIES: CityConfig[] = [
  { key: "babol", label: "بابل" },
  { key: "babolsar", label: "بابلسر" },
  { key: "sari", label: "ساری" },
  { key: "qaemshahr", label: "قائم‌شهر" },
];

export const MAZANDARAN_BUTTON = "🗺 استان مازندران";
export const PERSONAL_OUTAGE_BUTTON = "⚡ خاموشی من";
export const SEARCH_BUTTON = "🔍 جستجو";
export const SHOW_ALL_BUTTON = "📋 نمایش همه";
export const CHANGE_CITY_BUTTON = "🏙 تغییر شهر";
export const MAIN_MENU_BUTTON = "🏠 منوی اصلی";
export const PERSONAL_NUMBER_MODE_BUTTON = "🔢 شماره خاموشی";
export const PERSONAL_ADDRESS_MODE_BUTTON = "📍 کلمه آدرس";
export const EDIT_PERSONAL_OUTAGE_BUTTON = "✏️ ویرایش خاموشی من";
export const DELETE_PERSONAL_OUTAGE_BUTTON = "🗑 حذف خاموشی من";
export const CONFIRM_DELETE_BUTTON = "بله، حذف شود";
export const CANCEL_BUTTON = "❌ انصراف";

export function cityByKey(key: string | null | undefined): CityConfig | null {
  return CITIES.find((city) => city.key === key) ?? null;
}

export function cityByLabel(label: string): CityConfig | null {
  return CITIES.find((city) => city.label === label) ?? null;
}

export function mainMenuKeyboard(): ReplyKeyboardMarkup {
  return {
    keyboard: [
      [{ text: MAZANDARAN_BUTTON }],
      [{ text: PERSONAL_OUTAGE_BUTTON }],
    ],
    resize_keyboard: true,
    is_persistent: true,
    input_field_placeholder: "یک گزینه را انتخاب کنید",
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

export function personalizationCityKeyboard(): ReplyKeyboardMarkup {
  return {
    keyboard: [
      CITIES.slice(0, 2).map((city) => ({ text: city.label })),
      CITIES.slice(2, 4).map((city) => ({ text: city.label })),
      [{ text: CANCEL_BUTTON }],
    ],
    resize_keyboard: true,
    is_persistent: true,
    input_field_placeholder: "شهر خاموشی من را انتخاب کنید",
  };
}

export function personalizationModeKeyboard(): ReplyKeyboardMarkup {
  return {
    keyboard: [
      [{ text: PERSONAL_NUMBER_MODE_BUTTON }],
      [{ text: PERSONAL_ADDRESS_MODE_BUTTON }],
      [{ text: CANCEL_BUTTON }],
    ],
    resize_keyboard: true,
    is_persistent: true,
    input_field_placeholder: "روش تطبیق را انتخاب کنید",
  };
}

export function personalizationProfileKeyboard(): ReplyKeyboardMarkup {
  return {
    keyboard: [
      [{ text: EDIT_PERSONAL_OUTAGE_BUTTON }],
      [{ text: DELETE_PERSONAL_OUTAGE_BUTTON }],
      [{ text: MAIN_MENU_BUTTON }],
    ],
    resize_keyboard: true,
    is_persistent: true,
    input_field_placeholder: "تنظیم خاموشی من",
  };
}

export function deleteConfirmationKeyboard(): ReplyKeyboardMarkup {
  return {
    keyboard: [
      [{ text: CONFIRM_DELETE_BUTTON }],
      [{ text: CANCEL_BUTTON }],
    ],
    resize_keyboard: true,
    is_persistent: true,
    input_field_placeholder: "حذف تنظیم را تأیید کنید",
  };
}
