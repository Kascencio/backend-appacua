import { FastifyInstance, FastifyRequest } from 'fastify';
import type { WebSocket } from 'ws';
import { wsFilterSchema } from '../utils/validators.js';

type WSConnection = {
  socket: WebSocket;
  filters: { sensorInstaladoId?: number; instalacionId?: number };
};

const connections = new Set<WSConnection>();

export async function initLecturasWS(app: FastifyInstance) {
  app.get('/ws/lecturas', { websocket: true }, (connection, req: FastifyRequest) => {
    // En @fastify/websocket 8.x+, connection es el WebSocket directamente
    // Pero en algunas versiones es { socket: WebSocket }
    // Detectamos cuál es:
    const socket: WebSocket = (connection as any).socket ?? connection;
    
    // Log para debug
    app.log.info({ url: req.url }, 'WebSocket connection attempt');
    
    // parse filters from query
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const params = Object.fromEntries(url.searchParams.entries());
    
    let filters: WSConnection['filters'];
    try {
      const parsed = wsFilterSchema.parse({
        sensorInstaladoId: params.sensorInstaladoId ? Number(params.sensorInstaladoId) : undefined,
        instalacionId: params.instalacionId ? Number(params.instalacionId) : undefined
      });
      filters = parsed;
    } catch (e: any) {
      app.log.warn({ error: e.message }, 'WebSocket validation error');
      socket.send(JSON.stringify({ type: 'error', message: e.message }));
      socket.close(1008, 'Validation error');
      return;
    }
    
    const ref: WSConnection = { socket, filters };
    connections.add(ref);
    
    app.log.info({ filters, totalConnections: connections.size }, 'WebSocket connected');
    
    // Enviar confirmación de conexión
    socket.send(JSON.stringify({ 
      type: 'connected', 
      filters,
      message: 'Conexión WebSocket establecida'
    }));
    
    socket.on('close', () => {
      connections.delete(ref);
      app.log.info({ totalConnections: connections.size }, 'WebSocket disconnected');
    });
    
    socket.on('error', (err) => {
      app.log.error({ error: err.message }, 'WebSocket error');
      connections.delete(ref);
    });
  });
  
  app.log.info('WebSocket route /ws/lecturas registered');
}

export function broadcastLecturaCreated(event: any) {
  const data = JSON.stringify({ type: 'lectura.created', data: event });
  for (const c of connections) {
    const f = c.filters;
    if (f.sensorInstaladoId && event.sensor_instalado_id !== f.sensorInstaladoId) continue;
    if (f.instalacionId && event.instalacion_id !== f.instalacionId) continue;
    try { 
      if (c.socket.readyState === 1) { // OPEN
        c.socket.send(data); 
      }
    } catch {}
  }
}

export function getConnectionsCount(): number {
  return connections.size;
}
