import { prisma } from '../repositories/prisma.js';
import { sendTelegramMessage } from './telegram.service.js';
import { getConversationState, updateConversationState, clearConversationState } from './telegram-state.service.js';

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
const COMMAND_START = '/start';
const COMMAND_STATUS = '/status';
const COMMAND_UNLINK = '/unlink';
const COMMAND_HELP = '/help';
const COMMAND_SWITCH = '/switchlink';

async function sendPlainTelegramMessage(message: string, chatId: string): Promise<void> {
  await sendTelegramMessage(message, chatId, { parseMode: null });
}

async function handleCommandStart(targetChatId: string, isLinked: boolean) {
  if (isLinked) {
    // Permite re-vinculación aunque el chat ya esté vinculado
    await updateConversationState(targetChatId, 'esperando_email');
    await sendPlainTelegramMessage(
      'Tienes una cuenta vinculada. Si deseas vincular este chat a otra cuenta, envía el nuevo correo electrónico ahora.\n' +
      'Para mantener la vinculación actual usa /status.\n' +
      'Para desvincular usa /unlink.',
      targetChatId
    );
    return;
  }

  await updateConversationState(targetChatId, 'esperando_email');
  await sendPlainTelegramMessage(
    'Hola, para vincular tu cuenta y recibir alertas, envíame el correo con el que inicias sesión en la plataforma.\n' +
    'Un mismo correo puede tener múltiples chats vinculados.\n' +
    'Un chat solo puede estar vinculado a un correo a la vez.',
    targetChatId
  );
}

async function handleCommandStatus(targetChatId: string) {
  const suscripcion = await prisma.telegram_suscripcion.findUnique({
    where: { chat_id: targetChatId },
    include: { usuario: true }
  });

  if (suscripcion && suscripcion.activo && suscripcion.usuario.estado === 'activo') {
    // Contar cuántos chats tiene ese usuario
    const totalChats = await prisma.telegram_suscripcion.count({
      where: { id_usuario: suscripcion.id_usuario, activo: true }
    });
    await sendPlainTelegramMessage(
      `✅ Vinculado a: ${suscripcion.usuario.correo} (${suscripcion.usuario.nombre_completo})\n` +
      `📱 Chats activos con esta cuenta: ${totalChats}\n` +
      `🔔 Recibes alertas activamente.\n\n` +
      `Usa /switchlink para cambiar a otro correo o /unlink para desvincular este chat.`,
      targetChatId
    );
  } else {
    await sendPlainTelegramMessage(
      'No tienes ninguna cuenta vinculada o tu cuenta está inactiva.\nUsa /start para iniciar el proceso de vinculación.',
      targetChatId
    );
  }
}

async function handleCommandUnlink(targetChatId: string) {
  await clearConversationState(targetChatId);
  try {
    const deleted = await prisma.telegram_suscripcion.delete({
      where: { chat_id: targetChatId }
    });
    await sendPlainTelegramMessage(
      `✅ Este chat ha sido desvinculado de la cuenta ${deleted.id_usuario}.\n` +
      `Ya no recibirás notificaciones en este chat.\n` +
      `Usa /start para volver a vincular cuando quieras.`,
      targetChatId
    );
  } catch (error: any) {
    if (error.code === 'P2025') {
      await sendPlainTelegramMessage('No tienes ninguna cuenta vinculada actualmente.', targetChatId);
    } else {
      await sendPlainTelegramMessage('Hubo un error al intentar desvincular tu cuenta.', targetChatId);
    }
  }
}

async function handleCommandHelp(targetChatId: string) {
  await sendPlainTelegramMessage(
    'Comandos disponibles:\n' +
    '/start - Vincular este chat a una cuenta\n' +
    '/status - Ver estado actual de la vinculación\n' +
    '/unlink - Desvincular este chat\n' +
    '/switchlink - Cambiar a otro correo\n' +
    '/help - Mostrar este mensaje\n\n' +
    'ℹ️ Un correo puede vincularse a múltiples chats.\n' +
    'Un chat solo puede estar vinculado a un correo a la vez.',
    targetChatId
  );
}

async function handleCommandSwitchLink(targetChatId: string) {
  await updateConversationState(targetChatId, 'esperando_email');
  await sendPlainTelegramMessage(
    'Envía el correo electrónico al que deseas vincular este chat.\n' +
    'La vinculación anterior de este chat será reemplazada.',
    targetChatId
  );
}

async function handleEmailInput(rawText: string, targetChatId: string, message: TelegramMessage | undefined) {
  const email = rawText.trim().toLowerCase();

  if (!EMAIL_REGEX.test(email)) {
    await sendPlainTelegramMessage('Por favor, envía un correo electrónico válido o usa /start para reiniciar.', targetChatId);
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
    await sendPlainTelegramMessage(
      'El correo no está autorizado o está inactivo.\n' +
      'Verifica que el correo exista en la plataforma e intenta nuevamente.\n' +
      'Puedes intentar con otro correo o usar /help.',
      targetChatId
    );
    return;
  }

  try {
    // upsert: si este chat ya existe lo reasigna al nuevo usuario; si no, lo crea.
    // Esto permite que UN CHAT cambie de usuario (re-vinculación),
    // y que UN USUARIO tenga MÚLTIPLES chats (no se borran los otros chats del usuario).
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

    await updateConversationState(targetChatId, 'vinculado');

    // Contar cuántos chats tiene el usuario ahora
    const totalChats = await prisma.telegram_suscripcion.count({
      where: { id_usuario: usuario.id_usuario, activo: true }
    });

    await sendPlainTelegramMessage(
      `✅ ¡Vinculación exitosa!\n` +
      `Bienvenido, ${usuario.nombre_completo}.\n` +
      `Este chat ahora recibe alertas de tu cuenta.\n` +
      `📱 Total de chats vinculados a tu cuenta: ${totalChats}\n\n` +
      `Usa /help para ver los comandos disponibles.`,
      targetChatId
    );
  } catch (error) {
    await sendPlainTelegramMessage('No fue posible activar tus notificaciones. Intenta nuevamente en unos minutos.', targetChatId);
  }
}

export async function processTelegramWebhookUpdate(update: TelegramWebhookUpdate): Promise<void> {
  const message = update.message ?? update.edited_message;
  const chatId = message?.chat?.id;
  const rawText = String(message?.text ?? '').trim();

  if (!chatId || !rawText) {
    return;
  }

  const targetChatId = String(chatId);
  const isCommand = rawText.startsWith('/');
  const baseCommand = rawText.split(' ')[0].toLowerCase().split('@')[0];

  const suscripcion = await prisma.telegram_suscripcion.findUnique({
    where: { chat_id: targetChatId }
  });
  const isLinked = !!suscripcion;

  if (isCommand) {
    switch (baseCommand) {
      case COMMAND_START:
        await handleCommandStart(targetChatId, isLinked);
        return;
      case COMMAND_STATUS:
        await handleCommandStatus(targetChatId);
        return;
      case COMMAND_UNLINK:
        await handleCommandUnlink(targetChatId);
        return;
      case COMMAND_SWITCH:
        await handleCommandSwitchLink(targetChatId);
        return;
      case COMMAND_HELP:
        await handleCommandHelp(targetChatId);
        return;
      default:
        await sendPlainTelegramMessage('Comando no reconocido. Usa /help para ver las opciones disponibles.', targetChatId);
        return;
    }
  }

  // Flujo state machine para texto plano
  const state = await getConversationState(targetChatId);

  if (state === 'esperando_email') {
    await handleEmailInput(rawText, targetChatId, message);
  } else if (isLinked) {
    await sendPlainTelegramMessage('Tu cuenta ya está vinculada. Usa /help para ver los comandos disponibles.', targetChatId);
  } else {
    await sendPlainTelegramMessage('Usa /start para iniciar el proceso de vinculación.', targetChatId);
  }
}

