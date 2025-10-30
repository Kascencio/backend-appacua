import { prisma } from '../repositories/prisma.js';
import { broadcastLecturaCreated } from './ws.lecturas.server.js';

export function startLecturasPoller(intervalMs = 750) {
  let lastSeenId = 0n;
  let running = false;

  async function tick() {
    if (running) return;
    running = true;
    try {
      if (lastSeenId === 0n) {
        const max = await prisma.lectura.aggregate({ _max: { id_lectura: true } });
        lastSeenId = BigInt(max._max.id_lectura ?? 0);
      }
      const rows = await prisma.$queryRawUnsafe<any[]>(`
        SELECT l.id_lectura, l.id_sensor_instalado, l.valor, l.tomada_en,
               si.id_instalacion, cs.tipo_medida
        FROM lectura l
        JOIN sensor_instalado si ON si.id_sensor_instalado = l.id_sensor_instalado
        JOIN catalogo_sensores cs ON cs.id_sensor = si.id_sensor
        WHERE l.id_lectura > ?
        ORDER BY l.id_lectura ASC
        LIMIT 1000
      `, lastSeenId.toString());

      for (const r of rows) {
        const ev = {
          id_lectura: Number(r.id_lectura),
          sensor_instalado_id: r.id_sensor_instalado,
          instalacion_id: r.id_instalacion,
          tipo_medida: r.tipo_medida,
          tomada_en: new Date(r.tomada_en).toISOString(),
          valor: Number(r.valor)
        };
        broadcastLecturaCreated(ev);
      }
      if (rows.length) {
        const maxId = rows[rows.length - 1].id_lectura;
        lastSeenId = BigInt(maxId);
      }
    } catch (e) {
      // minimal log
      // console.error('[poller] error', e);
    } finally {
      running = false;
    }
  }

  setInterval(tick, intervalMs);
}
