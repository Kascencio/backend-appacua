import type { FastifyInstance } from 'fastify';
import { config } from '../config/index.js';

type TelegramWebhookInfoResponse = {
  ok?: boolean;
  result?: {
    url?: string;
    has_custom_certificate?: boolean;
    pending_update_count?: number;
    last_error_date?: number;
    last_error_message?: string;
  };
  description?: string;
};

function normalizeBaseUrl(value: string): string {
  return String(value || '').trim().replace(/\/+$/, '');
}

function buildExpectedWebhookUrl(): string {
  const baseUrl = normalizeBaseUrl(config.telegramWebhookBaseUrl);
  if (!baseUrl) return '';
  return `${baseUrl}/api/telegram/webhook`;
}

function assertTelegramWebhookConfig(): string | null {
  if (!config.telegramEnabled || !config.telegramBotToken) return null;

  const expectedUrl = buildExpectedWebhookUrl();
  if (expectedUrl) return expectedUrl;

  if (config.env === 'production') {
    throw new Error('TELEGRAM_WEBHOOK_BASE_URL es obligatorio cuando Telegram está habilitado en producción.');
  }

  return null;
}

async function callTelegramApi<T>(method: string, body?: Record<string, unknown>): Promise<T> {
  const token = config.telegramBotToken;
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.ok === false) {
    throw new Error(data?.description || `Telegram API ${method} respondió HTTP ${response.status}`);
  }

  return data as T;
}

async function getWebhookInfo(): Promise<TelegramWebhookInfoResponse['result']> {
  const data = await callTelegramApi<TelegramWebhookInfoResponse>('getWebhookInfo');
  return data.result || {};
}

async function setWebhook(expectedUrl: string): Promise<void> {
  await callTelegramApi('setWebhook', {
    url: expectedUrl,
    secret_token: config.telegramWebhookSecret || undefined,
    allowed_updates: ['message', 'edited_message'],
    drop_pending_updates: false,
  });
}

async function ensureWebhook(app: FastifyInstance, reason: 'startup' | 'verify'): Promise<void> {
  const expectedUrl = assertTelegramWebhookConfig();
  if (!expectedUrl) {
    if (config.telegramEnabled && config.env !== 'production') {
      app.log.warn('Telegram habilitado sin TELEGRAM_WEBHOOK_BASE_URL. Se omite auto-registro del webhook en este entorno.');
    }
    return;
  }

  const info = await getWebhookInfo();
  const currentUrl = String(info?.url || '').trim();
  const isExpected = currentUrl === expectedUrl;

  if (!isExpected) {
    await setWebhook(expectedUrl);
    app.log.info({ reason, expectedUrl, previousUrl: currentUrl || null }, 'Webhook de Telegram registrado');
    return;
  }

  app.log.info(
    {
      reason,
      expectedUrl,
      pendingUpdates: info?.pending_update_count ?? 0,
      lastError: info?.last_error_message ?? null,
    },
    'Webhook de Telegram verificado',
  );
}

export async function startTelegramWebhookBootstrap(app: FastifyInstance): Promise<void> {
  if (!config.telegramEnabled || !config.telegramBotToken) return;

  await ensureWebhook(app, 'startup');

  const intervalMs = Number.isFinite(config.telegramWebhookVerifyIntervalMs)
    ? Math.max(60_000, Math.trunc(config.telegramWebhookVerifyIntervalMs))
    : 300_000;

  const timer = setInterval(() => {
    void ensureWebhook(app, 'verify').catch((error) => {
      app.log.error(
        {
          error: error instanceof Error ? error.message : String(error),
        },
        'No fue posible verificar el webhook de Telegram',
      );
    });
  }, intervalMs);

  timer.unref?.();
}
