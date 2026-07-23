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
  PERSONALIZATION_PASSWORD?: string;
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
  outage_numbers?: unknown;
  source_city_ids?: unknown;
}

export interface OutageObservationInput {
  address?: unknown;
  outage_number?: unknown;
  source_city_id?: unknown;
  date?: unknown;
  from?: unknown;
  type?: unknown;
  reg_date?: unknown;
  registerer?: unknown;
}

export interface NormalizedOutage {
  cityKey: string;
  outageKey: string;
  address: string;
  outageType: string;
  fromTime: string;
  toTime: string;
  outageDate: string;
  outageNumbers: string[];
  sourceCityIds: string[];
  fetchedAt: string;
}

export interface NormalizedOutageObservation {
  cityKey: string;
  outageDate: string;
  normalizedAddress: string;
  originalAddress: string;
  outageNumber: string;
  sourceCityId: string;
  outageTime: string;
  outageType: string;
  registrationDate: string;
  registerer: string;
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
  outage_numbers: string;
  source_city_ids: string;
  fetched_at: string;
}

export interface CitySyncStatus {
  city_key: string;
  fetched_at: string;
  row_count: number;
  updated_at: string;
  active_date: string;
  last_decision: string;
  last_snapshot_date: string;
  pending_date?: string | null;
  pending_row_count?: number | null;
  pending_consecutive_count?: number | null;
}

export interface PendingCitySnapshot {
  city_key: string;
  snapshot_date: string;
  fingerprint: string;
  rows_json: string;
  row_count: number;
  consecutive_count: number;
  first_seen_at: string;
  last_seen_at: string;
  fetched_at: string;
}

export interface NotificationBatch {
  id: string;
  chatId: string;
  cityKey: string;
  rows: OutageRow[];
  createdAt: string;
}

export interface ChatSession {
  chat_id: string;
  selected_city: string | null;
  awaiting_search: number;
  updated_at: string;
}

export type PersonalMatchMode = "outage_number" | "address_keyword";

export interface TelegramUserRecord {
  telegram_user_id: string;
  chat_id: string;
  username: string;
  first_name: string;
  last_name: string;
  is_authorized: number;
  authorized_at: string | null;
  revoked_at: string | null;
  last_seen_at: string;
  failed_password_attempts: number;
  password_window_started_at: string | null;
  locked_until: string | null;
}

export interface PersonalizationFlow {
  telegram_user_id: string;
  chat_id: string;
  state: string;
  city_key: string | null;
  match_mode: PersonalMatchMode | null;
  updated_at: string;
}

export interface PersonalOutageProfile {
  telegram_user_id: string;
  city_key: string;
  match_mode: PersonalMatchMode;
  match_value: string;
  created_at: string;
  updated_at: string;
}

export interface PasswordFailureState {
  attempts: number;
  lockedUntil: string | null;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

export interface TelegramUser {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
}

export interface TelegramMessage {
  message_id: number;
  chat: {
    id: number;
    type?: string;
  };
  from?: TelegramUser;
  text?: string;
}

export interface TelegramCallbackQuery {
  id: string;
  from?: TelegramUser;
  message?: TelegramMessage;
  data?: string;
}

export interface ReplyKeyboardMarkup {
  keyboard: Array<Array<{ text: string }>>;
  resize_keyboard: boolean;
  is_persistent: boolean;
  input_field_placeholder?: string;
}

export interface InlineKeyboardMarkup {
  inline_keyboard: Array<
    Array<{
      text: string;
      callback_data: string;
    }>
  >;
}

export type TelegramReplyMarkup = ReplyKeyboardMarkup | InlineKeyboardMarkup;
