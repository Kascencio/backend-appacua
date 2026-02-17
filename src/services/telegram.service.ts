import { config } from '../config/index.js';

export type TelegramSendResult = {
  ok: boolean;
  error?: string;
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

export async function sendTelegramMessage(message: string, chatId?: string): Promise<TelegramSendResult> {
  if (!config.telegramEnabled) {
    return { ok: false, error: 'Telegram deshabilitado' };
  }

  const token = config.telegramBotToken;
  const targetChatId = chatId || config.telegramChatId;

  if (!token || !targetChatId) {
    return { ok: false, error: 'TELEGRAM_BOT_TOKEN o TELEGRAM_CHAT_ID no configurados' };
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: targetChatId,
        text: message,
        parse_mode: 'MarkdownV2',
        disable_web_page_preview: true,
      }),
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

export async function sendAlertToTelegram(payload: TelegramAlertPayload): Promise<TelegramSendResult> {
  const message = buildTelegramAlertMessage(payload);
  return sendTelegramMessage(message);
}
