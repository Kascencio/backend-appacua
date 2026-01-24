import { prisma } from '../repositories/prisma.js';
import { rangeQuerySchema, promediosQuerySchema } from '../utils/validators.js';
import { buildReportXML } from '../utils/xml.helper.js';
import type { FastifyRequest, FastifyReply } from 'fastify';

export async function getLecturas(req: FastifyRequest, reply: FastifyReply) {
  try {
    const q = rangeQuerySchema.parse(req.query);
    
    // Usar query raw para combinar fecha y hora
    let query = `
      SELECT l.id_lectura, l.id_sensor_instalado, l.valor, 
             CAST(CONCAT(l.fecha, ' ', l.hora) AS DATETIME) AS tomada_en,
             l.fecha, l.hora
      FROM lectura l
      WHERE l.id_sensor_instalado = ?
    `;
    const params: any[] = [q.sensorInstaladoId];
    
    if (q.from) {
      query += ` AND CAST(CONCAT(l.fecha, ' ', l.hora) AS DATETIME) >= ?`;
      params.push(q.from);
    }
    if (q.to) {
      query += ` AND CAST(CONCAT(l.fecha, ' ', l.hora) AS DATETIME) <= ?`;
      params.push(q.to);
    }
    
    query += ` ORDER BY tomada_en DESC LIMIT ?`;
    params.push(q.limit || 500);
    
    const rows = await prisma.$queryRawUnsafe<any[]>(query, ...params);
    
    return reply.send(rows.map(r => ({
      id_lectura: Number(r.id_lectura),
      id_sensor_instalado: r.id_sensor_instalado,
      valor: Number(r.valor),
      tomada_en: new Date(r.tomada_en).toISOString(),
      fecha: r.fecha,
      hora: r.hora
    })));
  } catch (error: any) {
    reply.status(400).send({ error: error.message });
  }
}

export async function getResumenHorario(req: FastifyRequest, reply: FastifyReply) {
  try {
    const q = rangeQuerySchema.parse(req.query);
    
    // Usar query raw para combinar fecha y hora
    let query = `
      SELECT rlh.id_resumen, rlh.id_sensor_instalado, rlh.promedio, rlh.registros,
             CAST(CONCAT(rlh.fecha, ' ', rlh.hora) AS DATETIME) AS fecha_hora,
             rlh.fecha, rlh.hora
      FROM resumen_lectura_horaria rlh
      WHERE rlh.id_sensor_instalado = ?
    `;
    const params: any[] = [q.sensorInstaladoId];
    
    if (q.from) {
      query += ` AND CAST(CONCAT(rlh.fecha, ' ', rlh.hora) AS DATETIME) >= ?`;
      params.push(q.from);
    }
    if (q.to) {
      query += ` AND CAST(CONCAT(rlh.fecha, ' ', rlh.hora) AS DATETIME) <= ?`;
      params.push(q.to);
    }
    
    query += ` ORDER BY fecha_hora ASC`;
    
    const rows = await prisma.$queryRawUnsafe<any[]>(query, ...params);
    
    return reply.send(rows.map(r => ({
      id_resumen: Number(r.id_resumen),
      id_sensor_instalado: r.id_sensor_instalado,
      promedio: Number(r.promedio),
      registros: Number(r.registros),
      fecha_hora: new Date(r.fecha_hora).toISOString(),
      fecha: r.fecha,
      hora: r.hora
    })));
  } catch (error: any) {
    reply.status(400).send({ error: error.message });
  }
}

export async function getPromedios(req: FastifyRequest, reply: FastifyReply) {
  try {
    const q = promediosQuerySchema.parse(req.query);

    // Promedio personalizado: agrupa lecturas por bloques de N minutos.
    // Ideal para gráficas con intervalos variables sin crear tablas nuevas.
    if (q.bucketMinutes) {
      let query = `
        SELECT l.id_sensor_instalado,
               FROM_UNIXTIME(
                 FLOOR(UNIX_TIMESTAMP(TIMESTAMP(l.fecha, l.hora)) / (? * 60)) * (? * 60)
               ) AS ts,
               ROUND(AVG(l.valor), 2) AS promedio,
               COUNT(*) AS muestras
        FROM lectura l
        WHERE l.id_sensor_instalado = ?
      `;
      const params: any[] = [q.bucketMinutes, q.bucketMinutes, q.sensorInstaladoId];

      if (q.from) {
        query += ` AND TIMESTAMP(l.fecha, l.hora) >= ?`;
        params.push(q.from);
      }
      if (q.to) {
        query += ` AND TIMESTAMP(l.fecha, l.hora) <= ?`;
        params.push(q.to);
      }

      query += ` GROUP BY l.id_sensor_instalado, ts ORDER BY ts ASC`;

      const rows = await prisma.$queryRawUnsafe<any[]>(query, ...params);
      return reply.send(rows.map(r => ({
        id_sensor_instalado: r.id_sensor_instalado,
        bucket_minutes: q.bucketMinutes,
        timestamp: new Date(r.ts).toISOString(),
        promedio: Number(r.promedio),
        muestras: Number(r.muestras)
      })));
    }
    
    if (q.granularity === '15min') {
      // Query for 15-minute averages
      const query = `
        SELECT id_sensor_instalado, 
               CAST(CONCAT(fecha,' ',hora) AS DATETIME) AS ts, 
               promedio
        FROM promedios
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
      let query = `
        SELECT rlh.id_sensor_instalado,
               CAST(CONCAT(rlh.fecha, ' ', rlh.hora) AS DATETIME) AS ts,
               rlh.promedio
        FROM resumen_lectura_horaria rlh
        WHERE rlh.id_sensor_instalado = ?
      `;
      const params: any[] = [q.sensorInstaladoId];
      
      if (q.from) {
        query += ` AND CAST(CONCAT(rlh.fecha, ' ', rlh.hora) AS DATETIME) >= ?`;
        params.push(q.from);
      }
      if (q.to) {
        query += ` AND CAST(CONCAT(rlh.fecha, ' ', rlh.hora) AS DATETIME) <= ?`;
        params.push(q.to);
      }
      
      query += ` ORDER BY ts ASC`;
      
      const rows = await prisma.$queryRawUnsafe<any[]>(query, ...params);
      
      return reply.send(rows.map(r => ({
        id_sensor_instalado: r.id_sensor_instalado,
        timestamp: new Date(r.ts).toISOString(),
        promedio: Number(r.promedio)
      })));
    }
  } catch (error: any) {
    reply.status(400).send({ error: error.message });
  }
}

export async function getReporteXML(req: FastifyRequest, reply: FastifyReply) {
  try {
    const q = rangeQuerySchema.parse(req.query);
    
    // Usar query raw para combinar fecha y hora
    let query = `
      SELECT l.id_lectura, l.id_sensor_instalado, l.valor,
             CAST(CONCAT(l.fecha, ' ', l.hora) AS DATETIME) AS tomada_en
      FROM lectura l
      WHERE l.id_sensor_instalado = ?
    `;
    const params: any[] = [q.sensorInstaladoId];
    
    if (q.from) {
      query += ` AND CAST(CONCAT(l.fecha, ' ', l.hora) AS DATETIME) >= ?`;
      params.push(q.from);
    }
    if (q.to) {
      query += ` AND CAST(CONCAT(l.fecha, ' ', l.hora) AS DATETIME) <= ?`;
      params.push(q.to);
    }
    
    query += ` ORDER BY tomada_en ASC`;
    
    const rows = await prisma.$queryRawUnsafe<any[]>(query, ...params);
    
    const avg = rows.length ? rows.reduce((a: number, r: any) => a + Number(r.valor), 0) / rows.length : null;
    const xml = buildReportXML(
      q.sensorInstaladoId, 
      rows.map((r: any) => ({ timestamp: new Date(r.tomada_en), valor: Number(r.valor) })), 
      avg
    );
    reply.type('application/xml');
    return reply.send(xml);
  } catch (error: any) {
    reply.status(400).send({ error: error.message });
  }
}

