import { FastifyInstance } from 'fastify';
import { wsFilterSchema } from '../utils/validators.js';

type WSConnection = {
  socket: any;
  filters: { sensorInstaladoId?: number; instalacionId?: number };
};

const connections = new Set<WSConnection>();

export function initLecturasWS(app: FastifyInstance) {
  app.get('/ws/lecturas', { websocket: true }, (conn, req) => {
    // parse filters from query
    const url = new URL(req.url, 'http://localhost');
    const params = Object.fromEntries(url.searchParams.entries());
    let filters: WSConnection['filters'];
    try {
      const parsed = wsFilterSchema.parse({
        sensorInstaladoId: params.sensorInstaladoId,
        instalacionId: params.instalacionId
      });
      filters = parsed;
    } catch (e: any) {
      conn.socket.send(JSON.stringify({ type: 'error', message: e.message }));
      conn.socket.close();
      return;
    }
    const ref = { socket: conn.socket, filters };
    connections.add(ref);
    conn.socket.on('close', () => connections.delete(ref));
  });
}

export function broadcastLecturaCreated(event: any) {
  const data = JSON.stringify({ type: 'lectura.created', data: event });
  for (const c of connections) {
    const f = c.filters;
    if (f.sensorInstaladoId && event.sensor_instalado_id !== f.sensorInstaladoId) continue;
    if (f.instalacionId && event.instalacion_id !== f.instalacionId) continue;
    try { c.socket.send(data); } catch {}
  }
}
