import os from 'node:os';
import { readFileSync } from 'node:fs';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../config/index.js';
import { prisma } from '../repositories/prisma.js';
import { getLecturaAggregatesDiagnostics } from '../services/lectura-aggregates.service.js';
import { getLecturasPollerDiagnostics } from '../services/lecturas.poller.js';
import { getWsDiagnostics } from '../services/ws.lecturas.server.js';

type ApiModuleCatalog = {
  name: string;
  kind: 'http' | 'websocket';
  description: string;
  basePaths: string[];
  routes: string[];
};

const SERVER_STARTED_AT = new Date();
const PACKAGE_INFO = loadPackageInfo();
const HTTP_COMPRESSION_ENABLED = String(process.env.HTTP_COMPRESSION_ENABLED ?? 'false').toLowerCase() === 'true';

const API_MODULES: ApiModuleCatalog[] = [
  {
    name: 'health',
    kind: 'http',
    description: 'Monitoreo, disponibilidad y estado del servicio.',
    basePaths: ['/health', '/api/health'],
    routes: ['GET /health', 'GET /api/health'],
  },
  {
    name: 'lecturas',
    kind: 'http',
    description: 'Lecturas, promedios, reportes XML y agregaciones.',
    basePaths: [
      '/api/lecturas',
      '/api/lecturas/proceso',
      '/api/lecturas-por-proceso',
      '/api/resumen-horario',
      '/api/promedios',
      '/api/promedios-batch',
      '/api/reportes/xml',
    ],
    routes: [
      'POST /api/lecturas',
      'GET /api/lecturas',
      'GET /api/lecturas/proceso',
      'GET /api/lecturas-por-proceso',
      'GET /api/resumen-horario',
      'GET /api/promedios',
      'GET /api/promedios-batch',
      'GET /api/reportes/xml',
    ],
  },
  {
    name: 'organizaciones',
    kind: 'http',
    description: 'Organizaciones y sucursales.',
    basePaths: ['/api/organizaciones', '/api/sucursales'],
    routes: [
      'POST /api/organizaciones',
      'GET /api/organizaciones',
      'GET /api/organizaciones/:id',
      'PUT /api/organizaciones/:id',
      'DELETE /api/organizaciones/:id',
      'POST /api/sucursales',
      'GET /api/sucursales',
      'GET /api/sucursales/:id',
      'PUT /api/sucursales/:id',
      'DELETE /api/sucursales/:id',
    ],
  },
  {
    name: 'instalaciones',
    kind: 'http',
    description: 'Instalaciones, catalogo de sensores y sensores instalados.',
    basePaths: ['/api/instalaciones', '/api/catalogo-sensores', '/api/sensores-instalados'],
    routes: [
      'POST /api/instalaciones',
      'GET /api/instalaciones',
      'GET /api/instalaciones/:id',
      'PUT /api/instalaciones/:id',
      'DELETE /api/instalaciones/:id',
      'POST /api/catalogo-sensores',
      'GET /api/catalogo-sensores',
      'GET /api/catalogo-sensores/:id',
      'PUT /api/catalogo-sensores/:id',
      'DELETE /api/catalogo-sensores/:id',
      'POST /api/sensores-instalados',
      'GET /api/sensores-instalados',
      'GET /api/sensores-instalados/:id',
      'PUT /api/sensores-instalados/:id',
      'DELETE /api/sensores-instalados/:id',
    ],
  },
  {
    name: 'usuarios-y-auth',
    kind: 'http',
    description: 'Autenticacion, usuarios, roles, asignaciones, alertas y parametros.',
    basePaths: [
      '/api/login',
      '/api/auth',
      '/api/usuarios',
      '/api/tipos-rol',
      '/api/roles',
      '/api/asignacion-usuario',
      '/api/alertas',
      '/api/parametros',
    ],
    routes: [
      'POST /api/login',
      'POST /api/auth/login',
      'POST /api/auth/register',
      'POST /api/auth/refresh',
      'POST /api/auth/forgot-password',
      'POST /api/auth/reset-password',
      'GET /api/auth/me',
      'POST /api/auth/logout',
      'POST /api/usuarios',
      'GET /api/usuarios',
      'GET /api/usuarios/:id',
      'PUT /api/usuarios/:id',
      'DELETE /api/usuarios/:id',
      'POST /api/tipos-rol',
      'GET /api/tipos-rol',
      'GET /api/tipos-rol/:id',
      'PUT /api/tipos-rol/:id',
      'DELETE /api/tipos-rol/:id',
      'POST /api/roles',
      'GET /api/roles',
      'GET /api/roles/:id',
      'PUT /api/roles/:id',
      'DELETE /api/roles/:id',
      'POST /api/asignacion-usuario',
      'GET /api/asignacion-usuario',
      'GET /api/asignacion-usuario/:id',
      'DELETE /api/asignacion-usuario/:id',
      'POST /api/alertas',
      'GET /api/alertas',
      'PUT /api/alertas/read-all',
      'PATCH /api/alertas/read-all',
      'POST /api/alertas/delete-all',
      'PUT /api/alertas/:id/read',
      'PATCH /api/alertas/:id/read',
      'GET /api/alertas/:id',
      'PUT /api/alertas/:id',
      'DELETE /api/alertas/:id',
      'POST /api/parametros',
      'GET /api/parametros',
      'GET /api/parametros/:id',
      'PUT /api/parametros/:id',
      'DELETE /api/parametros/:id',
    ],
  },
  {
    name: 'especies-y-procesos',
    kind: 'http',
    description: 'Catalogo de especies, parametros de especie, procesos y crecimiento del ostion.',
    basePaths: [
      '/api/catalogo-especies',
      '/api/especies',
      '/api/especies-parametros',
      '/api/especie-parametros',
      '/api/procesos',
    ],
    routes: [
      'POST /api/catalogo-especies',
      'GET /api/catalogo-especies',
      'GET /api/catalogo-especies/:id',
      'PUT /api/catalogo-especies/:id',
      'DELETE /api/catalogo-especies/:id',
      'POST /api/especies',
      'GET /api/especies',
      'GET /api/especies/:id',
      'PUT /api/especies/:id',
      'DELETE /api/especies/:id',
      'POST /api/especies-parametros',
      'GET /api/especies-parametros',
      'GET /api/especies-parametros/:id',
      'PUT /api/especies-parametros/:id',
      'DELETE /api/especies-parametros/:id',
      'POST /api/especie-parametros',
      'GET /api/especie-parametros',
      'GET /api/especie-parametros/:id',
      'PUT /api/especie-parametros/:id',
      'DELETE /api/especie-parametros/:id',
      'POST /api/procesos',
      'GET /api/procesos',
      'GET /api/procesos/:id',
      'PUT /api/procesos/:id',
      'DELETE /api/procesos/:id',
      'GET /api/procesos/:id/crecimiento-ostion',
      'PUT /api/procesos/:id/crecimiento-ostion',
      'POST /api/procesos/:id/crecimiento-ostion/capturas',
      'PUT /api/procesos/:id/crecimiento-ostion/capturas/:capturaId',
      'POST /api/procesos/:id/crecimiento-ostion/capturas/:capturaId/mediciones',
    ],
  },
  {
    name: 'telegram',
    kind: 'http',
    description: 'Webhook de Telegram e integracion de mensajeria.',
    basePaths: ['/api/telegram/webhook'],
    routes: ['POST /api/telegram/webhook'],
  },
  {
    name: 'realtime',
    kind: 'websocket',
    description: 'Canales websocket para lecturas y notificaciones.',
    basePaths: ['/ws/lecturas', '/ws/notificaciones'],
    routes: ['WS /ws/lecturas', 'WS /ws/notificaciones'],
  },
];

function loadPackageInfo(): { name: string; version: string } {
  try {
    const raw = readFileSync(new URL('../../package.json', import.meta.url), 'utf8');
    const parsed = JSON.parse(raw) as { name?: string; version?: string };
    return {
      name: parsed.name || 'aqua-backend-v2',
      version: parsed.version || 'unknown',
    };
  } catch {
    return {
      name: 'aqua-backend-v2',
      version: 'unknown',
    };
  }
}

function toRounded(value: number): number {
  return Number(value.toFixed(2));
}

function formatBytesToMb(value: number): number {
  return toRounded(value / 1024 / 1024);
}

function summarizeDatabaseUrl(databaseUrl: string) {
  try {
    const parsed = new URL(databaseUrl);
    return {
      provider: parsed.protocol.replace(':', '') || 'unknown',
      host: parsed.hostname || null,
      port: parsed.port ? Number(parsed.port) : null,
      database: parsed.pathname.replace(/^\//, '') || null,
      has_credentials: Boolean(parsed.username || parsed.password),
    };
  } catch {
    return {
      provider: 'unknown',
      host: null,
      port: null,
      database: null,
      has_credentials: false,
    };
  }
}

async function getDatabaseHealth() {
  const checkedAt = new Date();
  const connection = summarizeDatabaseUrl(config.databaseUrl);
  const startedAt = process.hrtime.bigint();

  try {
    const result = await prisma.$queryRaw<
      Array<{
        database_name: string | null;
        version: string | null;
        server_time_utc: Date | string | null;
      }>
    >`SELECT DATABASE() AS database_name, VERSION() AS version, UTC_TIMESTAMP() AS server_time_utc`;

    const latencyMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    const row = result[0] ?? null;
    const serverTimeUtc =
      row?.server_time_utc instanceof Date
        ? row.server_time_utc.toISOString()
        : row?.server_time_utc
          ? new Date(row.server_time_utc).toISOString()
          : null;

    return {
      status: 'connected' as const,
      connected: true,
      checked_at: checkedAt.toISOString(),
      latency_ms: toRounded(latencyMs),
      connection,
      database_name: row?.database_name ?? connection.database,
      version: row?.version ?? null,
      server_time_utc: serverTimeUtc,
    };
  } catch (error: any) {
    const latencyMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;

    return {
      status: 'disconnected' as const,
      connected: false,
      checked_at: checkedAt.toISOString(),
      latency_ms: toRounded(latencyMs),
      connection,
      database_name: connection.database,
      version: null,
      server_time_utc: null,
      error: error?.message || 'No se pudo consultar la base de datos',
    };
  }
}

function toIsoOrNull(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function buildTimestampFromParts(fecha: Date | null | undefined, hora: Date | null | undefined): string | null {
  if (!fecha || !hora) return null;
  const datePart = fecha.toISOString().slice(0, 10);
  const timePart = hora.toISOString().slice(11, 19);
  const combined = new Date(`${datePart}T${timePart}Z`);
  return Number.isNaN(combined.getTime()) ? null : combined.toISOString();
}

async function getOperationalSnapshot() {
  const startedAt = process.hrtime.bigint();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  try {
    const [
      organizacionesTotal,
      sucursalesTotal,
      instalacionesTotal,
      instalacionesActivas,
      procesosTotal,
      procesosActivos,
      especiesTotal,
      usuariosTotal,
      usuariosActivos,
      sensoresCatalogoTotal,
      sensoresInstaladosTotal,
      sensoresAsignadosTotal,
      lecturasTotal,
      lecturasHoy,
      alertasTotal,
      alertasNoLeidas,
      alertasHoy,
      promediosTotal,
      resumenHorarioTotal,
      telegramSuscripcionesActivas,
      latestLectura,
      latestAlerta,
      latestPromedio,
      latestResumen,
    ] = await Promise.all([
      prisma.organizacion.count(),
      prisma.organizacion_sucursal.count(),
      prisma.instalacion.count(),
      prisma.instalacion.count({ where: { estado_operativo: 'activo' } }),
      prisma.procesos.count(),
      prisma.procesos.count({ where: { estado: 'en_progreso' } }),
      prisma.especies.count(),
      prisma.usuario.count(),
      prisma.usuario.count({ where: { estado: 'activo' } }),
      prisma.catalogo_sensores.count(),
      prisma.sensor_instalado.count(),
      prisma.sensor_instalado.count({ where: { id_instalacion: { not: null } } }),
      prisma.lectura.count(),
      prisma.lectura.count({ where: { fecha: { gte: today } } }),
      prisma.alertas.count(),
      prisma.alertas.count({ where: { leida: false } }),
      prisma.alertas.count({ where: { fecha_alerta: { gte: today } } }),
      prisma.promedio.count(),
      prisma.resumen_lectura_horaria.count(),
      prisma.telegram_suscripcion.count({ where: { activo: true } }),
      prisma.lectura.findFirst({
        orderBy: [{ fecha: 'desc' }, { hora: 'desc' }, { id_lectura: 'desc' }],
        select: {
          id_lectura: true,
          id_sensor_instalado: true,
          valor: true,
          fecha: true,
          hora: true,
        },
      }),
      prisma.alertas.findFirst({
        orderBy: [{ fecha_alerta: 'desc' }, { id_alertas: 'desc' }],
        select: {
          id_alertas: true,
          id_instalacion: true,
          id_sensor_instalado: true,
          dato_puntual: true,
          leida: true,
          fecha_alerta: true,
        },
      }),
      prisma.promedio.findFirst({
        orderBy: [{ fecha: 'desc' }, { hora: 'desc' }, { pk_promedio: 'desc' }],
        select: {
          pk_promedio: true,
          id_sensor_instalado: true,
          promedio: true,
          fecha: true,
          hora: true,
        },
      }),
      prisma.resumen_lectura_horaria.findFirst({
        orderBy: [{ fecha: 'desc' }, { hora: 'desc' }, { id_resumen: 'desc' }],
        select: {
          id_resumen: true,
          id_sensor_instalado: true,
          promedio: true,
          registros: true,
          fecha: true,
          hora: true,
        },
      }),
    ]);

    return {
      status: 'ok' as const,
      checked_at: new Date().toISOString(),
      generated_in_ms: toRounded(Number(process.hrtime.bigint() - startedAt) / 1_000_000),
      counts: {
        organizaciones: organizacionesTotal,
        sucursales: sucursalesTotal,
        instalaciones: instalacionesTotal,
        instalaciones_activas: instalacionesActivas,
        procesos: procesosTotal,
        procesos_en_progreso: procesosActivos,
        especies: especiesTotal,
        usuarios: usuariosTotal,
        usuarios_activos: usuariosActivos,
        catalogo_sensores: sensoresCatalogoTotal,
        sensores_instalados: sensoresInstaladosTotal,
        sensores_asignados: sensoresAsignadosTotal,
        lecturas: lecturasTotal,
        lecturas_hoy: lecturasHoy,
        promedios_15min: promediosTotal,
        resumen_horario: resumenHorarioTotal,
        alertas: alertasTotal,
        alertas_no_leidas: alertasNoLeidas,
        alertas_hoy: alertasHoy,
        telegram_suscripciones_activas: telegramSuscripcionesActivas,
      },
      latest_activity: {
        lectura: latestLectura ? {
          id_lectura: latestLectura.id_lectura,
          id_sensor_instalado: latestLectura.id_sensor_instalado,
          valor: Number(latestLectura.valor),
          tomada_en: buildTimestampFromParts(latestLectura.fecha, latestLectura.hora),
        } : null,
        alerta: latestAlerta ? {
          id_alertas: latestAlerta.id_alertas,
          id_instalacion: latestAlerta.id_instalacion,
          id_sensor_instalado: latestAlerta.id_sensor_instalado,
          dato_puntual: Number(latestAlerta.dato_puntual),
          leida: Boolean(latestAlerta.leida),
          fecha_alerta: toIsoOrNull(latestAlerta.fecha_alerta),
        } : null,
        promedio_15min: latestPromedio ? {
          id_promedio: latestPromedio.pk_promedio,
          id_sensor_instalado: latestPromedio.id_sensor_instalado,
          promedio: Number(latestPromedio.promedio),
          timestamp: buildTimestampFromParts(latestPromedio.fecha, latestPromedio.hora),
        } : null,
        resumen_horario: latestResumen ? {
          id_resumen: latestResumen.id_resumen,
          id_sensor_instalado: latestResumen.id_sensor_instalado,
          promedio: Number(latestResumen.promedio),
          registros: latestResumen.registros,
          timestamp: buildTimestampFromParts(latestResumen.fecha, latestResumen.hora),
        } : null,
      },
    };
  } catch (error: any) {
    return {
      status: 'error' as const,
      checked_at: new Date().toISOString(),
      generated_in_ms: toRounded(Number(process.hrtime.bigint() - startedAt) / 1_000_000),
      error: error?.message || 'No se pudo construir el snapshot operativo',
    };
  }
}

function buildHealthWarnings(params: {
  databaseConnected: boolean;
  telemetrySubscriptions: number;
  pollerError: string | null;
  aggregatesError: string | null;
}) {
  const warnings: string[] = [];

  if (!params.databaseConnected) {
    warnings.push('Base de datos desconectada.');
  }

  if (config.telegramEnabled && config.env === 'production' && !config.telegramWebhookBaseUrl) {
    warnings.push('Telegram habilitado en produccion sin TELEGRAM_WEBHOOK_BASE_URL.');
  }

  if (config.telegramEnabled && !config.telegramChatId && params.telemetrySubscriptions === 0) {
    warnings.push('Telegram habilitado sin TELEGRAM_CHAT_ID ni suscripciones activas.');
  }

  if (!process.env.SENSOR_INGEST_API_KEY) {
    warnings.push('POST /api/lecturas sin SENSOR_INGEST_API_KEY configurada.');
  }

  if (params.pollerError) {
    warnings.push(`Lecturas poller reporta error: ${params.pollerError}`);
  }

  if (params.aggregatesError) {
    warnings.push(`Agregados de lecturas reportan error: ${params.aggregatesError}`);
  }

  return warnings;
}

function requestsHtml(request: FastifyRequest): boolean {
  const accept = String(request.headers.accept || '');
  if (!accept || accept === '*/*') return false;
  return accept.includes('text/html');
}

function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function statusColor(status: string): string {
  if (status === 'ok' || status === 'connected') return '#22c55e';
  if (status === 'warning') return '#f59e0b';
  return '#ef4444';
}

function statusEmoji(status: string): string {
  if (status === 'ok' || status === 'connected') return '✅';
  if (status === 'warning') return '⚠️';
  return '❌';
}

function renderHealthHtml(payload: Record<string, any>): string {
  const status = String(payload.status || 'unknown');
  const svc = payload.service || {};
  const srv = payload.server || {};
  const db = payload.database || {};
  const ops = payload.operations || {};
  const feat = payload.features || {};
  const integrations = payload.integrations || {};
  const sys = payload.system || {};
  const runtime = payload.runtime || {};
  const observability = payload.observability || {};
  const warnings: string[] = payload.warnings || [];
  const apis = payload.apis || {};

  const counts = ops.counts || {};
  const mem = sys.memory_mb || {};
  const hostInfo = runtime.host || {};
  const telegram = integrations.telegram || {};
  const ws = observability.websocket || {};
  const poller = observability.poller || {};
  const agg = observability.aggregates || {};

  const formatUptime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${h}h ${m}m ${s}s`;
  };

  const row = (label: string, value: unknown, color?: string) =>
    `<tr><td style="padding:6px 12px;font-weight:500;color:#64748b">${esc(label)}</td><td style="padding:6px 12px${color ? `;color:${color};font-weight:600` : ''}">${esc(value)}</td></tr>`;

  const section = (title: string, icon: string, rows: string) =>
    `<div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.06)">
      <div style="padding:14px 16px;border-bottom:1px solid #e2e8f0;background:#f8fafc;font-weight:600;font-size:15px">${icon} ${esc(title)}</div>
      <table style="width:100%;border-collapse:collapse;font-size:14px">${rows}</table>
    </div>`;

  const warningsHtml = warnings.length > 0
    ? `<div style="background:#fef3c7;border:1px solid #f59e0b;border-radius:12px;padding:16px;margin-bottom:8px">
        <div style="font-weight:600;margin-bottom:8px">⚠️ Advertencias (${warnings.length})</div>
        <ul style="margin:0;padding-left:20px">${warnings.map((w) => `<li style="margin:4px 0">${esc(w)}</li>`).join('')}</ul>
      </div>`
    : '';

  const featList = Object.entries(feat)
    .map(([k, v]) => `<span style="display:inline-block;padding:4px 10px;margin:3px;border-radius:6px;font-size:13px;background:${v ? '#dcfce7;color:#166534' : '#fee2e2;color:#991b1b'}">${v ? '✓' : '✗'} ${esc(k.replace(/_/g, ' '))}</span>`)
    .join('');

  const modulesList = (apis.modules || []).map((m: any) =>
    `<div style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-size:13px">
      <strong>${esc(m.name)}</strong> <span style="color:#94a3b8">(${esc(m.kind)})</span> — ${esc(m.description)}
      <div style="color:#94a3b8;margin-top:2px">${(m.routes || []).length} rutas</div>
    </div>`
  ).join('');

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>AQUA Health — ${esc(status.toUpperCase())}</title>
  <meta http-equiv="refresh" content="30">
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',sans-serif;background:#f1f5f9;color:#1e293b;line-height:1.6}
    .container{max-width:960px;margin:0 auto;padding:24px 16px}
    .header{text-align:center;padding:32px 0 24px}
    .header h1{font-size:28px;font-weight:700;letter-spacing:-0.5px}
    .header p{color:#64748b;margin-top:4px;font-size:14px}
    .status-pill{display:inline-block;padding:6px 18px;border-radius:20px;font-weight:700;font-size:16px;letter-spacing:0.5px;color:#fff;background:${statusColor(status)}}
    .grid{display:grid;gap:16px;margin-top:16px}
    .grid-2{grid-template-columns:repeat(auto-fit,minmax(420px,1fr))}
    .grid-1{grid-template-columns:1fr}
    .kpi-row{display:flex;gap:12px;flex-wrap:wrap;justify-content:center;margin:16px 0}
    .kpi{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:16px 20px;text-align:center;min-width:130px;flex:1;box-shadow:0 1px 3px rgba(0,0,0,0.06)}
    .kpi .value{font-size:28px;font-weight:700}
    .kpi .label{font-size:12px;color:#64748b;margin-top:2px}
    .footer{text-align:center;color:#94a3b8;font-size:12px;margin-top:32px;padding-bottom:16px}
    @media(max-width:500px){.grid-2{grid-template-columns:1fr}.kpi-row{flex-direction:column}}
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🌊 AQUA Backend Health</h1>
      <p>${esc(svc.name)} v${esc(svc.version)} — ${esc(svc.env)}</p>
      <div style="margin-top:12px"><span class="status-pill">${statusEmoji(status)} ${esc(status.toUpperCase())}</span></div>
    </div>

    ${warningsHtml}

    <div class="kpi-row">
      <div class="kpi"><div class="value">${esc(formatUptime(svc.uptime_seconds ?? 0))}</div><div class="label">Uptime</div></div>
      <div class="kpi"><div class="value" style="color:${statusColor(db.status)}">${esc(db.connected ? 'OK' : 'DOWN')}</div><div class="label">Base de datos</div></div>
      <div class="kpi"><div class="value">${esc(counts.lecturas_hoy ?? 0)}</div><div class="label">Lecturas hoy</div></div>
      <div class="kpi"><div class="value">${esc(counts.alertas_no_leidas ?? 0)}</div><div class="label">Alertas sin leer</div></div>
      <div class="kpi"><div class="value">${esc(counts.procesos_en_progreso ?? 0)}</div><div class="label">Procesos activos</div></div>
    </div>

    <div class="grid grid-2">
      ${section('Servicio', '🔧', [
        row('Nombre', svc.name),
        row('Versión', svc.version),
        row('Entorno', svc.env),
        row('Uptime', formatUptime(svc.uptime_seconds ?? 0)),
        row('Iniciado', svc.started_at),
      ].join(''))}

      ${section('Base de Datos', '🗄️', [
        row('Estado', db.status, statusColor(db.status)),
        row('Proveedor', db.connection?.provider),
        row('Host', db.connection?.host),
        row('Base', db.database_name),
        row('Versión MySQL', db.version),
        row('Latencia', `${db.latency_ms ?? '?'} ms`),
      ].join(''))}

      ${section('Servidor', '💻', [
        row('Host', `${srv.hostname} (${srv.host}:${srv.port})`),
        row('PID', srv.pid),
        row('Plataforma', `${srv.platform} ${srv.arch}`),
        row('Node.js', srv.node_version),
        row('Zona horaria', srv.timezone),
      ].join(''))}

      ${section('Memoria', '📊', [
        row('RSS', `${mem.rss ?? 0} MB`),
        row('Heap total', `${mem.heap_total ?? 0} MB`),
        row('Heap usado', `${mem.heap_used ?? 0} MB`),
        row('CPU cores', hostInfo.cpu_count),
        row('RAM libre', `${hostInfo.free_memory_mb ?? 0} / ${hostInfo.total_memory_mb ?? 0} MB`),
      ].join(''))}

      ${section('Operaciones', '📈', [
        row('Organizaciones', counts.organizaciones),
        row('Sucursales', counts.sucursales),
        row('Instalaciones', `${counts.instalaciones_activas ?? 0} activas / ${counts.instalaciones ?? 0} total`),
        row('Procesos', `${counts.procesos_en_progreso ?? 0} activos / ${counts.procesos ?? 0} total`),
        row('Especies', counts.especies),
        row('Usuarios', `${counts.usuarios_activos ?? 0} activos / ${counts.usuarios ?? 0} total`),
        row('Sensores', `${counts.sensores_asignados ?? 0} asignados / ${counts.sensores_instalados ?? 0} instalados`),
        row('Lecturas hoy', counts.lecturas_hoy),
        row('Lecturas total', counts.lecturas),
        row('Promedios 15min', counts.promedios_15min),
        row('Resumen horario', counts.resumen_horario),
        row('Alertas', `${counts.alertas_no_leidas ?? 0} sin leer / ${counts.alertas ?? 0} total`),
        row('Telegram suscripciones', counts.telegram_suscripciones_activas),
      ].join(''))}

      ${section('Observabilidad', '👁️', [
        row('WebSocket clientes', ws.active_connections ?? 0),
        row('WS mensajes enviados', ws.messages_sent ?? 0),
        row('Poller activo', poller.running ? 'Sí' : 'No'),
        row('Poller intervalo', `${poller.interval_ms ?? 0} ms`),
        row('Poller último tick', poller.last_tick_at || 'N/A'),
        row('Agregados último refresh', agg.last_refresh_at || 'N/A'),
      ].join(''))}
    </div>

    <div class="grid grid-1" style="margin-top:16px">
      ${section('Telegram', '📱', [
        row('Habilitado', telegram.enabled ? 'Sí' : 'No', telegram.enabled ? '#22c55e' : '#ef4444'),
        row('Bot configurado', telegram.bot_configured ? 'Sí' : 'No'),
        row('Chat configurado', telegram.chat_configured ? 'Sí' : 'No'),
        row('Suscripciones activas', telegram.subscriptions_active ?? 0),
        row('Webhook URL', telegram.webhook_base_url || 'No configurado'),
        row('Webhook secret', telegram.webhook_secret_configured ? 'Configurado' : 'No'),
      ].join(''))}
    </div>

    <div class="grid grid-1" style="margin-top:16px">
      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.06)">
        <div style="padding:14px 16px;border-bottom:1px solid #e2e8f0;background:#f8fafc;font-weight:600;font-size:15px">✨ Features</div>
        <div style="padding:12px 16px">${featList}</div>
      </div>
    </div>

    <div class="grid grid-1" style="margin-top:16px">
      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.06)">
        <div style="padding:14px 16px;border-bottom:1px solid #e2e8f0;background:#f8fafc;font-weight:600;font-size:15px">🔌 API Modules (${esc(apis.total_modules)} módulos · ${esc(apis.total_routes)} rutas)</div>
        ${modulesList}
      </div>
    </div>

    <div class="footer">
      Generado en ${esc(sys.generated_in_ms)} ms · ${esc(payload.timestamp)} · Auto-refresh cada 30s
    </div>
  </div>
</body>
</html>`;
}

async function sendHealthResponse(request: FastifyRequest, reply: FastifyReply) {
  const responseStartedAt = process.hrtime.bigint();
  const timestamp = new Date();
  const memoryUsage = process.memoryUsage();
  const database = await getDatabaseHealth();
  const operational = await getOperationalSnapshot();
  const websocket = getWsDiagnostics();
  const aggregates = getLecturaAggregatesDiagnostics();
  const poller = getLecturasPollerDiagnostics();
  const totalRoutes = API_MODULES.reduce((sum, module) => sum + module.routes.length, 0);
  const httpModules = API_MODULES.filter((module) => module.kind === 'http');
  const websocketModules = API_MODULES.filter((module) => module.kind === 'websocket');
  const warnings = buildHealthWarnings({
    databaseConnected: database.connected,
    telemetrySubscriptions:
      operational.status === 'ok' ? operational.counts.telegram_suscripciones_activas : 0,
    pollerError: poller.last_error_message,
    aggregatesError: aggregates.last_refresh_error_message,
  });
  const hasSubsystemIssue =
    operational.status !== 'ok' ||
    Boolean(poller.last_error_message) ||
    Boolean(aggregates.last_refresh_error_message);
  const overallStatus = !database.connected
    ? 'degraded'
    : hasSubsystemIssue || warnings.length > 0
      ? 'warning'
      : 'ok';

  const payload = {
    status: overallStatus,
    timestamp: timestamp.toISOString(),
    service: {
      name: PACKAGE_INFO.name,
      version: PACKAGE_INFO.version,
      env: config.env,
      uptime_seconds: toRounded(process.uptime()),
      started_at: SERVER_STARTED_AT.toISOString(),
    },
    server: {
      host: config.host,
      port: config.port,
      pid: process.pid,
      hostname: os.hostname(),
      platform: process.platform,
      arch: process.arch,
      node_version: process.version,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      cwd: process.cwd(),
    },
    database,
    runtime: {
      process: {
        uptime_seconds: toRounded(process.uptime()),
        cpu_usage: process.cpuUsage(),
      },
      host: {
        load_average: os.loadavg().map(toRounded),
        cpu_count: os.cpus().length,
        total_memory_mb: formatBytesToMb(os.totalmem()),
        free_memory_mb: formatBytesToMb(os.freemem()),
      },
    },
    observability: {
      websocket,
      poller,
      aggregates,
    },
    operations: operational,
    apis: {
      status: 'ok',
      rest_prefix: '/api',
      total_modules: API_MODULES.length,
      total_routes: totalRoutes,
      http_modules: httpModules.length,
      websocket_modules: websocketModules.length,
      modules: API_MODULES,
    },
    features: {
      cors: true,
      helmet: true,
      rate_limit: true,
      jwt_auth: true,
      websocket: true,
      http_compression: HTTP_COMPRESSION_ENABLED,
      telegram_enabled: config.telegramEnabled,
    },
    integrations: {
      telegram: {
        enabled: config.telegramEnabled,
        bot_configured: Boolean(config.telegramBotToken),
        chat_configured: Boolean(config.telegramChatId),
        subscriptions_active:
          operational.status === 'ok' ? operational.counts.telegram_suscripciones_activas : null,
        webhook_base_url: config.telegramWebhookBaseUrl || null,
        webhook_secret_configured: Boolean(config.telegramWebhookSecret),
      },
      ingest: {
        sensor_ingest_api_key_configured: Boolean(process.env.SENSOR_INGEST_API_KEY),
      },
    },
    system: {
      memory_mb: {
        rss: formatBytesToMb(memoryUsage.rss),
        heap_total: formatBytesToMb(memoryUsage.heapTotal),
        heap_used: formatBytesToMb(memoryUsage.heapUsed),
        external: formatBytesToMb(memoryUsage.external),
      },
      generated_in_ms: toRounded(Number(process.hrtime.bigint() - responseStartedAt) / 1_000_000),
    },
    warnings,
  };

  const httpStatus = database.connected ? 200 : 503;

  if (requestsHtml(request)) {
    return reply
      .code(httpStatus)
      .header('content-type', 'text/html; charset=utf-8')
      .send(renderHealthHtml(payload));
  }

  return reply.code(httpStatus).send(payload);
}

export async function registerHealth(app: FastifyInstance) {
  app.get('/health', sendHealthResponse);
  app.get('/api/health', sendHealthResponse);
}
