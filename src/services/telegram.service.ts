import { config } from '../config/index.js';
import { prisma } from '../repositories/prisma.js';

export type TelegramSendResult = {
  ok: boolean;
  error?: string;
  attempted?: number;
  delivered?: number;
};

export type TelegramSendOptions = {
  parseMode?: 'MarkdownV2' | 'HTML' | null;
};

export type TelegramAlertPayload = {
  id_alertas: number;
  descripcion: string;
  dato_puntual: number;
  instalacion?: {
    id_instalacion: number;
    nombre_instalacion: string;
  };
  sensor?: {
    id_sensor_instalado: number;
    nombre?: string;
    unidad_medida?: string;
  };
};

function escapeMarkdown(text: string): string {
  return text.replace(/([_\-*\[\]()~`>#+=|{}.!])/g, '\\$1');
}

function uniqueChatIds(chatIds: string[]): string[] {
  const values = chatIds
    .map((chatId) => String(chatId || '').trim())
    .filter((chatId) => chatId.length > 0);

  return [...new Set(values)];
}

function buildSendMessageBody(message: string, chatId: string, options?: TelegramSendOptions): Record<string, unknown> {
  const body: Record<string, unknown> = {
    chat_id: chatId,
    text: message,
    disable_web_page_preview: true,
  };

  const parseMode = options?.parseMode === undefined ? 'MarkdownV2' : options.parseMode;
  if (parseMode) {
    body.parse_mode = parseMode;
  }

  return body;
}

export function buildTelegramAlertMessage(payload: TelegramAlertPayload): string {
  const instalacion = payload.instalacion?.nombre_instalacion
    ? `Instalacion: ${payload.instalacion.nombre_instalacion}`
    : 'Instalacion: N/A';

  const sensorName = payload.sensor?.nombre ?? 'Sensor';
  const unidad = payload.sensor?.unidad_medida ? ` ${payload.sensor.unidad_medida}` : '';

  return [
    '*Alerta AquaMonitor*',
    `ID: ${payload.id_alertas}`,
    `${instalacion}`,
    `Sensor: ${escapeMarkdown(sensorName)}`,
    `Valor: ${payload.dato_puntual}${escapeMarkdown(unidad)}`,
    `Detalle: ${escapeMarkdown(payload.descripcion)}`,
  ].join('\n');
}

async function sendTelegramMessageToChat(
  message: string,
  chatId: string,
  options?: TelegramSendOptions
): Promise<TelegramSendResult> {
  const token = config.telegramBotToken;
  if (!token) {
    return { ok: false, error: 'TELEGRAM_BOT_TOKEN no configurado' };
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildSendMessageBody(message, chatId, options)),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok || data?.ok === false) {
      return {
        ok: false,
        error: data?.description || `HTTP ${response.status}`,
      };
    }

    return { ok: true };
  } catch (error: any) {
    return {
      ok: false,
      error: error?.message || 'Error enviando mensaje a Telegram',
    };
  }
}

async function resolveChatIdsForInstalacion(idInstalacion: number): Promise<string[]> {
  const configuredChatIds = config.telegramChatId ? [config.telegramChatId] : [];

  try {
    // 1. Encontrar la sucursal a la que pertenece esta instalación
    const instalacion = await prisma.instalacion.findUnique({
      where: { id_instalacion: idInstalacion },
      select: { id_organizacion_sucursal: true },
    });

    if (!instalacion) {
      return uniqueChatIds(configuredChatIds);
    }

    const idSucursal = instalacion.id_organizacion_sucursal;

    // 2. Buscar usuarios con suscripción activa de telegram Y estado activo
    const suscripcionesActivas = await prisma.telegram_suscripcion.findMany({
      where: {
        activo: true,
        usuario: { estado: 'activo' },
      },
      include: {
        usuario: {
          include: {
            tipo_rol: true,
            asignacion_usuario: {
              where: {
                OR: [
                  { id_instalacion: idInstalacion },
                  { id_organizacion_sucursal: idSucursal, id_instalacion: null }
                ]
              }
            }
          }
        }
      }
    });

    // 3. Filtrar los usuarios que tienen acceso
    const authorizedChatIds = suscripcionesActivas
      .filter(sub => {
        const isSuperAdmin = sub.usuario.tipo_rol?.nombre?.toLowerCase() === 'superadmin';
        const hasAssignment = sub.usuario.asignacion_usuario.length > 0;
        return isSuperAdmin || hasAssignment;
      })
      .map(sub => sub.chat_id);

    return uniqueChatIds([
      ...configuredChatIds,
      ...authorizedChatIds,
    ]);
  } catch (error) {
    console.error('Error resolviendo destinatarios para instalacion', idInstalacion, error);
    return uniqueChatIds(configuredChatIds);
  }
}

export async function sendTelegramMessage(
  message: string,
  chatId?: string,
  options?: TelegramSendOptions
): Promise<TelegramSendResult> {
  if (!config.telegramEnabled) {
    return { ok: false, error: 'Telegram deshabilitado' };
  }

  const targetChatId = chatId || config.telegramChatId;

  if (!targetChatId) {
    return { ok: false, error: 'TELEGRAM_BOT_TOKEN o TELEGRAM_CHAT_ID no configurados' };
  }

  return sendTelegramMessageToChat(message, targetChatId, options);
}

export async function sendTelegramBroadcastMessage(
  message: string,
  chatIds: string[],
  options?: TelegramSendOptions
): Promise<TelegramSendResult> {
  if (!config.telegramEnabled) {
    return { ok: false, error: 'Telegram deshabilitado' };
  }

  const targetChatIds = uniqueChatIds(chatIds);
  if (targetChatIds.length === 0) {
    return { ok: false, error: 'No hay chats de Telegram verificados para enviar notificaciones' };
  }

  const results = await Promise.all(
    targetChatIds.map((targetChatId) => sendTelegramMessageToChat(message, targetChatId, options))
  );

  const delivered = results.filter((result) => result.ok).length;
  const attempted = targetChatIds.length;

  if (delivered === 0) {
    const firstError = results.find((result) => result.error)?.error;
    return {
      ok: false,
      error: firstError || 'No se pudo enviar el mensaje a ningún chat de Telegram',
      attempted,
      delivered,
    };
  }

  if (delivered < attempted) {
    return {
      ok: true,
      error: `Entrega parcial en Telegram (${delivered}/${attempted})`,
      attempted,
      delivered,
    };
  }

  return { ok: true, attempted, delivered };
}

export async function sendTelegramAlertToAuthorizedUsers(
  id_instalacion: number,
  payload: TelegramAlertPayload
): Promise<TelegramSendResult> {
  const message = buildTelegramAlertMessage(payload);
  try {
    const chatIds = await resolveChatIdsForInstalacion(id_instalacion);
    return sendTelegramBroadcastMessage(message, chatIds, { parseMode: 'MarkdownV2' });
  } catch (error: any) {
    return {
      ok: false,
      error: error?.message || 'Error resolviendo destinatarios de Telegram',
    };
  }
}
