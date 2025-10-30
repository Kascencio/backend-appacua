import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import websocket from '@fastify/websocket';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import { config } from './config/index.js';
import { registerHealth } from './routes/health.routes.js';
import { registerLecturasRoutes } from './routes/lecturas.routes.js';
import { initLecturasWS } from './services/ws.lecturas.server.js';
import { startLecturasPoller } from './services/lecturas.poller.js';

const app = Fastify({ 
  logger: {
    level: config.env === 'production' ? 'info' : 'debug'
  }
});

// Security middleware
await app.register(helmet, { 
  contentSecurityPolicy: false // Disable CSP for WebSocket support
});
await app.register(cors, {
  origin: config.env === 'production' ? false : '*', // Configure in production
  credentials: true
});

await app.register(websocket);
await app.register(jwt, { secret: config.jwtSecret });
await app.register(rateLimit, { 
  max: 300, 
  timeWindow: '1 minute',
  skipOnError: false
});

await registerHealth(app);
await registerLecturasRoutes(app);
initLecturasWS(app);
startLecturasPoller(750); // ms

try {
  await app.listen({ port: config.port, host: config.host });
  app.log.info(`Server listening on ${config.host}:${config.port}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

