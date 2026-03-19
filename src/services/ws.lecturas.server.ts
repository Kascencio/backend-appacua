import { FastifyInstance, FastifyRequest } from 'fastify';
import type { WebSocket } from 'ws';
import { wsFilterSchema } from '../utils/validators.js';

type WSConnection = {
  socket: WebSocket;
  filters: { sensorInstaladoId?: number; instalacionId?: number };
};

const connections = new Set<WSConnection>();
const notificationConnections = new Set<WebSocket>();
const wsDiagnostics = {
  lecturas_connected_total: 0,
  notificaciones_connected_total: 0,
  lecturas_broadcast_total: 0,
  notificaciones_broadcast_total: 0,
  last_lecturas_connected_at: null as string | null,
  last_notificaciones_connected_at: null as string | null,
  last_lectura_broadcast_at: null as string | null,
  last_notificacion_broadcast_at: null as string | null,
  last_lectura_event_type: null as string | null,
  last_notification_event_type: null as string | null,
};

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
    wsDiagnostics.lecturas_connected_total += 1;
    wsDiagnostics.last_lecturas_connected_at = new Date().toISOString();
    
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

  app.get('/ws/notificaciones', { websocket: true }, (connection, _req: FastifyRequest) => {
    const socket: WebSocket = (connection as any).socket ?? connection;
    notificationConnections.add(socket);
    wsDiagnostics.notificaciones_connected_total += 1;
    wsDiagnostics.last_notificaciones_connected_at = new Date().toISOString();

    socket.send(JSON.stringify({
      type: 'connected',
      channel: 'notificaciones',
      message: 'Conexión de notificaciones establecida'
    }));

    socket.on('close', () => {
      notificationConnections.delete(socket);
    });

    socket.on('error', () => {
      notificationConnections.delete(socket);
    });
  });
  
  app.log.info('WebSocket routes /ws/lecturas and /ws/notificaciones registered');
}

export function broadcastLecturaCreated(event: any) {
  const data = JSON.stringify({ type: 'lectura.created', data: event });
  let sent = 0;
  for (const c of connections) {
    const f = c.filters;
    if (f.sensorInstaladoId && event.sensor_instalado_id !== f.sensorInstaladoId) continue;
    if (f.instalacionId && event.instalacion_id !== f.instalacionId) continue;
    try { 
      if (c.socket.readyState === 1) { // OPEN
        c.socket.send(data);
        sent += 1;
      }
    } catch {}
  }

  wsDiagnostics.lecturas_broadcast_total += sent;
  wsDiagnostics.last_lectura_broadcast_at = new Date().toISOString();
  wsDiagnostics.last_lectura_event_type = 'lectura.created';
}

export function broadcastNotification(event: { type: string; data?: any }) {
  const payload = JSON.stringify({
    ...event,
    timestamp: new Date().toISOString()
  });

  let sent = 0;
  for (const socket of notificationConnections) {
    try {
      if (socket.readyState === 1) {
        socket.send(payload);
        sent += 1;
      }
    } catch {}
  }

  wsDiagnostics.notificaciones_broadcast_total += sent;
  wsDiagnostics.last_notificacion_broadcast_at = new Date().toISOString();
  wsDiagnostics.last_notification_event_type = event.type;
}

export function getWsDiagnostics() {
  return {
    lecturas: {
      active_connections: connections.size,
      connected_total: wsDiagnostics.lecturas_connected_total,
      broadcast_total: wsDiagnostics.lecturas_broadcast_total,
      last_connected_at: wsDiagnostics.last_lecturas_connected_at,
      last_broadcast_at: wsDiagnostics.last_lectura_broadcast_at,
      last_event_type: wsDiagnostics.last_lectura_event_type,
    },
    notifications: {
      active_connections: notificationConnections.size,
      connected_total: wsDiagnostics.notificaciones_connected_total,
      broadcast_total: wsDiagnostics.notificaciones_broadcast_total,
      last_connected_at: wsDiagnostics.last_notificaciones_connected_at,
      last_broadcast_at: wsDiagnostics.last_notificacion_broadcast_at,
      last_event_type: wsDiagnostics.last_notification_event_type,
    },
  };
}
