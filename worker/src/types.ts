export interface D1Meta {
  changes?: number;
}

export interface D1Result<T = Record<string, unknown>> {
  results: T[];
  success: boolean;
  meta: D1Meta;
  error?: string;
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run<T = Record<string, unknown>>(): Promise<D1Result<T>>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = Record<string, unknown>>(
    statements: D1PreparedStatement[],
  ): Promise<D1Result<T>[]>;
}

export interface Env {
  DB: D1Database;
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_WEBHOOK_SECRET: string;
  SYNC_SECRET: string;
  NOTIFY_CHAT_ID?: string;
}

export interface CityConfig {
  key: string;
  label: string;
}

export interface OutageInput {
  address: string;
  type?: string;
  from?: string;
  to?: string;
  date?: string;
}

export interface NormalizedOutage {
  cityKey: string;
  outageKey: string;
  address: string;
  outageType: string;
  fromTime: string;
  toTime: string;
  outageDate: string;
  fetchedAt: string;
}

export interface OutageRow {
  city_key: string;
  outage_key: string;
  address: string;
  outage_type: string;
  from_time: string;
  to_time: string;
  outage_date: string;
  fetched_at: string;
}

export interface ChatSession {
  chat_id: string;
  selected_city: string | null;
  awaiting_search: number;
  updated_at: string;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}

export interface TelegramMessage {
  message_id: number;
  chat: {
    id: number;
  };
  text?: string;
}

export interface ReplyKeyboardMarkup {
  keyboard: Array<Array<{ text: string }>>;
  resize_keyboard: boolean;
  is_persistent: boolean;
  input_field_placeholder?: string;
}
