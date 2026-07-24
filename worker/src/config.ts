import type { CityConfig, ReplyKeyboardMarkup } from "./types";

export const FALLBACK_CITIES: CityConfig[] = [
  { key: "babol", label: "بابل" },
  { key: "babolsar", label: "بابلسر" },
  { key: "sari", label: "ساری" },
  { key: "qaemshahr", label: "قائم‌شهر" },
  { key: "amol", label: "آمل" },
  { key: "behshahr", label: "بهشهر" },
];

let runtimeCities: CityConfig[] = [...FALLBACK_CITIES];

export function setRuntimeCities(cities: CityConfig[]): void {
  const unique = new Map<string, CityConfig>();
  for (const city of cities) {
    const key = city.key.trim();
    const label = city.label.trim();
    if (key && label) unique.set(key, { key, label });
  }
  if (unique.size > 0) {
    runtimeCities = [...unique.values()].sort((a, b) =>
      a.label.localeCompare(b.label, "fa"),
    );
  }
}

export function getRuntimeCities(): CityConfig[] {
  return [...runtimeCities];
}

export const CITIES = runtimeCities;
export const MAZANDARAN_BUTTON = "🗺 استان مازندران";
export const PERSONAL_OUTAGE_BUTTON = "⚡ خاموشی من";
export const SPECIAL_LOOKUP_BUTTON = "⭐ استعلام ویژه";
export const SUPPORT_BUTTON = "💛 حمایت از پروژه";
export const ADMIN_PANEL_BUTTON = "🛡 مدیریت";
export const ADMIN_STATUS_BUTTON = "📊 وضعیت سامانه";
export const ADMIN_USERS_BUTTON = "👥 مدیریت کاربران";
export const ADMIN_CITIES_BUTTON = "🏙 مدیریت شهرها";
export const ADMIN_UPDATES_BUTTON = "🔄 مرکز بروزرسانی";
export const ADMIN_SPECIAL_REQUESTS_BUTTON = "⭐ درخواست‌های ویژه";
export const ADMIN_ADD_CITY_BUTTON = "➕ افزودن شهر";
export const ADMIN_AUTO_SOURCE_BUTTON = "🔎 کشف خودکار شماره‌ها";
export const ADMIN_MANUAL_SOURCE_BUTTON = "⌨️ ورود دستی شماره‌ها";
export const SEARCH_BUTTON = "🔍 جستجو";
export const SHOW_ALL_BUTTON = "📋 نمایش همه";
export const CHANGE_CITY_BUTTON = "🏙 تغییر شهر";
export const MAIN_MENU_BUTTON = "🏠 منوی اصلی";
export const PERSONAL_NUMBER_MODE_BUTTON = "🔢 شماره خاموشی";
export const PERSONAL_ADDRESS_MODE_BUTTON = "📍 کلمه آدرس";
export const REMINDER_NONE_BUTTON = "🔕 بدون یادآوری";
export const REMINDER_30_BUTTON = "⏰ ۳۰ دقیقه قبل";
export const REMINDER_60_BUTTON = "⏰ ۶۰ دقیقه قبل";
export const CANCEL_BUTTON = "❌ انصراف";

export function cityByKey(key: string | null | undefined): CityConfig | null {
  return runtimeCities.find((city) => city.key === key) ?? null;
}

export function cityByLabel(label: string): CityConfig | null {
  return runtimeCities.find((city) => city.label === label) ?? null;
}

function citySelectionRows(): ReplyKeyboardMarkup["keyboard"] {
  const rows: ReplyKeyboardMarkup["keyboard"] = [];
  for (let index = 0; index < runtimeCities.length; index += 2) {
    rows.push(
      runtimeCities.slice(index, index + 2).map((city) => ({ text: city.label })),
    );
  }
  return rows;
}

export function mainMenuKeyboard(isAdmin = false): ReplyKeyboardMarkup {
  const keyboard: ReplyKeyboardMarkup["keyboard"] = [
    [{ text: MAZANDARAN_BUTTON }],
    [{ text: PERSONAL_OUTAGE_BUTTON }, { text: SPECIAL_LOOKUP_BUTTON }],
    [{ text: SUPPORT_BUTTON }],
  ];
  if (isAdmin) keyboard.push([{ text: ADMIN_PANEL_BUTTON }]);
  return {
    keyboard,
    resize_keyboard: true,
    is_persistent: true,
    input_field_placeholder: "یک گزینه را انتخاب کنید",
  };
}

export function adminMenuKeyboard(): ReplyKeyboardMarkup {
  return {
    keyboard: [
      [{ text: ADMIN_STATUS_BUTTON }],
      [{ text: ADMIN_USERS_BUTTON }],
      [{ text: ADMIN_CITIES_BUTTON }],
      [{ text: ADMIN_UPDATES_BUTTON }],
      [{ text: ADMIN_SPECIAL_REQUESTS_BUTTON }],
      [{ text: MAIN_MENU_BUTTON }],
    ],
    resize_keyboard: true,
    is_persistent: true,
    input_field_placeholder: "بخش مدیریت را انتخاب کنید",
  };
}

export function adminSourceModeKeyboard(): ReplyKeyboardMarkup {
  return {
    keyboard: [
      [{ text: ADMIN_AUTO_SOURCE_BUTTON }],
      [{ text: ADMIN_MANUAL_SOURCE_BUTTON }],
      [{ text: CANCEL_BUTTON }, { text: MAIN_MENU_BUTTON }],
    ],
    resize_keyboard: true,
    is_persistent: true,
    input_field_placeholder: "روش دریافت شماره‌های منبع را انتخاب کنید",
  };
}

export function cityMenuKeyboard(): ReplyKeyboardMarkup {
  return {
    keyboard: [...citySelectionRows(), [{ text: MAIN_MENU_BUTTON }]],
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
      ...citySelectionRows(),
      [{ text: CANCEL_BUTTON }, { text: MAIN_MENU_BUTTON }],
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
      [{ text: CANCEL_BUTTON }, { text: MAIN_MENU_BUTTON }],
    ],
    resize_keyboard: true,
    is_persistent: true,
    input_field_placeholder: "روش تطبیق را انتخاب کنید",
  };
}

export function personalizationReminderKeyboard(): ReplyKeyboardMarkup {
  return {
    keyboard: [
      [{ text: REMINDER_30_BUTTON }],
      [{ text: REMINDER_60_BUTTON }],
      [{ text: REMINDER_NONE_BUTTON }],
      [{ text: CANCEL_BUTTON }, { text: MAIN_MENU_BUTTON }],
    ],
    resize_keyboard: true,
    is_persistent: true,
    input_field_placeholder: "زمان یادآوری را انتخاب کنید",
  };
}
