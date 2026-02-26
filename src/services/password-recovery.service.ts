import { sendTelegramMessage } from './telegram.service.js';

type DeliveryParams = {
  email: string;
  userName?: string;
  token?: string;
  resetUrl?: string;
};

export type RecoveryDeliveryResult = {
  ok: boolean;
  channel: 'email' | 'telegram' | 'none';
  error?: string;
};

function normalizeEnv(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith('\'') && trimmed.endsWith('\''))
  ) {
    const inner = trimmed.slice(1, -1).trim();
    return inner || undefined;
  }

  return trimmed;
}

function getBaseUrl(): string {
  return (
    normalizeEnv(process.env.NEXT_PUBLIC_APP_URL) ||
    normalizeEnv(process.env.NEXT_PUBLIC_BASE_URL) ||
    normalizeEnv(process.env.APP_URL) ||
    'http://localhost:3000'
  );
}

function buildResetUrl(token?: string, explicitResetUrl?: string): string {
  if (explicitResetUrl && explicitResetUrl.trim()) return explicitResetUrl.trim();
  if (!token) return `${getBaseUrl()}/forgot-password`;
  return `${getBaseUrl()}/reset-password?token=${encodeURIComponent(token)}`;
}

function buildRecoveryEmailHtml(userName: string | undefined, resetUrl: string): string {
  return `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#0f172a">
      <h2 style="margin-bottom:8px">Recuperacion de contrasena</h2>
      <p>Hola${userName ? ` ${userName}` : ''},</p>
      <p>Recibimos una solicitud para restablecer tu contrasena.</p>
      <p>
        <a href="${resetUrl}" style="display:inline-block;padding:10px 16px;background:#0284c7;color:#fff;text-decoration:none;border-radius:6px">
          Restablecer contrasena
        </a>
      </p>
      <p>Si no solicitaste este cambio, ignora este mensaje.</p>
      <p style="font-size:12px;color:#64748b">Enlace: ${resetUrl}</p>
    </div>
  `;
}

async function sendByResend(params: DeliveryParams, resetUrl: string): Promise<RecoveryDeliveryResult> {
  const resendApiKey = normalizeEnv(process.env.RESEND_API_KEY);
  if (!resendApiKey) {
    return { ok: false, channel: 'none', error: 'RESEND_API_KEY no configurado' };
  }

  const from =
    normalizeEnv(process.env.EMAIL_FROM) ||
    normalizeEnv(process.env.RESEND_FROM) ||
    'AQUA <noreply@aquamonitor.local>';

  const payload = {
    from,
    to: [params.email],
    subject: 'Restablecer contrasena - AQUA',
    html: buildRecoveryEmailHtml(params.userName, resetUrl),
    text: `Hola${params.userName ? ` ${params.userName}` : ''}, restablece tu contrasena en: ${resetUrl}`,
  };

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      return {
        ok: false,
        channel: 'none',
        error: String(data?.message || data?.error || `HTTP ${response.status}`),
      };
    }

    return { ok: true, channel: 'email' };
  } catch (error: any) {
    return { ok: false, channel: 'none', error: String(error?.message || 'Error enviando con Resend') };
  }
}

function escapeMarkdownV2(text: string): string {
  return text.replace(/([_*\[\]()~`>#+\-=|{}.!])/g, '\\$1');
}

async function sendByTelegram(
  params: DeliveryParams,
  resetUrl: string,
  fallbackReason?: string
): Promise<RecoveryDeliveryResult> {
  const messageLines = [
    '*Recuperacion de contrasena*',
    `Usuario: ${escapeMarkdownV2(params.email)}`,
    params.userName ? `Nombre: ${escapeMarkdownV2(params.userName)}` : '',
    `Enlace: ${escapeMarkdownV2(resetUrl)}`,
    fallbackReason ? `_Fallback a Telegram: ${escapeMarkdownV2(fallbackReason)}_` : '',
  ].filter(Boolean);

  const result = await sendTelegramMessage(messageLines.join('\n'));
  if (!result.ok) {
    return { ok: false, channel: 'none', error: result.error || 'No se pudo enviar por Telegram' };
  }

  return { ok: true, channel: 'telegram' };
}

export async function sendPasswordRecoveryInstructions(params: DeliveryParams): Promise<RecoveryDeliveryResult> {
  const resetUrl = buildResetUrl(params.token, params.resetUrl);
  const emailResult = await sendByResend(params, resetUrl);

  if (emailResult.ok) {
    return emailResult;
  }

  return sendByTelegram(params, resetUrl, emailResult.error);
}

