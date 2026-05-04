import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import websocket from '@fastify/websocket';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import cookie from '@fastify/cookie';
import { config } from './config/index.js';
import { registerHealth } from './routes/health.routes.js';
import { registerLecturasRoutes } from './routes/lecturas.routes.js';
import { registerOrganizacionRoutes } from './routes/organizacion.routes.js';
import { registerInstalacionRoutes } from './routes/instalacion.routes.js';
import { registerUsuarioRoutes } from './routes/usuario.routes.js';
import { registerEspeciesRoutes } from './routes/especies.routes.js';
import { registerTelegramRoutes } from './routes/telegram.routes.js';
import { startTelegramWebhookBootstrap } from './services/telegram-webhook-bootstrap.service.js';
import { startLecturaAggregatesMaintenance } from './services/lectura-aggregates.service.js';
import { initLecturasWS } from './services/ws.lecturas.server.js';
import { startLecturasPoller } from './services/lecturas.poller.js';
import { compressPayloadIfBeneficial } from './utils/http-compression.js';

const app = Fastify({
  logger: {
    level: config.env === 'production' ? 'info' : 'debug'
  }
});

const HTTP_COMPRESSION_ENABLED = String(process.env.HTTP_COMPRESSION_ENABLED ?? 'false').toLowerCase() === 'true';
const HTTP_COMPRESSION_MIN_BYTES = Number(process.env.HTTP_COMPRESSION_MIN_BYTES ?? 1024);
const HTTP_COMPRESSION_BROTLI_QUALITY = Number(process.env.HTTP_COMPRESSION_BROTLI_QUALITY ?? 4);
const HTTP_COMPRESSION_GZIP_LEVEL = Number(process.env.HTTP_COMPRESSION_GZIP_LEVEL ?? 6);

function appendVaryHeader(currentVary: string | string[] | number | undefined, value: string): string {
  const baseValues = (Array.isArray(currentVary) ? currentVary.join(',') : String(currentVary ?? ''))
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (!baseValues.includes(value)) baseValues.push(value);
  return baseValues.join(', ');
}

// Security middleware
await app.register(helmet, {
  contentSecurityPolicy: false, // Disable CSP for WebSocket support
  crossOriginOpenerPolicy: false,
  originAgentCluster: false,
});

// CORS: en producción solo el frontend; en desarrollo cualquier origen
const corsOrigin = config.env === 'production'
  ? (process.env.FRONTEND_URL || 'https://app.midominio.com')
  : true;
await app.register(cors, {
  origin: corsOrigin,
  credentials: true,
});

// Cookie plugin (para auth con httpOnly cookies)
await app.register(cookie);

await app.register(websocket);
await app.register(jwt, {
  secret: config.jwtSecret,
  // Extraer token de cookie si no hay header Authorization
  cookie: {
    cookieName: 'access_token',
    signed: false,
  },
});
await app.register(rateLimit, {
  max: 300,
  timeWindow: '1 minute',
  skipOnError: false
});

if (HTTP_COMPRESSION_ENABLED) {
  app.addHook('onSend', async (req, reply, payload) => {
    if (req.method === 'HEAD' || reply.statusCode === 204 || reply.hasHeader('content-encoding')) {
      return payload;
    }

    if (typeof payload !== 'string' && !Buffer.isBuffer(payload)) {
      return payload;
    }

    const contentType = String(reply.getHeader('content-type') ?? '');
    if (!contentType) return payload;

    const rawPayload = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
    const minBytes = Number.isFinite(HTTP_COMPRESSION_MIN_BYTES) ? Math.max(256, Math.trunc(HTTP_COMPRESSION_MIN_BYTES)) : 1024;
    const brotliQuality = Number.isFinite(HTTP_COMPRESSION_BROTLI_QUALITY)
      ? Math.min(11, Math.max(1, Math.trunc(HTTP_COMPRESSION_BROTLI_QUALITY)))
      : 4;
    const gzipLevel = Number.isFinite(HTTP_COMPRESSION_GZIP_LEVEL)
      ? Math.min(9, Math.max(1, Math.trunc(HTTP_COMPRESSION_GZIP_LEVEL)))
      : 6;

    const compressed = await compressPayloadIfBeneficial(
      rawPayload,
      typeof req.headers['accept-encoding'] === 'string' ? req.headers['accept-encoding'] : undefined,
      contentType,
      {
        minBytes,
        brotliQuality,
        gzipLevel,
      }
    );

    if (!compressed) return payload;

    reply.header('content-encoding', compressed.encoding);
    reply.header('vary', appendVaryHeader(reply.getHeader('vary') as any, 'Accept-Encoding'));
    reply.removeHeader('content-length');
    return compressed.payload;
  });
}

// Root route to prevent 404 logs
app.get('/', async () => ({ message: 'Aqua Backend API Running' }));

// Favicon route to prevent 404 logs
app.get('/favicon.ico', async (_req, reply) => {
  reply.code(204).send();
});

// Register routes
await registerHealth(app);
await registerLecturasRoutes(app);
await registerOrganizacionRoutes(app);
await registerInstalacionRoutes(app);
await registerUsuarioRoutes(app);
await registerEspeciesRoutes(app);
await registerTelegramRoutes(app);

// Register WebSocket AFTER all HTTP routes but BEFORE listen
await initLecturasWS(app);
startLecturaAggregatesMaintenance();
startLecturasPoller(750); // ms
await startTelegramWebhookBootstrap(app);

try {
  await app.listen({ port: config.port, host: config.host });
  app.log.info(`Server listening on ${config.host}:${config.port}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
