import { prisma } from '../repositories/prisma.js';
import { rangeQuerySchema } from '../utils/validators.js';
import { buildReportXML } from '../utils/xml.helper.js';

export async function getLecturas(req: any, reply: any) {
  const q = rangeQuerySchema.parse(req.query);
  const where: any = { id_sensor_instalado: q.sensorInstaladoId };
  if (q.from || q.to) {
    where.tomada_en = {};
    if (q.from) where.tomada_en.gte = new Date(q.from);
    if (q.to) where.tomada_en.lte = new Date(q.to);
  }
  const rows = await prisma.lectura.findMany({
    where,
    orderBy: { tomada_en: 'desc' },
    take: q.limit || 500
  });
  return reply.send(rows);
}

export async function getResumenHorario(req: any, reply: any) {
  const q = rangeQuerySchema.parse(req.query);
  const where: any = { id_sensor_instalado: q.sensorInstaladoId };
  if (q.from || q.to) {
    where.fecha_hora = {};
    if (q.from) where.fecha_hora.gte = new Date(q.from);
    if (q.to) where.fecha_hora.lte = new Date(q.to);
  }
  const rows = await prisma.resumenLecturaHoraria.findMany({
    where,
    orderBy: { fecha_hora: 'asc' }
  });
  return reply.send(rows);
}

export async function getPromedios(req: any, reply: any) {
  const { granularity } = req.query as { granularity?: string };
  const q = rangeQuerySchema.parse(req.query);
  if (granularity === '15min') {
    const rows = await prisma.$queryRawUnsafe<any[]>(`
      SELECT id_sensor_instalado, 
             CAST(CONCAT(fecha,' ',hora) AS DATETIME) AS ts, 
             promedio
      FROM promedio_15min
      WHERE id_sensor_instalado = ?
        AND ( ( ? IS NULL ) OR ( CAST(CONCAT(fecha,' ',hora) AS DATETIME) >= ? ) )
        AND ( ( ? IS NULL ) OR ( CAST(CONCAT(fecha,' ',hora) AS DATETIME) <= ? ) )
      ORDER BY ts ASC
    `, q.sensorInstaladoId, q.from or None, q.from or None, q.to or None, q.to or None)
    ;
    return reply.send(rows.map(r => ({
      id_sensor_instalado: r.id_sensor_instalado,
      timestamp: new Date(r.ts).toISOString(),
      promedio: Number(r.promedio)
    })));
  } else {
    // hour (resumen_lectura_horaria)
    const where: any = { id_sensor_instalado: q.sensorInstaladoId };
    if (q.from || q.to) {
      where.fecha_hora = {};
      if (q.from) where.fecha_hora.gte = new Date(q.from);
      if (q.to) where.fecha_hora.lte = new Date(q.to);
    }
    const rows = await prisma.resumenLecturaHoraria.findMany({
      where, orderBy: { fecha_hora: 'asc' }
    });
    return reply.send(rows.map(r => ({
      id_sensor_instalado: r.id_sensor_instalado,
      timestamp: r.fecha_hora,
      promedio: r.avg_val
    })));
  }
}

export async function getReporteXML(req: any, reply: any) {
  const q = rangeQuerySchema.parse(req.query);
  const where: any = { id_sensor_instalado: q.sensorInstaladoId };
  if (q.from || q.to) {
    where.tomada_en = {};
    if (q.from) where.tomada_en.gte = new Date(q.from);
    if (q.to) where.tomada_en.lte = new Date(q.to);
  }
  const rows = await prisma.lectura.findMany({
    where, orderBy: { tomada_en: 'asc' }
  });
  const avg = rows.length ? rows.reduce((a, r) => a + Number(r.valor), 0) / rows.length : null;
  const xml = buildReportXML(q.sensorInstaladoId, rows.map(r => ({ timestamp: r.tomada_en, valor: Number(r.valor) })), avg);
  reply.type('application/xml');
  return reply.send(xml);
}
