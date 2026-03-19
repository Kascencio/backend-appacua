import { readFileSync } from 'node:fs';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../config/index.js';
import { prisma } from '../repositories/prisma.js';

type ApiModuleCatalog = {
  name: string;
  kind: 'http' | 'websocket';
  description: string;
  basePaths: string[];
  routes: string[];
};

const SERVER_STARTED_AT = new Date();
const PACKAGE_INFO = loadPackageInfo();
const HTTP_COMPRESSION_ENABLED = String(process.env.HTTP_COMPRESSION_ENABLED ?? 'true').toLowerCase() !== 'false';

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

async function sendHealthResponse(_request: FastifyRequest, reply: FastifyReply) {
  const responseStartedAt = process.hrtime.bigint();
  const timestamp = new Date();
  const memoryUsage = process.memoryUsage();
  const database = await getDatabaseHealth();
  const totalRoutes = API_MODULES.reduce((sum, module) => sum + module.routes.length, 0);
  const httpModules = API_MODULES.filter((module) => module.kind === 'http');
  const websocketModules = API_MODULES.filter((module) => module.kind === 'websocket');
  const overallStatus = database.connected ? 'ok' : 'degraded';

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
      platform: process.platform,
      node_version: process.version,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    },
    database,
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
        webhook_base_url: config.telegramWebhookBaseUrl || null,
        webhook_secret_configured: Boolean(config.telegramWebhookSecret),
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
  };

  reply
    .code(database.connected ? 200 : 503)
    .send(payload);
}

export async function registerHealth(app: FastifyInstance) {
  app.get('/health', sendHealthResponse);
  app.get('/api/health', sendHealthResponse);
}
