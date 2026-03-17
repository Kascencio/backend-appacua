import dotenv from 'dotenv';
dotenv.config();

function normalizeEnvValue(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (trimmed.length >= 2) {
    const first = trimmed[0];
    const last = trimmed[trimmed.length - 1];
    if ((first === '"' && last === '"') || (first === '\'' && last === '\'')) {
      return trimmed.slice(1, -1).trim();
    }
  }
  return trimmed;
}

const normalizedDatabaseUrl = normalizeEnvValue(process.env.DATABASE_URL);
if (normalizedDatabaseUrl) {
  process.env.DATABASE_URL = normalizedDatabaseUrl;
}

const normalizedTelegramEnabled = normalizeEnvValue(process.env.TELEGRAM_ENABLED)?.toLowerCase();
const normalizedTelegramBotToken = normalizeEnvValue(process.env.TELEGRAM_BOT_TOKEN);
const normalizedTelegramChatId =
  normalizeEnvValue(process.env.TELEGRAM_CHAT_ID) ||
  normalizeEnvValue(process.env.TELEGRAM_CHAT_ID_ADMIN);
const normalizedTelegramWebhookSecret = normalizeEnvValue(process.env.TELEGRAM_WEBHOOK_SECRET);
const normalizedTelegramWebhookBaseUrl = normalizeEnvValue(process.env.TELEGRAM_WEBHOOK_BASE_URL);
const normalizedTelegramWebhookVerifyIntervalMs = normalizeEnvValue(process.env.TELEGRAM_WEBHOOK_VERIFY_INTERVAL_MS);

if (normalizedTelegramBotToken) {
  process.env.TELEGRAM_BOT_TOKEN = normalizedTelegramBotToken;
}
if (normalizedTelegramChatId) {
  process.env.TELEGRAM_CHAT_ID = normalizedTelegramChatId;
  process.env.TELEGRAM_CHAT_ID_ADMIN = normalizedTelegramChatId;
}
if (normalizedTelegramWebhookSecret) {
  process.env.TELEGRAM_WEBHOOK_SECRET = normalizedTelegramWebhookSecret;
}
if (normalizedTelegramWebhookBaseUrl) {
  process.env.TELEGRAM_WEBHOOK_BASE_URL = normalizedTelegramWebhookBaseUrl;
}
if (normalizedTelegramWebhookVerifyIntervalMs) {
  process.env.TELEGRAM_WEBHOOK_VERIFY_INTERVAL_MS = normalizedTelegramWebhookVerifyIntervalMs;
}

if (!normalizedDatabaseUrl || !normalizedDatabaseUrl.startsWith('mysql://')) {
  // Fallo explícito y legible para despliegues con variables mal inyectadas
  throw new Error(
    'DATABASE_URL inválida. Debe iniciar con "mysql://" y no llevar comillas externas.'
  );
}

export const config = {
  env: process.env.NODE_ENV || 'production',
  port: Number(process.env.PORT || 3100),
  host: process.env.HOST || '0.0.0.0',
  jwtSecret: process.env.JWT_SECRET || 'change_me',
  databaseUrl: normalizedDatabaseUrl,
  telegramEnabled: normalizedTelegramEnabled === 'true' || !!normalizedTelegramBotToken,
  telegramBotToken: normalizedTelegramBotToken || '',
  telegramChatId: normalizedTelegramChatId || '',
  telegramWebhookSecret: normalizedTelegramWebhookSecret || '',
  telegramWebhookBaseUrl: normalizedTelegramWebhookBaseUrl || '',
  telegramWebhookVerifyIntervalMs: Number(normalizedTelegramWebhookVerifyIntervalMs || 300000),
};
