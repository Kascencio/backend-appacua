import { prisma } from '../repositories/prisma.js';
import { rangeQuerySchema, promediosQuerySchema } from '../utils/validators.js';
import { buildReportXML } from '../utils/xml.helper.js';
import type { FastifyRequest, FastifyReply } from 'fastify';
import {
  buildInstalacionScopeWhere,
  canAccessFacility,
  requireRequestScope,
  type RequestScope,
} from '../utils/access-control.js';

function normalizeRangeQuery(rawQuery: any) {
  return rangeQuerySchema.parse({
    sensorInstaladoId: rawQuery.sensorInstaladoId ?? rawQuery.id_sensor_instalado ?? rawQuery.sensor_instalado_id,
    from: rawQuery.from ?? rawQuery.desde ?? rawQuery.fecha_inicio,
    to: rawQuery.to ?? rawQuery.hasta ?? rawQuery.fecha_fin,
    limit: rawQuery.limit,
  });
}

function normalizePromediosRequest(rawQuery: any) {
  return promediosQuerySchema.parse({
    granularity: rawQuery.granularity,
    bucketMinutes: rawQuery.bucketMinutes,
    sensorInstaladoId: rawQuery.sensorInstaladoId ?? rawQuery.id_sensor_instalado ?? rawQuery.sensor_instalado_id,
    from: rawQuery.from ?? rawQuery.desde ?? rawQuery.fecha_inicio,
    to: rawQuery.to ?? rawQuery.hasta ?? rawQuery.fecha_fin,
  });
}

function combineFechaHoraISO(fecha: Date, hora: Date): string {
  const datePart = fecha.toISOString().slice(0, 10);
  const timePart = hora.toISOString().slice(11, 19);
  return new Date(`${datePart}T${timePart}Z`).toISOString();
}

function toPositiveInt(value: unknown): number | null {
  const num = typeof value === 'string' ? Number(value) : (typeof value === 'number' ? value : NaN);
  if (!Number.isFinite(num)) return null;
  const parsed = Math.trunc(num);
  return parsed > 0 ? parsed : null;
}

function toDate(value: unknown): Date | null {
  if (!value) return null;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

async function canAccessSensorInstalado(scope: RequestScope, sensorInstaladoId: number): Promise<boolean> {
  const sensor = await prisma.sensor_instalado.findUnique({
    where: { id_sensor_instalado: sensorInstaladoId },
    include: {
      instalacion: {
        select: {
          id_organizacion_sucursal: true,
        },
      },
    },
  });

  if (!sensor) return false;
  return canAccessFacility(scope, sensor.id_instalacion, sensor.instalacion?.id_organizacion_sucursal);
}

async function buildProcesoLecturasPayload(
  procesoId: number,
  from?: string,
  to?: string,
  scope?: RequestScope
) {
  const whereInstalaciones: any = { id_proceso: procesoId };
  if (scope) {
    const scopeWhere = buildInstalacionScopeWhere(scope);
    if (Object.keys(scopeWhere).length > 0) {
      whereInstalaciones.AND = [scopeWhere];
    }
  }

  const instalaciones = await prisma.instalacion.findMany({
    where: whereInstalaciones,
    select: { id_instalacion: true, nombre_instalacion: true },
  });

  const instalacionById = new Map<number, string>(
    instalaciones.map((instalacion) => [instalacion.id_instalacion, instalacion.nombre_instalacion])
  );

  const instalacionIds = instalaciones.map((instalacion) => instalacion.id_instalacion);

  if (instalacionIds.length === 0) {
    return {
      lecturas: [],
      parametros: [],
      proceso_id: procesoId,
      periodo: { inicio: from || '', fin: to || '' },
      total_lecturas: 0,
    };
  }

  const sensores = await prisma.sensor_instalado.findMany({
    where: {
      id_instalacion: { in: instalacionIds },
    },
    include: {
      catalogo_sensores: true,
    },
  });

  const sensorById = new Map(
    sensores.map((sensor) => [sensor.id_sensor_instalado, sensor])
  );

  const sensorIds = sensores.map((sensor) => sensor.id_sensor_instalado);

  if (sensorIds.length === 0) {
    return {
      lecturas: [],
      parametros: [],
      proceso_id: procesoId,
      periodo: { inicio: from || '', fin: to || '' },
      total_lecturas: 0,
    };
  }

  const where: any = {
    id_sensor_instalado: { in: sensorIds },
  };

  const fromDate = toDate(from);
  const toDateValue = toDate(to);
  if (fromDate || toDateValue) {
    where.fecha = {
      ...(fromDate ? { gte: fromDate } : {}),
      ...(toDateValue ? { lte: toDateValue } : {}),
    };
  }

  const lecturasRaw = await prisma.lectura.findMany({
    where,
    orderBy: [
      { fecha: 'desc' },
      { hora: 'desc' },
    ],
  });

  const lecturas = lecturasRaw.map((lectura) => {
    const sensor = sensorById.get(lectura.id_sensor_instalado);
    const instalacionId = sensor?.id_instalacion;
    const sensorName = sensor?.catalogo_sensores?.nombre ?? `Sensor ${lectura.id_sensor_instalado}`;
    const unidad = sensor?.catalogo_sensores?.unidad_medida ?? undefined;

    return {
      id_lectura: lectura.id_lectura,
      id_sensor_instalado: lectura.id_sensor_instalado,
      valor: Number(lectura.valor),
      fecha: lectura.fecha,
      hora: lectura.hora,
      timestamp: combineFechaHoraISO(lectura.fecha as Date, lectura.hora as Date),
      id_instalacion: instalacionId,
      nombre_instalacion: instalacionId ? instalacionById.get(instalacionId) : undefined,
      nombre_sensor: sensorName,
      tipo_sensor: sensorName,
      unidad_medida: unidad,
    };
  });

  const parametroMap = new Map<number, any>();

  for (const lectura of lecturas) {
    const sensor = sensorById.get(lectura.id_sensor_instalado);
    if (!sensor) continue;

    const key = sensor.id_sensor;
    const nombreParametro = sensor.catalogo_sensores?.nombre ?? `Sensor ${sensor.id_sensor}`;
    const unidadMedida = sensor.catalogo_sensores?.unidad_medida ?? '';

    if (!parametroMap.has(key)) {
      parametroMap.set(key, {
        id_parametro: key,
        nombre_parametro: nombreParametro,
        unidad_medida: unidadMedida,
        valor_actual: lectura.valor,
        estado: 'normal',
        ultima_lectura: lectura.timestamp,
        promedio: lectura.valor,
        alertas_count: 0,
        lecturas: [],
      });
    }

    const current = parametroMap.get(key);
    current.lecturas.push({
      valor: lectura.valor,
      timestamp: lectura.timestamp,
      estado: 'normal',
    });
  }

  const parametros = Array.from(parametroMap.values()).map((parametro) => {
    const values = parametro.lecturas.map((item: any) => Number(item.valor));
    const promedio = values.length > 0
      ? values.reduce((sum: number, value: number) => sum + value, 0) / values.length
      : 0;

    return {
      ...parametro,
      promedio: Number(promedio.toFixed(2)),
    };
  });

  return {
    lecturas,
    parametros,
    proceso_id: procesoId,
    periodo: { inicio: from || '', fin: to || '' },
    total_lecturas: lecturas.length,
  };
}

export async function getLecturas(req: FastifyRequest, reply: FastifyReply) {
  try {
    const scope = await requireRequestScope(req, reply);
    if (!scope) return;

    const q = normalizeRangeQuery(req.query as any);
    const sensorAllowed = await canAccessSensorInstalado(scope, q.sensorInstaladoId);
    if (!sensorAllowed) {
      return reply.status(403).send({ error: 'No tiene acceso a este sensor instalado' });
    }

    let query = `
      SELECT l.id_lectura, l.id_sensor_instalado, l.valor,
             CAST(CONCAT(l.fecha, ' ', l.hora) AS DATETIME) AS tomada_en,
             l.fecha, l.hora,
             si.id_instalacion,
             cs.sensor AS tipo_medida,
             cs.unidad_medida
      FROM lectura l
      JOIN sensor_instalado si ON si.id_sensor_instalado = l.id_sensor_instalado
      JOIN catalogo_sensores cs ON cs.id_sensor = si.id_sensor
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

    return reply.send(rows.map((row) => ({
      id_lectura: Number(row.id_lectura),
      id_sensor_instalado: Number(row.id_sensor_instalado),
      sensor_instalado_id: Number(row.id_sensor_instalado),
      valor: Number(row.valor),
      tomada_en: new Date(row.tomada_en).toISOString(),
      fecha: row.fecha,
      hora: row.hora,
      id_instalacion: Number(row.id_instalacion),
      tipo_medida: row.tipo_medida,
      unidad: row.unidad_medida,
      unidad_medida: row.unidad_medida,
    })));
  } catch (error: any) {
    reply.status(400).send({ error: error.message });
  }
}

export async function getLecturasProceso(req: FastifyRequest, reply: FastifyReply) {
  try {
    const scope = await requireRequestScope(req, reply);
    if (!scope) return;

    const query = req.query as any;
    const procesoId = toPositiveInt(query.proceso ?? query.id_proceso);
    const from = query.from ?? query.desde ?? query.fecha_inicio;
    const to = query.to ?? query.hasta ?? query.fecha_fin;

    if (!procesoId) {
      return reply.status(400).send({ error: 'Parámetro proceso o id_proceso es obligatorio' });
    }

    const payload = await buildProcesoLecturasPayload(procesoId, from, to, scope);
    return reply.send(payload);
  } catch (error: any) {
    reply.status(400).send({ error: error.message });
  }
}

export async function getLecturasPorProceso(req: FastifyRequest, reply: FastifyReply) {
  try {
    const scope = await requireRequestScope(req, reply);
    if (!scope) return;

    const query = req.query as any;
    const procesoId = toPositiveInt(query.id_proceso ?? query.proceso);
    const from = query.fecha_inicio ?? query.from ?? query.desde;
    const to = query.fecha_fin ?? query.to ?? query.hasta;

    if (!procesoId) {
      return reply.status(400).send({ error: 'ID de proceso requerido' });
    }

    const payload = await buildProcesoLecturasPayload(procesoId, from, to, scope);
    return reply.send({
      lecturas: payload.lecturas,
      parametros: payload.parametros,
      total: payload.total_lecturas,
      proceso_id: payload.proceso_id,
      periodo: payload.periodo,
    });
  } catch (error: any) {
    reply.status(400).send({ error: error.message });
  }
}

export async function getResumenHorario(req: FastifyRequest, reply: FastifyReply) {
  try {
    const scope = await requireRequestScope(req, reply);
    if (!scope) return;

    const q = normalizeRangeQuery(req.query as any);
    const sensorAllowed = await canAccessSensorInstalado(scope, q.sensorInstaladoId);
    if (!sensorAllowed) {
      return reply.status(403).send({ error: 'No tiene acceso a este sensor instalado' });
    }

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

    return reply.send(rows.map((row) => ({
      id_resumen: Number(row.id_resumen),
      id_sensor_instalado: Number(row.id_sensor_instalado),
      promedio: Number(row.promedio),
      registros: Number(row.registros),
      fecha_hora: new Date(row.fecha_hora).toISOString(),
      fecha: row.fecha,
      hora: row.hora,
    })));
  } catch (error: any) {
    reply.status(400).send({ error: error.message });
  }
}

export async function getPromedios(req: FastifyRequest, reply: FastifyReply) {
  try {
    const scope = await requireRequestScope(req, reply);
    if (!scope) return;

    const q = normalizePromediosRequest(req.query as any);
    const sensorAllowed = await canAccessSensorInstalado(scope, q.sensorInstaladoId);
    if (!sensorAllowed) {
      return reply.status(403).send({ error: 'No tiene acceso a este sensor instalado' });
    }

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
      return reply.send(rows.map((row) => ({
        id_sensor_instalado: Number(row.id_sensor_instalado),
        bucket_minutes: q.bucketMinutes,
        timestamp: new Date(row.ts).toISOString(),
        promedio: Number(row.promedio),
        muestras: Number(row.muestras)
      })));
    }

    if (q.granularity === '15min') {
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

      return reply.send(rows.map((row) => ({
        id_sensor_instalado: Number(row.id_sensor_instalado),
        timestamp: new Date(row.ts).toISOString(),
        promedio: Number(row.promedio)
      })));
    }

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

    return reply.send(rows.map((row) => ({
      id_sensor_instalado: Number(row.id_sensor_instalado),
      timestamp: new Date(row.ts).toISOString(),
      promedio: Number(row.promedio)
    })));
  } catch (error: any) {
    reply.status(400).send({ error: error.message });
  }
}

export async function getReporteXML(req: FastifyRequest, reply: FastifyReply) {
  try {
    const scope = await requireRequestScope(req, reply);
    if (!scope) return;

    const q = normalizeRangeQuery(req.query as any);
    const sensorAllowed = await canAccessSensorInstalado(scope, q.sensorInstaladoId);
    if (!sensorAllowed) {
      return reply.status(403).send({ error: 'No tiene acceso a este sensor instalado' });
    }

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

    const avg = rows.length
      ? rows.reduce((acc: number, row: any) => acc + Number(row.valor), 0) / rows.length
      : null;

    const xml = buildReportXML(
      q.sensorInstaladoId,
      rows.map((row: any) => ({
        timestamp: new Date(row.tomada_en),
        valor: Number(row.valor),
      })),
      avg
    );

    reply.type('application/xml');
    return reply.send(xml);
  } catch (error: any) {
    reply.status(400).send({ error: error.message });
  }
}
