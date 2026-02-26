import type { FastifyInstance } from 'fastify';
import { telegramWebhook } from '../controllers/telegram.controller.js';

export async function registerTelegramRoutes(app: FastifyInstance) {
  app.post('/api/telegram/webhook', telegramWebhook);
}
