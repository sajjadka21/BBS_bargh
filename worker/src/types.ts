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
  ADMIN_TELEGRAM_USER_ID?: string;
  NOTIFY_CHAT_ID?: string;
  GITHUB_ACTIONS_TOKEN?: string;
  GITHUB_REPOSITORY?: string;
  GITHUB_WORKFLOW_FILE?: string;
  GITHUB_REF?: string;
  BILL_ID_ENCRYPTION_KEY?: string;
  SUPPORT_USDT_ADDRESS?: string;
  SUPPORT_USDT_NETWORK?: string;
  SUPPORT_CONTACT?: string;
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
  profile_id: string | null;
  profile_label: string | null;
  match_value: string | null;
  updated_at: string;
}

export interface PersonalOutageProfile {
  profile_id: string;
  telegram_user_id: string;
  profile_label: string;
  city_key: string;
  match_mode: PersonalMatchMode;
  match_value: string;
  reminder_minutes: number;
  created_at: string;
  updated_at: string;
}

export interface AuthorizedPersonalProfile extends PersonalOutageProfile {
  chat_id: string;
  username: string;
  first_name: string;
  last_name: string;
}

export interface PasswordFailureState {
  attempts: number;
  lockedUntil: string | null;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
  pre_checkout_query?: TelegramPreCheckoutQuery;
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
  successful_payment?: TelegramSuccessfulPayment;
}



export interface TelegramSuccessfulPayment {
  currency: string;
  total_amount: number;
  invoice_payload: string;
  telegram_payment_charge_id: string;
  provider_payment_charge_id: string;
}

export interface TelegramPreCheckoutQuery {
  id: string;
  from: TelegramUser;
  currency: string;
  total_amount: number;
  invoice_payload: string;
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

export interface ScheduledControllerLike {
  cron: string;
  scheduledTime: number;
  noRetry?(): void;
}

export interface ExecutionContextLike {
  waitUntil(promise: Promise<unknown>): void;
}

export interface AdminSystemStats {
  authorized_users: number;
  personal_profiles: number;
  active_outages: number;
  archived_outages: number;
  outage_number_observations: number;
  daily_notifications_24h: number;
  change_notifications_24h: number;
  reminders_24h: number;
  pending_special_requests: number;
  support_stars_total: number;
  pending_tether_submissions: number;
  manual_operations_24h: number;
}
