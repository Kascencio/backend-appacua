import { prisma } from '../repositories/prisma.js';
import { rangeQuerySchema, promediosQuerySchema } from '../utils/validators.js';
import { buildReportXML } from '../utils/xml.helper.js';
import type { FastifyRequest, FastifyReply } from 'fastify';

export async function getLecturas(req: FastifyRequest, reply: FastifyReply) {
  try {
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
  } catch (error: any) {
    reply.status(400).send({ error: error.message });
  }
}

export async function getResumenHorario(req: FastifyRequest, reply: FastifyReply) {
  try {
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
  } catch (error: any) {
    reply.status(400).send({ error: error.message });
  }
}

export async function getPromedios(req: FastifyRequest, reply: FastifyReply) {
  try {
    const q = promediosQuerySchema.parse(req.query);
    
    if (q.granularity === '15min') {
      // Query for 15-minute averages
      const query = `
        SELECT id_sensor_instalado, 
               CAST(CONCAT(fecha,' ',hora) AS DATETIME) AS ts, 
               promedio
        FROM promedio_15min
        WHERE id_sensor_instalado = ?
          ${q.from ? 'AND CAST(CONCAT(fecha," ",hora) AS DATETIME) >= ?' : ''}
          ${q.to ? 'AND CAST(CONCAT(fecha," ",hora) AS DATETIME) <= ?' : ''}
        ORDER BY ts ASC
      `;
      
      const params: any[] = [q.sensorInstaladoId];
      if (q.from) params.push(q.from);
      if (q.to) params.push(q.to);
      
      const rows = await prisma.$queryRawUnsafe<any[]>(query, ...params);
      
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
        timestamp: r.fecha_hora.toISOString(),
        promedio: Number(r.avg_val)
      })));
    }
  } catch (error: any) {
    reply.status(400).send({ error: error.message });
  }
}

export async function getReporteXML(req: FastifyRequest, reply: FastifyReply) {
  try {
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
    const xml = buildReportXML(
      q.sensorInstaladoId, 
      rows.map(r => ({ timestamp: r.tomada_en, valor: Number(r.valor) })), 
      avg
    );
    reply.type('application/xml');
    return reply.send(xml);
  } catch (error: any) {
    reply.status(400).send({ error: error.message });
  }
}

