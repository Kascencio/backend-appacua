import { prisma } from '../repositories/prisma.js';

export type TelegramConversationState = 'inicio' | 'esperando_email' | 'vinculado';

export async function getConversationState(chatId: string): Promise<TelegramConversationState> {
  const state = await prisma.telegram_conversacion_estado.findUnique({
    where: { chat_id: chatId },
    select: { estado: true },
  });
  
  return (state?.estado as TelegramConversationState) || 'inicio';
}

export async function updateConversationState(
  chatId: string, 
  newState: TelegramConversationState
): Promise<void> {
  await prisma.telegram_conversacion_estado.upsert({
    where: { chat_id: chatId },
    update: { 
      estado: newState,
      ultima_interaccion: new Date()
    },
    create: {
      chat_id: chatId,
      estado: newState,
    },
  });
}

export async function clearConversationState(chatId: string): Promise<void> {
  try {
    await prisma.telegram_conversacion_estado.delete({
      where: { chat_id: chatId },
    });
  } catch (error: any) {
    // Si no existe, no hacemos nada
    if (error.code !== 'P2025') {
      throw error;
    }
  }
}
