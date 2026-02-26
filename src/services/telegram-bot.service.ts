import { prisma } from '../repositories/prisma.js';
import { sendTelegramMessage } from './telegram.service.js';

type TelegramChat = {
  id: number;
};

type TelegramUser = {
  username?: string;
  first_name?: string;
};

type TelegramMessage = {
  chat?: TelegramChat;
  from?: TelegramUser;
  text?: string;
};

export type TelegramWebhookUpdate = {
  update_id?: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const START_COMMAND_REGEX = /^\/start(?:@\w+)?(?:\s|$)/i;

function isValidEmail(email: string): boolean {
  return EMAIL_REGEX.test(email);
}

function extractEmail(text: string): string | null {
  const normalized = text.trim().toLowerCase();
  if (!normalized) return null;

  if (isValidEmail(normalized)) {
    return normalized;
  }

  const match = normalized.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
  if (!match) return null;

  const candidate = match[0].toLowerCase();
  return isValidEmail(candidate) ? candidate : null;
}

async function sendPlainTelegramMessage(message: string, chatId: string): Promise<void> {
  await sendTelegramMessage(message, chatId, { parseMode: null });
}

function buildStartMessage(): string {
  return [
    'Bienvenido a App Acua.',
    'Inicia tu usuario enviando tu correo registrado en la plataforma.',
  ].join('\n');
}

function buildEmailRejectedMessage(): string {
  return [
    'El correo no esta autorizado en App Acua.',
    'Verifica que el correo exista en la base de datos e intenta nuevamente.',
  ].join('\n');
}

function buildEmailFormatMessage(): string {
  return 'Envia un correo valido para iniciar tu usuario en App Acua.';
}

function buildLoginSuccessMessage(userName: string): string {
  return [
    `Usuario logeado, bienvenido ${userName}.`,
    'Desde ahora empezaras a recibir notificaciones por Telegram.',
  ].join('\n');
}

function buildSubscriptionErrorMessage(): string {
  return 'No fue posible activar tus notificaciones en este momento. Intenta nuevamente en unos minutos.';
}

export async function processTelegramWebhookUpdate(update: TelegramWebhookUpdate): Promise<void> {
  const message = update.message ?? update.edited_message;
  const chatId = message?.chat?.id;
  const rawText = String(message?.text ?? '').trim();

  if (!chatId || !rawText) {
    return;
  }

  const targetChatId = String(chatId);

  if (START_COMMAND_REGEX.test(rawText)) {
    await sendPlainTelegramMessage(buildStartMessage(), targetChatId);
    return;
  }

  const email = extractEmail(rawText);
  if (!email) {
    await sendPlainTelegramMessage(buildEmailFormatMessage(), targetChatId);
    return;
  }

  const usuario = await prisma.usuario.findFirst({
    where: {
      correo: email,
      estado: 'activo',
    },
    select: {
      id_usuario: true,
      nombre_completo: true,
    },
  });

  if (!usuario) {
    await sendPlainTelegramMessage(buildEmailRejectedMessage(), targetChatId);
    return;
  }

  try {
    await prisma.telegram_suscripcion.upsert({
      where: {
        chat_id: targetChatId,
      },
      update: {
        id_usuario: usuario.id_usuario,
        username: message?.from?.username ?? null,
        first_name: message?.from?.first_name ?? null,
        activo: true,
        ultima_verificacion: new Date(),
      },
      create: {
        id_usuario: usuario.id_usuario,
        chat_id: targetChatId,
        username: message?.from?.username ?? null,
        first_name: message?.from?.first_name ?? null,
        activo: true,
      },
    });
  } catch {
    await sendPlainTelegramMessage(buildSubscriptionErrorMessage(), targetChatId);
    return;
  }

  await sendPlainTelegramMessage(buildLoginSuccessMessage(usuario.nombre_completo), targetChatId);
}
