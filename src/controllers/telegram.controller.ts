import type { FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../config/index.js';
import {
  processTelegramWebhookUpdate,
  type TelegramWebhookUpdate,
} from '../services/telegram-bot.service.js';

function getTelegramSecretHeader(req: FastifyRequest): string {
  const value = req.headers['x-telegram-bot-api-secret-token'];
  if (Array.isArray(value)) {
    return String(value[0] || '').trim();
  }
  return String(value || '').trim();
}

export async function telegramWebhook(req: FastifyRequest, reply: FastifyReply) {
  if (!config.telegramEnabled || !config.telegramBotToken) {
    return reply.status(503).send({ ok: false, error: 'Telegram no configurado' });
  }

  if (config.telegramWebhookSecret) {
    const incomingSecret = getTelegramSecretHeader(req);
    if (!incomingSecret || incomingSecret !== config.telegramWebhookSecret) {
      return reply.status(401).send({ ok: false, error: 'Token de webhook invalido' });
    }
  }

  try {
    const payload = (req.body || {}) as TelegramWebhookUpdate;
    await processTelegramWebhookUpdate(payload);
    return reply.status(200).send({ ok: true });
  } catch (error: any) {
    req.log.error(
      {
        error: error?.message || String(error),
      },
      'Error procesando webhook de Telegram'
    );
    return reply.status(200).send({ ok: true });
  }
}
