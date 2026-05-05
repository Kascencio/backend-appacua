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

async function sendPlainTelegramMessage(message: string, chatId: string): Promise<void> {
  await sendTelegramMessage(message, chatId, { parseMode: null });
}

async function handleCommandStart(targetChatId: string, isLinked: boolean) {
  if (isLinked) {
    await sendPlainTelegramMessage('Ya tienes una cuenta vinculada a este chat. Usa /status para ver los detalles o /unlink para desvincularla.', targetChatId);
    return;
  }
  
  await updateConversationState(targetChatId, 'esperando_email');
  await sendPlainTelegramMessage(
    'Hola, para vincular tu cuenta y recibir alertas, envíame el correo con el que inicias sesión en la plataforma.',
    targetChatId
  );
}

async function handleCommandStatus(targetChatId: string) {
  const suscripcion = await prisma.telegram_suscripcion.findUnique({
    where: { chat_id: targetChatId },
    include: { usuario: true }
  });

  if (suscripcion && suscripcion.activo && suscripcion.usuario.estado === 'activo') {
    await sendPlainTelegramMessage(
      `Estás vinculado a la cuenta: ${suscripcion.usuario.correo} (${suscripcion.usuario.nombre_completo}). Estás recibiendo alertas activamente.`,
      targetChatId
    );
  } else {
    await sendPlainTelegramMessage(
      'No tienes ninguna cuenta vinculada o tu cuenta está inactiva. Usa /start para iniciar el proceso de vinculación.',
      targetChatId
    );
  }
}

async function handleCommandUnlink(targetChatId: string) {
  await clearConversationState(targetChatId);
  try {
    await prisma.telegram_suscripcion.delete({
      where: { chat_id: targetChatId }
    });
    await sendPlainTelegramMessage('Tu cuenta ha sido desvinculada exitosamente. Ya no recibirás notificaciones.', targetChatId);
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
    '/start - Iniciar vinculación de cuenta\n' +
    '/status - Ver estado actual de tu vinculación\n' +
    '/unlink - Desvincular tu cuenta\n' +
    '/help - Mostrar este mensaje de ayuda',
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
    await sendPlainTelegramMessage('El correo no está autorizado o está inactivo. Verifica que el correo exista e intenta nuevamente.', targetChatId);
    return;
  }

  try {
    // Desvincular este usuario de cualquier otro chat para mantener 1 a 1 (opcional pero más limpio)
    await prisma.telegram_suscripcion.deleteMany({
      where: { id_usuario: usuario.id_usuario }
    });

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

    await sendPlainTelegramMessage(
      `¡Vinculación exitosa!\nTu cuenta ha sido vinculada, bienvenido ${usuario.nombre_completo}.\nAhora recibirás alertas únicamente de las instalaciones a las que tienes acceso.\nUsa /help para ver comandos.`,
      targetChatId
    );
  } catch (error) {
    await sendPlainTelegramMessage('No fue posible activar tus notificaciones en este momento. Intenta nuevamente en unos minutos.', targetChatId);
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
  const baseCommand = rawText.split(' ')[0].toLowerCase().split('@')[0]; // Maneja /start@BotName

  // Comprobar si ya esta vinculado
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
      case COMMAND_HELP:
        await handleCommandHelp(targetChatId);
        return;
      default:
        await sendPlainTelegramMessage('Comando no reconocido. Usa /help para ver las opciones disponibles.', targetChatId);
        return;
    }
  }

  // Flujo state machine para texto plano
  if (!isLinked) {
    const state = await getConversationState(targetChatId);
    if (state === 'esperando_email') {
      await handleEmailInput(rawText, targetChatId, message);
    } else {
      await sendPlainTelegramMessage('Por favor, envía /start para iniciar el proceso de vinculación.', targetChatId);
    }
  } else {
    // Ya esta vinculado y envía texto que no es comando
    await sendPlainTelegramMessage('Tu cuenta ya está vinculada. Usa /help para ver los comandos disponibles.', targetChatId);
  }
}
