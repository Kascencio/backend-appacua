import dotenv from 'dotenv';
dotenv.config();

export const config = {
  env: process.env.NODE_ENV || 'production',
  port: Number(process.env.PORT || 3300),
  host: process.env.HOST || '0.0.0.0',
  jwtSecret: process.env.JWT_SECRET || 'change_me',
  databaseUrl: process.env.DATABASE_URL,
  telegramEnabled: process.env.TELEGRAM_ENABLED === 'true' || !!process.env.TELEGRAM_BOT_TOKEN,
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
  telegramChatId: process.env.TELEGRAM_CHAT_ID || process.env.TELEGRAM_CHAT_ID_ADMIN || ''
};
