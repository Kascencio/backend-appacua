import { prisma } from '../repositories/prisma.js';
import {
  createLecturasBodySchema,
  promediosBatchQuerySchema,
  rangeQuerySchema,
  promediosQuerySchema,
} from '../utils/validators.js';
import { buildReportXML } from '../utils/xml.helper.js';
import type { FastifyRequest, FastifyReply } from 'fastify';
import {
  buildInstalacionScopeWhere,
  canAccessFacility,
  requireRequestScope,
  type RequestScope,
} from '../utils/access-control.js';

type ProcesoLecturaResponse = {
  id_lectura: number;
  id_sensor_instalado: number;
  valor: number;
  fecha: Date;
  hora: Date;
  timestamp: string;
  id_instalacion?: number;
  nombre_instalacion?: string;
  nombre_sensor: string;
  tipo_sensor: string;
  unidad_medida?: string;
};

type ParametroLecturaPoint = {
  valor: number;
  timestamp: string;
  estado: 'normal';
};

type ParametroMonitoreoResponse = {
  id_parametro: number;
  nombre_parametro: string;
  unidad_medida: string;
  valor_actual: number;
  estado: 'normal';
  ultima_lectura: string;
  promedio: number;
  alertas_count: number;
  lecturas: ParametroLecturaPoint[];
};

type ProcesoLecturasPayload = {
  lecturas: ProcesoLecturaResponse[];
  parametros: ParametroMonitoreoResponse[];
  proceso_id: number;
  periodo: { inicio: string; fin: string };
  total_lecturas: number;
};

type BuildProcesoPayloadOptions = {
  includeLecturasDetalle?: boolean;
};

type ProcesoPayloadCacheEntry = {
  expiresAt: number;
  data: ProcesoLecturasPayload;
};

type PromediosPayloadItem = {
  id_sensor_instalado: number;
  timestamp: string;
  promedio: number;
  bucket_minutes?: number;
  muestras?: number;
};

type PromediosCacheEntry = {
  expiresAt: number;
  data: PromediosPayloadItem[];
};

type PromediosBatchPayload = {
  bucket_minutes: number;
  total_sensores: number;
  sensores: Array<{
    id_sensor_instalado: number;
    bucket_minutes: number;
    puntos: PromediosPayloadItem[];
  }>;
};

type PromediosBatchCacheEntry = {
  expiresAt: number;
  data: PromediosBatchPayload;
};

type DateTimeRangeSqlOptions = {
  from?: string;
  to?: string;
  fechaColumn: string;
  horaColumn: string;
};

type SensorAccessCacheEntry = {
  expiresAt: number;
  allowed: boolean;
};

type CreateLecturaItemInput = {
  sensorInstaladoId?: number;
  id_sensor_instalado?: number;
  sensor_instalado_id?: number;
  valor: number;
  tomada_en?: Date;
  timestamp?: Date;
  fecha?: Date;
  hora?: Date;
};

type CreateLecturaRecord = {
  id_lectura: number;
  id_sensor_instalado: number;
  sensor_instalado_id: number;
  valor: number;
  tomada_en: string;
  fecha: Date;
  hora: Date;
  id_instalacion: number | null;
  tipo_medida: string;
  unidad_medida: string | null;
};

const PROCESO_PAYLOAD_CACHE_TTL_MS = Number(process.env.PROCESO_PAYLOAD_CACHE_TTL_MS ?? 8_000);
const PROCESO_PAYLOAD_CACHE_MAX_ENTRIES = 150;
const procesoPayloadCache = new Map<string, ProcesoPayloadCacheEntry>();
const PROMEDIOS_CACHE_TTL_MS = Number(process.env.PROMEDIOS_CACHE_TTL_MS ?? 12_000);
const PROMEDIOS_CACHE_MAX_ENTRIES = 600;
const PROMEDIOS_CACHE_TIME_ROUNDING_SECONDS = Number(process.env.PROMEDIOS_CACHE_TIME_ROUNDING_SECONDS ?? 10);
const SENSOR_ACCESS_CACHE_TTL_MS = Number(process.env.SENSOR_ACCESS_CACHE_TTL_MS ?? 15_000);
const promediosCache = new Map<string, PromediosCacheEntry>();
const promediosInflight = new Map<string, Promise<PromediosPayloadItem[]>>();
const promediosBatchCache = new Map<string, PromediosBatchCacheEntry>();
const promediosBatchInflight = new Map<string, Promise<PromediosBatchPayload>>();
const sensorAccessCache = new Map<string, SensorAccessCacheEntry>();
const sensorIngestApiKey = String(process.env.SENSOR_INGEST_API_KEY ?? '').trim();

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

function normalizePromediosBatchRequest(rawQuery: any) {
  return promediosBatchQuerySchema.parse({
    bucketMinutes: rawQuery.bucketMinutes,
    sensorInstaladoIds:
      rawQuery.sensorInstaladoIds ??
      rawQuery.sensor_instalado_ids ??
      rawQuery.sensorInstaladoId ??
      rawQuery.id_sensor_instalado,
    from: rawQuery.from ?? rawQuery.desde ?? rawQuery.fecha_inicio,
    to: rawQuery.to ?? rawQuery.hasta ?? rawQuery.fecha_fin,
  });
}

function normalizeCreateLecturasRequest(rawBody: any): { lecturas: CreateLecturaItemInput[]; single: boolean } {
  const parsed = createLecturasBodySchema.parse(rawBody);

  if (Array.isArray(parsed)) {
    return { lecturas: parsed, single: false };
  }

  if ('lecturas' in parsed) {
    return { lecturas: parsed.lecturas, single: false };
  }

  return { lecturas: [parsed], single: true };
}

function combineFechaHoraISO(fecha: Date, hora: Date): string {
  const datePart = fecha.toISOString().slice(0, 10);
  const timePart = hora.toISOString().slice(11, 19);
  return new Date(`${datePart}T${timePart}Z`).toISOString();
}

function combineFechaHora(fecha: Date, hora: Date): Date {
  const datePart = fecha.toISOString().slice(0, 10);
  const timePart = hora.toISOString().slice(11, 19);
  return new Date(`${datePart}T${timePart}Z`);
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

function normalizeBoolean(value: unknown, defaultValue = true): boolean {
  if (value === undefined || value === null || value === '') return defaultValue;
  if (typeof value === 'boolean') return value;

  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'si', 'sí', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return defaultValue;
}

function buildScopeSignature(scope?: RequestScope): string {
  if (!scope) return 'public';

  const organizations = [...scope.allowedOrganizationIds].sort((a, b) => a - b).join(',');
  const branches = [...scope.allowedBranchIds].sort((a, b) => a - b).join(',');
  const facilities = [...scope.allowedFacilityIds].sort((a, b) => a - b).join(',');

  return [
    `u:${scope.idUsuario}`,
    `rol:${scope.role}`,
    `idRol:${scope.idRol}`,
    `org:${organizations}`,
    `suc:${branches}`,
    `ins:${facilities}`,
  ].join('|');
}

function buildProcesoPayloadCacheKey(
  procesoId: number,
  from: string | undefined,
  to: string | undefined,
  scope: RequestScope | undefined,
  includeLecturasDetalle: boolean
): string {
  const scopeSignature = buildScopeSignature(scope);
  return `${procesoId}|${from || ''}|${to || ''}|detalle:${includeLecturasDetalle ? '1' : '0'}|${scopeSignature}`;
}

function pruneExpiredProcesoPayloadCache(now = Date.now()): void {
  for (const [key, entry] of procesoPayloadCache.entries()) {
    if (entry.expiresAt <= now) {
      procesoPayloadCache.delete(key);
    }
  }
}

function getCachedProcesoPayload(cacheKey: string): ProcesoLecturasPayload | null {
  const entry = procesoPayloadCache.get(cacheKey);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    procesoPayloadCache.delete(cacheKey);
    return null;
  }
  return entry.data;
}

function setProcesoPayloadCache(cacheKey: string, payload: ProcesoLecturasPayload): void {
  if (PROCESO_PAYLOAD_CACHE_TTL_MS <= 0) return;

  const now = Date.now();
  pruneExpiredProcesoPayloadCache(now);

  while (procesoPayloadCache.size >= PROCESO_PAYLOAD_CACHE_MAX_ENTRIES) {
    const oldestKey = procesoPayloadCache.keys().next().value;
    if (!oldestKey) break;
    procesoPayloadCache.delete(oldestKey);
  }

  procesoPayloadCache.set(cacheKey, {
    expiresAt: now + PROCESO_PAYLOAD_CACHE_TTL_MS,
    data: payload,
  });
}

function buildSensorAccessCacheKey(scope: RequestScope, sensorInstaladoId: number): string {
  return `${buildScopeSignature(scope)}|sensor:${sensorInstaladoId}`;
}

function getCachedSensorAccess(scope: RequestScope, sensorInstaladoId: number): boolean | null {
  if (SENSOR_ACCESS_CACHE_TTL_MS <= 0) return null;
  const cacheKey = buildSensorAccessCacheKey(scope, sensorInstaladoId);
  const entry = sensorAccessCache.get(cacheKey);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    sensorAccessCache.delete(cacheKey);
    return null;
  }
  return entry.allowed;
}

function setCachedSensorAccess(scope: RequestScope, sensorInstaladoId: number, allowed: boolean): void {
  if (SENSOR_ACCESS_CACHE_TTL_MS <= 0) return;
  const cacheKey = buildSensorAccessCacheKey(scope, sensorInstaladoId);
  sensorAccessCache.set(cacheKey, {
    expiresAt: Date.now() + SENSOR_ACCESS_CACHE_TTL_MS,
    allowed,
  });
}

function invalidateLecturaReadCaches(): void {
  procesoPayloadCache.clear();
  promediosCache.clear();
  promediosInflight.clear();
  promediosBatchCache.clear();
  promediosBatchInflight.clear();
}

function resolveCreateLecturaTimestamp(item: CreateLecturaItemInput): Date {
  if (item.tomada_en instanceof Date) return item.tomada_en;
  if (item.timestamp instanceof Date) return item.timestamp;
  if (item.fecha instanceof Date && item.hora instanceof Date) {
    return combineFechaHora(item.fecha, item.hora);
  }
  if (item.fecha instanceof Date) return item.fecha;
  return new Date();
}

function buildLecturaDateParts(timestamp: Date): { fecha: Date; hora: Date } {
  const fecha = new Date(timestamp);
  fecha.setHours(0, 0, 0, 0);

  const hh = String(timestamp.getHours()).padStart(2, '0');
  const mm = String(timestamp.getMinutes()).padStart(2, '0');
  const ss = String(timestamp.getSeconds()).padStart(2, '0');
  const hora = new Date(`1970-01-01T${hh}:${mm}:${ss}Z`);

  return { fecha, hora };
}

function normalizeHeaderValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? '';
  return String(value ?? '').trim();
}

function canIngestLecturas(req: FastifyRequest): boolean {
  if (!sensorIngestApiKey) return true;
  const provided = normalizeHeaderValue(req.headers['x-sensor-ingest-key'] as string | string[] | undefined);
  return provided.length > 0 && provided === sensorIngestApiKey;
}

function buildPromediosCacheKey(
  scope: RequestScope,
  q: { sensorInstaladoId: number; granularity?: string; bucketMinutes?: number; from?: string; to?: string }
): string {
  const roundSeconds = Number.isFinite(PROMEDIOS_CACHE_TIME_ROUNDING_SECONDS)
    ? Math.max(0, Math.trunc(PROMEDIOS_CACHE_TIME_ROUNDING_SECONDS))
    : 0;
  const normalizeTime = (value?: string): string => {
    if (!value) return '';
    if (roundSeconds <= 0) return value;

    const timestamp = Date.parse(value);
    if (!Number.isFinite(timestamp)) return value;

    const roundedMs = Math.floor(timestamp / (roundSeconds * 1000)) * (roundSeconds * 1000);
    return new Date(roundedMs).toISOString();
  };

  return [
    buildScopeSignature(scope),
    `sensor:${q.sensorInstaladoId}`,
    `gran:${q.granularity || 'default'}`,
    `bucket:${q.bucketMinutes ?? 0}`,
    `from:${normalizeTime(q.from)}`,
    `to:${normalizeTime(q.to)}`,
  ].join('|');
}

function prunePromediosCache(now = Date.now()): void {
  for (const [key, entry] of promediosCache.entries()) {
    if (entry.expiresAt <= now) {
      promediosCache.delete(key);
    }
  }
}

function buildPromediosBatchCacheKey(
  scope: RequestScope,
  q: { sensorInstaladoIds: number[]; bucketMinutes: number; from?: string; to?: string }
): string {
  return [
    buildScopeSignature(scope),
    `sensors:${[...q.sensorInstaladoIds].sort((a, b) => a - b).join(',')}`,
    `bucket:${q.bucketMinutes}`,
    `from:${q.from || ''}`,
    `to:${q.to || ''}`,
  ].join('|');
}

function prunePromediosBatchCache(now = Date.now()): void {
  for (const [key, entry] of promediosBatchCache.entries()) {
    if (entry.expiresAt <= now) {
      promediosBatchCache.delete(key);
    }
  }
}

function getCachedPromediosBatch(cacheKey: string): PromediosBatchPayload | null {
  const entry = promediosBatchCache.get(cacheKey);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    promediosBatchCache.delete(cacheKey);
    return null;
  }
  return entry.data;
}

function setCachedPromediosBatch(cacheKey: string, payload: PromediosBatchPayload): void {
  if (PROMEDIOS_CACHE_TTL_MS <= 0) return;

  const now = Date.now();
  prunePromediosBatchCache(now);

  while (promediosBatchCache.size >= Math.max(100, Math.floor(PROMEDIOS_CACHE_MAX_ENTRIES / 3))) {
    const oldestKey = promediosBatchCache.keys().next().value;
    if (!oldestKey) break;
    promediosBatchCache.delete(oldestKey);
  }

  promediosBatchCache.set(cacheKey, {
    expiresAt: now + PROMEDIOS_CACHE_TTL_MS,
    data: payload,
  });
}

function appendDateTimeRangeSqlCondition(
  query: string,
  params: any[],
  options: DateTimeRangeSqlOptions
): string {
  const { from, to, fechaColumn, horaColumn } = options;
  let nextQuery = query;

  if (from) {
    nextQuery += ` AND (${fechaColumn} > DATE(?) OR (${fechaColumn} = DATE(?) AND ${horaColumn} >= TIME(?)))`;
    params.push(from, from, from);
  }

  if (to) {
    nextQuery += ` AND (${fechaColumn} < DATE(?) OR (${fechaColumn} = DATE(?) AND ${horaColumn} <= TIME(?)))`;
    params.push(to, to, to);
  }

  return nextQuery;
}

function splitTimestampParts(timestamp: Date): { fecha: Date; hora: Date } {
  const iso = timestamp.toISOString();
  const datePart = iso.slice(0, 10);
  const timePart = iso.slice(11, 19);

  return {
    fecha: new Date(`${datePart}T00:00:00.000Z`),
    hora: new Date(`1970-01-01T${timePart}.000Z`),
  };
}

async function queryLecturaBuckets(
  sensorInstaladoId: number,
  bucketMinutes: number,
  from?: string,
  to?: string,
): Promise<Array<{ id_sensor_instalado: number; timestamp: string; promedio: number; muestras: number }>> {
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
  const params: any[] = [bucketMinutes, bucketMinutes, sensorInstaladoId];
  query = appendDateTimeRangeSqlCondition(query, params, {
    from,
    to,
    fechaColumn: 'l.fecha',
    horaColumn: 'l.hora',
  });
  query += ` GROUP BY l.id_sensor_instalado, ts ORDER BY ts ASC`;

  const rows = await prisma.$queryRawUnsafe<any[]>(query, ...params);
  return rows.map((row) => ({
    id_sensor_instalado: Number(row.id_sensor_instalado),
    timestamp: new Date(row.ts).toISOString(),
    promedio: Number(row.promedio),
    muestras: Number(row.muestras),
  }));
}

async function queryLecturaBucketsBatch(
  sensorInstaladoIds: number[],
  bucketMinutes: number,
  from?: string,
  to?: string,
): Promise<Array<{ id_sensor_instalado: number; timestamp: string; promedio: number; muestras: number }>> {
  if (sensorInstaladoIds.length === 0) return [];

  const placeholders = sensorInstaladoIds.map(() => '?').join(', ');
  let query = `
    SELECT l.id_sensor_instalado,
           FROM_UNIXTIME(
             FLOOR(UNIX_TIMESTAMP(TIMESTAMP(l.fecha, l.hora)) / (? * 60)) * (? * 60)
           ) AS ts,
           ROUND(AVG(l.valor), 2) AS promedio,
           COUNT(*) AS muestras
    FROM lectura l
    WHERE l.id_sensor_instalado IN (${placeholders})
  `;
  const params: any[] = [bucketMinutes, bucketMinutes, ...sensorInstaladoIds];
  query = appendDateTimeRangeSqlCondition(query, params, {
    from,
    to,
    fechaColumn: 'l.fecha',
    horaColumn: 'l.hora',
  });

  query += ` GROUP BY l.id_sensor_instalado, ts ORDER BY l.id_sensor_instalado ASC, ts ASC`;

  const rows = await prisma.$queryRawUnsafe<any[]>(query, ...params);
  return rows.map((row) => ({
    id_sensor_instalado: Number(row.id_sensor_instalado),
    timestamp: new Date(row.ts).toISOString(),
    promedio: Number(row.promedio),
    muestras: Number(row.muestras),
  }));
}

function getCachedPromedios(cacheKey: string): PromediosPayloadItem[] | null {
  if (PROMEDIOS_CACHE_TTL_MS <= 0) return null;
  const entry = promediosCache.get(cacheKey);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    promediosCache.delete(cacheKey);
    return null;
  }
  return entry.data;
}

function setCachedPromedios(cacheKey: string, payload: PromediosPayloadItem[]): void {
  if (PROMEDIOS_CACHE_TTL_MS <= 0) return;
  const now = Date.now();
  prunePromediosCache(now);
  while (promediosCache.size >= PROMEDIOS_CACHE_MAX_ENTRIES) {
    const oldestKey = promediosCache.keys().next().value;
    if (!oldestKey) break;
    promediosCache.delete(oldestKey);
  }
  promediosCache.set(cacheKey, {
    expiresAt: now + PROMEDIOS_CACHE_TTL_MS,
    data: payload,
  });
}

function createEmptyProcesoPayload(
  procesoId: number,
  from?: string,
  to?: string
): ProcesoLecturasPayload {
  return {
    lecturas: [],
    parametros: [],
    proceso_id: procesoId,
    periodo: { inicio: from || '', fin: to || '' },
    total_lecturas: 0,
  };
}

async function canAccessSensorInstalado(scope: RequestScope, sensorInstaladoId: number): Promise<boolean> {
  const sensor = await prisma.sensor_instalado.findUnique({
    where: { id_sensor_instalado: sensorInstaladoId },
    select: {
      id_instalacion: true,
      instalacion: {
        select: {
          id_organizacion_sucursal: true,
        },
      },
    },
  });

  if (!sensor) return false;
  if (typeof sensor.id_instalacion !== 'number') return false;
  return canAccessFacility(scope, sensor.id_instalacion, sensor.instalacion?.id_organizacion_sucursal);
}

async function canAccessSensorInstaladoCached(
  scope: RequestScope,
  sensorInstaladoId: number
): Promise<boolean> {
  const cached = getCachedSensorAccess(scope, sensorInstaladoId);
  if (cached !== null) return cached;

  const allowed = await canAccessSensorInstalado(scope, sensorInstaladoId);
  setCachedSensorAccess(scope, sensorInstaladoId, allowed);
  return allowed;
}

async function getAccessibleSensorInstaladoIds(
  scope: RequestScope,
  sensorInstaladoIds: number[],
): Promise<number[]> {
  if (sensorInstaladoIds.length === 0) return [];

  const sensors = await prisma.sensor_instalado.findMany({
    where: {
      id_sensor_instalado: {
        in: sensorInstaladoIds,
      },
    },
    select: {
      id_sensor_instalado: true,
      id_instalacion: true,
      instalacion: {
        select: {
          id_organizacion_sucursal: true,
        },
      },
    },
  });

  const allowed = new Set<number>();

  for (const sensor of sensors) {
    const isAllowed =
      typeof sensor.id_instalacion === 'number' &&
      canAccessFacility(scope, sensor.id_instalacion, sensor.instalacion?.id_organizacion_sucursal);

    setCachedSensorAccess(scope, sensor.id_sensor_instalado, isAllowed);
    if (isAllowed) {
      allowed.add(sensor.id_sensor_instalado);
    }
  }

  return sensorInstaladoIds.filter((id) => allowed.has(id));
}

async function buildProcesoLecturasPayload(
  procesoId: number,
  from?: string,
  to?: string,
  scope?: RequestScope,
  options: BuildProcesoPayloadOptions = {}
): Promise<ProcesoLecturasPayload> {
  const includeLecturasDetalle = options.includeLecturasDetalle ?? true;
  const shouldUseCache = !includeLecturasDetalle;
  const cacheKey = buildProcesoPayloadCacheKey(
    procesoId,
    from,
    to,
    scope,
    includeLecturasDetalle
  );
  if (shouldUseCache) {
    const cachedPayload = getCachedProcesoPayload(cacheKey);
    if (cachedPayload) return cachedPayload;
  }

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
    const emptyPayload = createEmptyProcesoPayload(procesoId, from, to);
    if (shouldUseCache) {
      setProcesoPayloadCache(cacheKey, emptyPayload);
    }
    return emptyPayload;
  }

  const sensores = await prisma.sensor_instalado.findMany({
    where: {
      id_instalacion: { in: instalacionIds },
    },
    select: {
      id_sensor_instalado: true,
      id_sensor: true,
      id_instalacion: true,
      catalogo_sensores: {
        select: {
          nombre: true,
          unidad_medida: true,
        },
      },
    },
  });

  const sensorById = new Map(
    sensores.map((sensor) => [sensor.id_sensor_instalado, sensor])
  );

  const sensorIds = sensores.map((sensor) => sensor.id_sensor_instalado);

  if (sensorIds.length === 0) {
    const emptyPayload = createEmptyProcesoPayload(procesoId, from, to);
    if (shouldUseCache) {
      setProcesoPayloadCache(cacheKey, emptyPayload);
    }
    return emptyPayload;
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
    select: {
      id_lectura: true,
      id_sensor_instalado: true,
      valor: true,
      fecha: true,
      hora: true,
    },
    orderBy: [
      { fecha: 'desc' },
      { hora: 'desc' },
    ],
  });

  type ParametroAccumulator = ParametroMonitoreoResponse & {
    _sum: number;
    _count: number;
  };

  const lecturas: ProcesoLecturaResponse[] = [];
  const parametroMap = new Map<number, ParametroAccumulator>();

  for (const lectura of lecturasRaw) {
    const sensor = sensorById.get(lectura.id_sensor_instalado);
    if (!sensor) continue;

    const valor = Number(lectura.valor);
    const timestamp = combineFechaHoraISO(lectura.fecha as Date, lectura.hora as Date);
    const instalacionId = typeof sensor.id_instalacion === 'number' ? sensor.id_instalacion : undefined;
    const sensorName = sensor.catalogo_sensores?.nombre ?? `Sensor ${lectura.id_sensor_instalado}`;
    const unidadMedida = sensor.catalogo_sensores?.unidad_medida ?? '';

    if (includeLecturasDetalle) {
      lecturas.push({
        id_lectura: lectura.id_lectura,
        id_sensor_instalado: lectura.id_sensor_instalado,
        valor,
        fecha: lectura.fecha,
        hora: lectura.hora,
        timestamp,
        id_instalacion: instalacionId,
        nombre_instalacion: instalacionId ? instalacionById.get(instalacionId) : undefined,
        nombre_sensor: sensorName,
        tipo_sensor: sensorName,
        unidad_medida: unidadMedida || undefined,
      });
    }

    const key = sensor.id_sensor;
    let parametro = parametroMap.get(key);

    if (!parametro) {
      parametro = {
        id_parametro: key,
        nombre_parametro: sensor.catalogo_sensores?.nombre ?? `Sensor ${sensor.id_sensor}`,
        unidad_medida: unidadMedida,
        valor_actual: valor,
        estado: 'normal',
        ultima_lectura: timestamp,
        promedio: 0,
        alertas_count: 0,
        lecturas: [],
        _sum: 0,
        _count: 0,
      };
      parametroMap.set(key, parametro);
    }

    parametro._sum += valor;
    parametro._count += 1;
    parametro.lecturas.push({
      valor,
      timestamp,
      estado: 'normal',
    });

    if (parametro._count === 1) {
      parametro.valor_actual = valor;
      parametro.ultima_lectura = timestamp;
    }
  }

  const parametros: ParametroMonitoreoResponse[] = Array.from(parametroMap.values()).map((parametro) => {
    const promedio = parametro._count > 0 ? parametro._sum / parametro._count : 0;
    return {
      id_parametro: parametro.id_parametro,
      nombre_parametro: parametro.nombre_parametro,
      unidad_medida: parametro.unidad_medida,
      valor_actual: parametro.valor_actual,
      estado: parametro.estado,
      ultima_lectura: parametro.ultima_lectura,
      promedio: Number(promedio.toFixed(2)),
      alertas_count: parametro.alertas_count,
      lecturas: parametro.lecturas,
    };
  });

  const payload: ProcesoLecturasPayload = {
    lecturas,
    parametros,
    proceso_id: procesoId,
    periodo: { inicio: from || '', fin: to || '' },
    total_lecturas: lecturasRaw.length,
  };

  if (shouldUseCache) {
    setProcesoPayloadCache(cacheKey, payload);
  }
  return payload;
}

export async function getLecturas(req: FastifyRequest, reply: FastifyReply) {
  try {
    const scope = await requireRequestScope(req, reply);
    if (!scope) return;

    const q = normalizeRangeQuery(req.query as any);
    const sensorAllowed = await canAccessSensorInstaladoCached(scope, q.sensorInstaladoId);
    if (!sensorAllowed) {
      return reply.status(403).send({ error: 'No tiene acceso a este sensor instalado' });
    }

    let query = `
      SELECT l.id_lectura, l.id_sensor_instalado, l.valor,
             TIMESTAMP(l.fecha, l.hora) AS tomada_en,
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
    query = appendDateTimeRangeSqlCondition(query, params, {
      from: q.from,
      to: q.to,
      fechaColumn: 'l.fecha',
      horaColumn: 'l.hora',
    });

    query += ` ORDER BY l.fecha DESC, l.hora DESC LIMIT ?`;
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

export async function createLecturas(req: FastifyRequest, reply: FastifyReply) {
  try {
    if (!canIngestLecturas(req)) {
      return reply.status(401).send({ error: 'No autorizado para insertar lecturas' });
    }

    const payload = normalizeCreateLecturasRequest(req.body as any);
    const requestedSensorIds = [...new Set(
      payload.lecturas
        .map((item) => item.sensorInstaladoId ?? item.id_sensor_instalado ?? item.sensor_instalado_id ?? 0)
        .filter((value) => Number.isInteger(value) && value > 0),
    )];

    const sensors = await prisma.sensor_instalado.findMany({
      where: {
        id_sensor_instalado: { in: requestedSensorIds },
      },
      select: {
        id_sensor_instalado: true,
        id_instalacion: true,
        catalogo_sensores: {
          select: {
            nombre: true,
            unidad_medida: true,
          },
        },
      },
    });

    const sensorById = new Map(
      sensors.map((sensor) => [sensor.id_sensor_instalado, sensor]),
    );

    const missingSensorIds = requestedSensorIds.filter((sensorId) => !sensorById.has(sensorId));
    if (missingSensorIds.length > 0) {
      return reply.status(404).send({
        error: `Sensores instalados no encontrados: ${missingSensorIds.join(', ')}`,
      });
    }

    const createdLecturas: CreateLecturaRecord[] = [];

    for (const item of payload.lecturas) {
      const sensorId = item.sensorInstaladoId ?? item.id_sensor_instalado ?? item.sensor_instalado_id;
      if (!sensorId) {
        return reply.status(400).send({ error: 'sensorInstaladoId es obligatorio' });
      }

      const sensor = sensorById.get(sensorId);
      if (!sensor) {
        return reply.status(404).send({ error: `Sensor instalado ${sensorId} no encontrado` });
      }

      const timestamp = resolveCreateLecturaTimestamp(item);
      if (Number.isNaN(timestamp.getTime())) {
        return reply.status(400).send({ error: `Timestamp invalido para el sensor ${sensorId}` });
      }

      const { fecha, hora } = buildLecturaDateParts(timestamp);
      const created = await prisma.$transaction(async (tx) => {
        const lectura = await tx.lectura.create({
          data: {
            id_sensor_instalado: sensorId,
            valor: item.valor,
            fecha,
            hora,
          },
          select: {
            id_lectura: true,
            id_sensor_instalado: true,
            valor: true,
            fecha: true,
            hora: true,
          },
        });

        await tx.sensor_instalado.update({
          where: { id_sensor_instalado: sensorId },
          data: { id_lectura: lectura.id_lectura },
        });

        return lectura;
      });

      createdLecturas.push({
        id_lectura: created.id_lectura,
        id_sensor_instalado: created.id_sensor_instalado,
        sensor_instalado_id: created.id_sensor_instalado,
        valor: Number(created.valor),
        tomada_en: combineFechaHoraISO(created.fecha as Date, created.hora as Date),
        fecha: created.fecha,
        hora: created.hora,
        id_instalacion: sensor.id_instalacion ?? null,
        tipo_medida: sensor.catalogo_sensores.nombre,
        unidad_medida: sensor.catalogo_sensores.unidad_medida ?? null,
      });
    }

    invalidateLecturaReadCaches();

    if (payload.single && createdLecturas.length === 1) {
      return reply.status(201).send(createdLecturas[0]);
    }

    return reply.status(201).send({
      total: createdLecturas.length,
      lecturas: createdLecturas,
    });
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
    const includeLecturasDetalle = normalizeBoolean(
      query.include_lecturas ?? query.includeLecturas,
      true
    );

    if (!procesoId) {
      return reply.status(400).send({ error: 'Parámetro proceso o id_proceso es obligatorio' });
    }

    const payload = await buildProcesoLecturasPayload(procesoId, from, to, scope, {
      includeLecturasDetalle,
    });
    reply.header('Cache-Control', 'private, max-age=5, stale-while-revalidate=15');
    reply.header('Vary', 'Authorization, Cookie');
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
    const includeLecturasDetalle = normalizeBoolean(
      query.include_lecturas ?? query.includeLecturas,
      true
    );

    if (!procesoId) {
      return reply.status(400).send({ error: 'ID de proceso requerido' });
    }

    const payload = await buildProcesoLecturasPayload(procesoId, from, to, scope, {
      includeLecturasDetalle,
    });
    reply.header('Cache-Control', 'private, max-age=5, stale-while-revalidate=15');
    reply.header('Vary', 'Authorization, Cookie');
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
    const sensorAllowed = await canAccessSensorInstaladoCached(scope, q.sensorInstaladoId);
    if (!sensorAllowed) {
      return reply.status(403).send({ error: 'No tiene acceso a este sensor instalado' });
    }

    let query = `
      SELECT rlh.id_resumen, rlh.id_sensor_instalado, rlh.promedio, rlh.registros,
             TIMESTAMP(rlh.fecha, rlh.hora) AS fecha_hora,
             rlh.fecha, rlh.hora
      FROM resumen_lectura_horaria rlh
      WHERE rlh.id_sensor_instalado = ?
    `;
    const params: any[] = [q.sensorInstaladoId];
    query = appendDateTimeRangeSqlCondition(query, params, {
      from: q.from,
      to: q.to,
      fechaColumn: 'rlh.fecha',
      horaColumn: 'rlh.hora',
    });

    query += ` ORDER BY rlh.fecha ASC, rlh.hora ASC`;

    let rows = await prisma.$queryRawUnsafe<any[]>(query, ...params);
    if (rows.length === 0) {
      const fallback = await queryLecturaBuckets(q.sensorInstaladoId, 60, q.from, q.to);
      rows = fallback.map((row) => {
        const timestamp = new Date(row.timestamp);
        const parts = splitTimestampParts(timestamp);
        return {
          id_resumen: 0,
          id_sensor_instalado: row.id_sensor_instalado,
          promedio: row.promedio,
          registros: row.muestras,
          fecha_hora: timestamp,
          fecha: parts.fecha,
          hora: parts.hora,
        };
      });
    }

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
    const sensorAllowed = await canAccessSensorInstaladoCached(scope, q.sensorInstaladoId);
    if (!sensorAllowed) {
      return reply.status(403).send({ error: 'No tiene acceso a este sensor instalado' });
    }

    const cacheKey = buildPromediosCacheKey(scope, q);
    const cached = getCachedPromedios(cacheKey);
    if (cached) {
      reply.header('Cache-Control', 'private, max-age=5, stale-while-revalidate=15');
      reply.header('Vary', 'Authorization, Cookie');
      reply.header('X-Data-Source', 'cache');
      return reply.send(cached);
    }

    const inflight = promediosInflight.get(cacheKey);
    if (inflight) {
      const shared = await inflight;
      reply.header('Cache-Control', 'private, max-age=5, stale-while-revalidate=15');
      reply.header('Vary', 'Authorization, Cookie');
      reply.header('X-Data-Source', 'cache-inflight');
      return reply.send(shared);
    }

    const computePromise = (async (): Promise<PromediosPayloadItem[]> => {
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
        query = appendDateTimeRangeSqlCondition(query, params, {
          from: q.from,
          to: q.to,
          fechaColumn: 'l.fecha',
          horaColumn: 'l.hora',
        });

        query += ` GROUP BY l.id_sensor_instalado, ts ORDER BY ts ASC`;

        const rows = await prisma.$queryRawUnsafe<any[]>(query, ...params);
        return rows.map((row) => ({
          id_sensor_instalado: Number(row.id_sensor_instalado),
          bucket_minutes: q.bucketMinutes,
          timestamp: new Date(row.ts).toISOString(),
          promedio: Number(row.promedio),
          muestras: Number(row.muestras),
        }));
      }

      if (q.granularity === '15min') {
        let query = `
          SELECT p.id_sensor_instalado,
                 TIMESTAMP(p.fecha, p.hora) AS ts,
                 p.promedio
          FROM promedio p
          WHERE p.id_sensor_instalado = ?
        `;
        const params: any[] = [q.sensorInstaladoId];
        query = appendDateTimeRangeSqlCondition(query, params, {
          from: q.from,
          to: q.to,
          fechaColumn: 'p.fecha',
          horaColumn: 'p.hora',
        });
        query += ` ORDER BY p.fecha ASC, p.hora ASC`;

        let rows = await prisma.$queryRawUnsafe<any[]>(query, ...params);
        if (rows.length === 0) {
          rows = await queryLecturaBuckets(q.sensorInstaladoId, 15, q.from, q.to);
        }

        return rows.map((row) => ({
          id_sensor_instalado: Number(row.id_sensor_instalado),
          timestamp: new Date(row.ts ?? row.timestamp).toISOString(),
          promedio: Number(row.promedio),
        }));
      }

      let query = `
        SELECT rlh.id_sensor_instalado,
               TIMESTAMP(rlh.fecha, rlh.hora) AS ts,
               rlh.promedio
        FROM resumen_lectura_horaria rlh
        WHERE rlh.id_sensor_instalado = ?
      `;
      const params: any[] = [q.sensorInstaladoId];
      query = appendDateTimeRangeSqlCondition(query, params, {
        from: q.from,
        to: q.to,
        fechaColumn: 'rlh.fecha',
        horaColumn: 'rlh.hora',
      });
      query += ` ORDER BY rlh.fecha ASC, rlh.hora ASC`;

      let rows = await prisma.$queryRawUnsafe<any[]>(query, ...params);
      if (rows.length === 0) {
        rows = (await queryLecturaBuckets(q.sensorInstaladoId, 60, q.from, q.to)).map((row) => ({
          id_sensor_instalado: row.id_sensor_instalado,
          ts: row.timestamp,
          promedio: row.promedio,
        }));
      }
      return rows.map((row) => ({
        id_sensor_instalado: Number(row.id_sensor_instalado),
        timestamp: new Date(row.ts).toISOString(),
        promedio: Number(row.promedio),
      }));
    })();

    promediosInflight.set(cacheKey, computePromise);
    try {
      const payload = await computePromise;
      setCachedPromedios(cacheKey, payload);
      reply.header('Cache-Control', 'private, max-age=5, stale-while-revalidate=15');
      reply.header('Vary', 'Authorization, Cookie');
      reply.header('X-Data-Source', 'db');
      return reply.send(payload);
    } finally {
      promediosInflight.delete(cacheKey);
    }
  } catch (error: any) {
    reply.status(400).send({ error: error.message });
  }
}

export async function getPromediosBatch(req: FastifyRequest, reply: FastifyReply) {
  try {
    const scope = await requireRequestScope(req, reply);
    if (!scope) return;

    const q = normalizePromediosBatchRequest(req.query as any);
    const uniqueSensorIds = [...new Set(q.sensorInstaladoIds)];
    const allowedSensorIds = await getAccessibleSensorInstaladoIds(scope, uniqueSensorIds);

    if (allowedSensorIds.length === 0) {
      return reply.status(403).send({ error: 'No tiene acceso a los sensores solicitados' });
    }

    const cacheKey = buildPromediosBatchCacheKey(scope, {
      sensorInstaladoIds: allowedSensorIds,
      bucketMinutes: q.bucketMinutes,
      from: q.from,
      to: q.to,
    });

    const cached = getCachedPromediosBatch(cacheKey);
    if (cached) {
      reply.header('Cache-Control', 'private, max-age=5, stale-while-revalidate=15');
      reply.header('Vary', 'Authorization, Cookie');
      reply.header('X-Data-Source', 'cache');
      return reply.send(cached);
    }

    const inflight = promediosBatchInflight.get(cacheKey);
    if (inflight) {
      const shared = await inflight;
      reply.header('Cache-Control', 'private, max-age=5, stale-while-revalidate=15');
      reply.header('Vary', 'Authorization, Cookie');
      reply.header('X-Data-Source', 'cache-inflight');
      return reply.send(shared);
    }

    const computePromise = (async (): Promise<PromediosBatchPayload> => {
      const points = await queryLecturaBucketsBatch(
        allowedSensorIds,
        q.bucketMinutes,
        q.from,
        q.to,
      );

      const grouped = new Map<number, PromediosPayloadItem[]>();
      for (const point of points) {
        const current = grouped.get(point.id_sensor_instalado) ?? [];
        current.push({
          id_sensor_instalado: point.id_sensor_instalado,
          timestamp: point.timestamp,
          promedio: point.promedio,
          muestras: point.muestras,
          bucket_minutes: q.bucketMinutes,
        });
        grouped.set(point.id_sensor_instalado, current);
      }

      return {
        bucket_minutes: q.bucketMinutes,
        total_sensores: allowedSensorIds.length,
        sensores: allowedSensorIds.map((sensorId) => ({
          id_sensor_instalado: sensorId,
          bucket_minutes: q.bucketMinutes,
          puntos: grouped.get(sensorId) ?? [],
        })),
      };
    })();

    promediosBatchInflight.set(cacheKey, computePromise);
    try {
      const payload = await computePromise;
      setCachedPromediosBatch(cacheKey, payload);
      reply.header('Cache-Control', 'private, max-age=5, stale-while-revalidate=15');
      reply.header('Vary', 'Authorization, Cookie');
      reply.header('X-Data-Source', 'db');
      return reply.send(payload);
    } finally {
      promediosBatchInflight.delete(cacheKey);
    }
  } catch (error: any) {
    reply.status(400).send({ error: error.message });
  }
}

export async function getReporteXML(req: FastifyRequest, reply: FastifyReply) {
  try {
    const scope = await requireRequestScope(req, reply);
    if (!scope) return;

    const q = normalizeRangeQuery(req.query as any);
    const sensorAllowed = await canAccessSensorInstaladoCached(scope, q.sensorInstaladoId);
    if (!sensorAllowed) {
      return reply.status(403).send({ error: 'No tiene acceso a este sensor instalado' });
    }

    let query = `
      SELECT l.id_lectura, l.id_sensor_instalado, l.valor,
             TIMESTAMP(l.fecha, l.hora) AS tomada_en
      FROM lectura l
      WHERE l.id_sensor_instalado = ?
    `;
    const params: any[] = [q.sensorInstaladoId];
    query = appendDateTimeRangeSqlCondition(query, params, {
      from: q.from,
      to: q.to,
      fechaColumn: 'l.fecha',
      horaColumn: 'l.hora',
    });

    query += ` ORDER BY l.fecha ASC, l.hora ASC`;

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
