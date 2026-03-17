import type { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../repositories/prisma.js';
import {
  createInstalacionSchema,
  updateInstalacionSchema,
  createCatalogoSensorSchema,
  updateCatalogoSensorSchema,
  createSensorInstaladoSchema,
  updateSensorInstaladoSchema
} from '../utils/validators.js';
import { normalizeOrganizacionSucursalId } from '../utils/normalize.utils.js';
import {
  buildInstalacionScopeWhere,
  canAccessBranch,
  canAccessFacility,
  canAccessOrganization,
  canManageResources,
  requireRequestScope,
  type RequestScope,
} from '../utils/access-control.js';

function toPositiveInt(value: unknown): number | null {
  const num = typeof value === 'string' ? Number(value) : (typeof value === 'number' ? value : NaN);
  if (!Number.isFinite(num)) return null;
  const parsed = Math.trunc(num);
  return parsed > 0 ? parsed : null;
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

type HttpError = Error & { statusCode: number };

function createHttpError(statusCode: number, message: string): HttpError {
  const error = new Error(message) as HttpError;
  error.statusCode = statusCode;
  return error;
}

function resolveHttpStatus(error: unknown, fallback = 400): number {
  const status = Number((error as any)?.statusCode);
  if (Number.isFinite(status) && status >= 400 && status < 600) return status;
  return fallback;
}

type ListCacheEntry<T> = {
  expiresAt: number;
  data: T;
};

const INSTALACIONES_LIST_CACHE_TTL_MS = Number(process.env.INSTALACIONES_LIST_CACHE_TTL_MS ?? 10_000);
const SENSORES_INSTALADOS_LIST_CACHE_TTL_MS = Number(process.env.SENSORES_INSTALADOS_LIST_CACHE_TTL_MS ?? 8_000);
const INSTALACIONES_LIST_CACHE_MAX_ENTRIES = 120;
const SENSORES_INSTALADOS_LIST_CACHE_MAX_ENTRIES = 180;

const instalacionesListCache = new Map<string, ListCacheEntry<any[]>>();
const sensoresInstaladosListCache = new Map<string, ListCacheEntry<any[]>>();
const instalacionesListInflight = new Map<string, Promise<any[]>>();
const sensoresInstaladosListInflight = new Map<string, Promise<any[]>>();

function buildScopeSignature(scope: RequestScope): string {
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

function getListCache<T>(store: Map<string, ListCacheEntry<T>>, cacheKey: string): T | null {
  const entry = store.get(cacheKey);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    store.delete(cacheKey);
    return null;
  }
  return entry.data;
}

function setListCache<T>(
  store: Map<string, ListCacheEntry<T>>,
  cacheKey: string,
  data: T,
  ttlMs: number,
  maxEntries: number
): void {
  if (ttlMs <= 0) return;
  const now = Date.now();

  for (const [key, entry] of store.entries()) {
    if (entry.expiresAt <= now) store.delete(key);
  }

  while (store.size >= maxEntries) {
    const oldestKey = store.keys().next().value;
    if (!oldestKey) break;
    store.delete(oldestKey);
  }

  store.set(cacheKey, {
    expiresAt: now + ttlMs,
    data,
  });
}

function buildInstalacionesListCacheKey(scope: RequestScope, branchId?: number | null, activo?: string): string {
  return `${buildScopeSignature(scope)}|branch:${branchId || 0}|activo:${activo ?? ''}`;
}

function buildSensoresInstaladosListCacheKey(scope: RequestScope, instalacionId?: number | null): string {
  return `${buildScopeSignature(scope)}|inst:${instalacionId || 0}`;
}

function invalidateInstalacionReadCaches(): void {
  instalacionesListCache.clear();
  sensoresInstaladosListCache.clear();
  instalacionesListInflight.clear();
  sensoresInstaladosListInflight.clear();
}

function serializeInstalacion(instalacion: any) {
  const proceso = instalacion.procesos;
  const sucursal = instalacion.organizacion_sucursal;
  const organizacion = sucursal?.organizacion;
  const sensores = Array.isArray(instalacion.sensor_instalado) ? instalacion.sensor_instalado : [];
  const tiposSensores = [...new Set(
    sensores
      .map((sensor: any) => String(
        sensor?.catalogo_sensores?.nombre ??
        sensor?.catalogo_sensores?.tipo_medida ??
        sensor?.tipo_medida ??
        sensor?.descripcion ??
        '',
      ).trim())
      .filter((value: string) => value.length > 0)
  )];
  const capacidadMaxima = toNullableNumber(instalacion.capacidad_maxima);
  const capacidadActual = toNullableNumber(instalacion.capacidad_actual);
  const capacidadDisponible = (
    capacidadMaxima !== null && capacidadActual !== null
      ? Math.max(0, capacidadMaxima - capacidadActual)
      : null
  );
  const porcentajeOcupacion = (
    capacidadMaxima !== null && capacidadActual !== null && capacidadMaxima > 0
      ? Number(((capacidadActual / capacidadMaxima) * 100).toFixed(2))
      : null
  );

  return {
    ...instalacion,
    id_sucursal: instalacion.id_organizacion_sucursal,
    id_empresa_sucursal: instalacion.id_organizacion_sucursal,
    id_organizacion: sucursal?.id_organizacion ?? null,
    nombre: instalacion.nombre_instalacion,
    tipo: instalacion.tipo_uso,
    codigo: instalacion.codigo_instalacion,
    ubicacion: instalacion.ubicacion,
    latitud: toNullableNumber(instalacion.latitud),
    longitud: toNullableNumber(instalacion.longitud),
    capacidad_maxima: capacidadMaxima,
    capacidad_actual: capacidadActual,
    capacidad_disponible: capacidadDisponible,
    porcentaje_ocupacion: porcentajeOcupacion,
    capacidad: capacidadMaxima,
    volumen_agua_m3: toNullableNumber(instalacion.volumen_agua_m3),
    profundidad_m: toNullableNumber(instalacion.profundidad_m),
    total_sensores: sensores.length,
    tipos_sensores: tiposSensores,
    sucursal_nombre: sucursal?.nombre_sucursal ?? null,
    nombre_organizacion: organizacion?.nombre ?? null,
    nombre_empresa: organizacion?.nombre ?? sucursal?.nombre_sucursal ?? null,
    nombre_proceso: proceso?.nombre_proceso ?? (proceso ? `Proceso ${proceso.id_proceso}` : null),
    nombre_especie: proceso?.especies?.nombre ?? null,
    activo: instalacion.estado_operativo === 'activo',
    created_at: instalacion.fecha_instalacion,
    updated_at: instalacion.fecha_ultima_inspeccion ?? instalacion.fecha_instalacion,
  };
}

function serializeCatalogoSensor(sensor: any) {
  return {
    ...sensor,
    sensor: sensor.nombre,
    tipo_medida: sensor.nombre,
    unidad: sensor.unidad_medida,
  };
}

const SENSOR_MAX_DIAS_SIN_DATOS = 21;
const SENSOR_MAX_DIAS_MANTENIMIENTO = 90;

type SensorEstadoOperativo = 'activo' | 'inactivo' | 'mantenimiento';

function mapFrontendStatusToDb(value: unknown): SensorEstadoOperativo | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'active' || normalized === 'activo') return 'activo';
  if (normalized === 'inactive' || normalized === 'inactivo' || normalized === 'offline') return 'inactivo';
  if (normalized === 'maintenance' || normalized === 'mantenimiento') return 'mantenimiento';
  return undefined;
}

function mapDbStatusToFrontend(value: SensorEstadoOperativo): 'active' | 'inactive' | 'maintenance' {
  if (value === 'mantenimiento') return 'maintenance';
  if (value === 'inactivo') return 'inactive';
  return 'active';
}

function combineFechaHora(fecha?: Date | null, hora?: Date | null): Date | null {
  if (!fecha) return null;
  const result = new Date(fecha);
  if (hora) {
    result.setHours(hora.getHours(), hora.getMinutes(), hora.getSeconds(), hora.getMilliseconds());
  }
  return result;
}

function diffDays(fromDate: Date, toDate = new Date()): number {
  const msDiff = toDate.getTime() - fromDate.getTime();
  return Math.max(0, Math.floor(msDiff / (1000 * 60 * 60 * 24)));
}

function resolveSensorVisualState(sensor: any) {
  const now = new Date();
  const estadoOperativo: SensorEstadoOperativo = sensor.estado_operativo ?? 'activo';
  const latestReading = Array.isArray(sensor.lectura) ? sensor.lectura[0] : undefined;
  const ultimaLecturaAt = combineFechaHora(latestReading?.fecha ?? null, latestReading?.hora ?? null);
  const baseFechaDatos = ultimaLecturaAt ?? (sensor.fecha_instalada ? new Date(sensor.fecha_instalada) : null);
  const diasSinDatos = baseFechaDatos ? diffDays(baseFechaDatos, now) : null;
  const diasMantenimiento = sensor.fecha_mantenimiento ? diffDays(new Date(sensor.fecha_mantenimiento), now) : null;

  const noDataTimeout = diasSinDatos !== null && diasSinDatos > SENSOR_MAX_DIAS_SIN_DATOS;
  const maintenanceTimeout = (
    estadoOperativo === 'mantenimiento' &&
    diasMantenimiento !== null &&
    diasMantenimiento > SENSOR_MAX_DIAS_MANTENIMIENTO
  );

  const estadoVisual: SensorEstadoOperativo = (noDataTimeout || maintenanceTimeout) ? 'inactivo' : estadoOperativo;

  return {
    estadoOperativo,
    estadoVisual,
    estadoFrontend: mapDbStatusToFrontend(estadoVisual),
    ultimaLecturaAt,
    diasSinDatos,
    diasMantenimiento,
    noDataTimeout,
    maintenanceTimeout,
  };
}

const sensorInstaladoRelationSelect = {
  id_sensor_instalado: true,
  id_instalacion: true,
  id_sensor: true,
  fecha_instalada: true,
  descripcion: true,
  catalogo_sensores: {
    select: {
      id_sensor: true,
      nombre: true,
      descripcion: true,
      modelo: true,
      marca: true,
      rango_medicion: true,
      unidad_medida: true,
    },
  },
};

const sensorInstaladoListSummarySelect = {
  id_sensor_instalado: true,
  catalogo_sensores: {
    select: {
      nombre: true,
    },
  },
};

const instalacionListSelect = {
  id_instalacion: true,
  id_organizacion_sucursal: true,
  nombre_instalacion: true,
  codigo_instalacion: true,
  fecha_instalacion: true,
  estado_operativo: true,
  descripcion: true,
  tipo_uso: true,
  ubicacion: true,
  latitud: true,
  longitud: true,
  capacidad_maxima: true,
  capacidad_actual: true,
  volumen_agua_m3: true,
  profundidad_m: true,
  fecha_ultima_inspeccion: true,
  responsable_operativo: true,
  contacto_emergencia: true,
  id_proceso: true,
  organizacion_sucursal: {
    select: {
      id_organizacion_sucursal: true,
      id_organizacion: true,
      nombre_sucursal: true,
      organizacion: {
        select: {
          id_organizacion: true,
          nombre: true,
        },
      },
    },
  },
  sensor_instalado: {
    select: sensorInstaladoListSummarySelect,
  },
  procesos: {
    select: {
      id_proceso: true,
      nombre_proceso: true,
      especies: {
        select: {
          nombre: true,
        },
      },
    },
  },
};

const sensorInstaladoSelect = {
  ...sensorInstaladoRelationSelect,
  instalacion: {
    select: {
      id_instalacion: true,
      id_organizacion_sucursal: true,
      nombre_instalacion: true,
    },
  },
  lectura: {
    orderBy: [{ fecha: 'desc' as const }, { hora: 'desc' as const }],
    take: 1,
    select: {
      id_lectura: true,
      fecha: true,
      hora: true,
      valor: true,
    },
  },
};

function serializeSensorInstalado(sensor: any) {
  const visual = resolveSensorVisualState(sensor);
  const tieneInstalacion = typeof sensor.id_instalacion === 'number' && sensor.id_instalacion > 0;

  return {
    ...sensor,
    id: sensor.id_sensor_instalado,
    id_instalacion: sensor.id_instalacion ?? null,
    instalacion_nombre: sensor.instalacion?.nombre_instalacion ?? null,
    tiene_instalacion: tieneInstalacion,
    requiere_asignacion_instalacion: !tieneInstalacion,
    tipo_medida: sensor.catalogo_sensores?.nombre ?? sensor.tipo_medida ?? undefined,
    unidad_medida: sensor.catalogo_sensores?.unidad_medida ?? sensor.unidad_medida ?? undefined,
    estado_operativo: visual.estadoOperativo,
    estado_visual: visual.estadoVisual,
    status: visual.estadoFrontend,
    activo: visual.estadoFrontend === 'active',
    ultima_lectura_at: visual.ultimaLecturaAt ? visual.ultimaLecturaAt.toISOString() : null,
    dias_sin_datos: visual.diasSinDatos,
    dias_en_mantenimiento: visual.diasMantenimiento,
    regla_inactividad_sin_datos: visual.noDataTimeout,
    regla_inactividad_mantenimiento: visual.maintenanceTimeout,
    created_at: sensor.fecha_instalada,
    updated_at: visual.ultimaLecturaAt ?? sensor.fecha_instalada,
    name: sensor.catalogo_sensores?.nombre ?? sensor.descripcion,
  };
}

async function resolveCatalogoSensorId(raw: any): Promise<number> {
  const explicitId = toPositiveInt(raw.id_sensor);
  if (explicitId) return explicitId;

  const nombre = String(raw.tipo_medida ?? raw.type ?? raw.nombre ?? '').trim();
  if (!nombre) {
    throw new Error('id_sensor o tipo_medida es obligatorio');
  }

  const existing = await prisma.catalogo_sensores.findFirst({
    where: { nombre },
  });

  if (existing) {
    return existing.id_sensor;
  }

  const created = await prisma.catalogo_sensores.create({
    data: {
      nombre,
      descripcion: String(raw.descripcion_sensor ?? raw.descripcion ?? `Sensor ${nombre}`),
      unidad_medida: raw.unidad_medida ?? raw.unidad ?? null,
      modelo: raw.modelo ?? null,
      marca: raw.marca ?? null,
      rango_medicion: raw.rango_medicion ?? null,
    },
  });

  return created.id_sensor;
}

async function resolveInstalacionSucursalId(params: {
  scope: RequestScope;
  rawSucursalId?: unknown;
  rawOrganizacionId?: unknown;
}): Promise<number> {
  const rawSucursalId = params.rawSucursalId;
  const rawOrganizacionId = params.rawOrganizacionId;

  if (rawSucursalId !== undefined && rawSucursalId !== null && rawSucursalId !== '') {
    const normalizedSucursalId = normalizeOrganizacionSucursalId(Number(rawSucursalId));
    if (!Number.isFinite(normalizedSucursalId) || normalizedSucursalId <= 0) {
      throw createHttpError(400, 'Sucursal inválida');
    }
    if (!canAccessBranch(params.scope, normalizedSucursalId)) {
      throw createHttpError(403, 'No tiene acceso a la sucursal seleccionada');
    }
    return normalizedSucursalId;
  }

  const organizacionId = toPositiveInt(rawOrganizacionId);
  if (!organizacionId) {
    throw createHttpError(400, 'Debe enviar id_organizacion_sucursal, id_empresa_sucursal o id_organizacion');
  }

  if (!canAccessOrganization(params.scope, organizacionId)) {
    throw createHttpError(403, 'No tiene acceso a la organización seleccionada');
  }

  const sucursalActiva = await prisma.organizacion_sucursal.findFirst({
    where: {
      id_organizacion: organizacionId,
      estado: 'activa',
    },
    select: {
      id_organizacion_sucursal: true,
    },
    orderBy: {
      id_organizacion_sucursal: 'asc',
    },
  });

  if (sucursalActiva?.id_organizacion_sucursal) {
    return sucursalActiva.id_organizacion_sucursal;
  }

  const primeraSucursal = await prisma.organizacion_sucursal.findFirst({
    where: {
      id_organizacion: organizacionId,
    },
    select: {
      id_organizacion_sucursal: true,
    },
    orderBy: {
      id_organizacion_sucursal: 'asc',
    },
  });

  if (primeraSucursal?.id_organizacion_sucursal) {
    return primeraSucursal.id_organizacion_sucursal;
  }

  const organizacion = await prisma.organizacion.findUnique({
    where: { id_organizacion: organizacionId },
    select: {
      id_organizacion: true,
      nombre: true,
      telefono: true,
      correo: true,
      direccion: true,
      id_estado: true,
      id_municipio: true,
      latitud: true,
      longitud: true,
    },
  });

  if (!organizacion) {
    throw createHttpError(404, 'Organización no encontrada');
  }

  const sucursalCreada = await prisma.organizacion_sucursal.create({
    data: {
      id_organizacion: organizacionId,
      nombre_sucursal: `Sucursal principal - ${organizacion.nombre}`,
      estado: 'activa',
      telefono_sucursal: organizacion.telefono ?? null,
      correo_sucursal: organizacion.correo ?? null,
      direccion_sucursal: organizacion.direccion ?? null,
      id_estado: organizacion.id_estado ?? null,
      id_municipio: organizacion.id_municipio ?? null,
      latitud: organizacion.latitud ?? null,
      longitud: organizacion.longitud ?? null,
    },
    select: {
      id_organizacion_sucursal: true,
    },
  });

  return sucursalCreada.id_organizacion_sucursal;
}

// INSTALACIONES
export async function createInstalacion(req: FastifyRequest, reply: FastifyReply) {
  try {
    const scope = await requireRequestScope(req, reply);
    if (!scope) return;
    if (!canManageResources(scope)) {
      return reply.status(403).send({ error: 'No tiene permisos para crear instalaciones' });
    }

    const raw = (req.body || {}) as any;
    const body = createInstalacionSchema.parse({
      ...raw,
      estado_operativo: raw.estado_operativo ?? (raw.activo === false ? 'inactivo' : 'activo'),
      id_organizacion: raw.id_organizacion,
      codigo_instalacion: raw.codigo_instalacion ?? raw.codigo,
      ubicacion: raw.ubicacion ?? raw.direccion,
      latitud: raw.latitud ?? raw.latitude,
      longitud: raw.longitud ?? raw.longitude,
      capacidad_maxima: raw.capacidad_maxima ?? raw.capacidad,
      capacidad_actual: raw.capacidad_actual,
      volumen_agua_m3: raw.volumen_agua_m3,
      profundidad_m: raw.profundidad_m,
      responsable_operativo: raw.responsable_operativo,
      contacto_emergencia: raw.contacto_emergencia,
    });

    const sucursalId = await resolveInstalacionSucursalId({
      scope,
      rawSucursalId: body.id_organizacion_sucursal ?? body.id_empresa_sucursal,
      rawOrganizacionId: body.id_organizacion,
    });

    const instalacion = await prisma.instalacion.create({
      data: {
        id_organizacion_sucursal: sucursalId,
        nombre_instalacion: body.nombre_instalacion,
        codigo_instalacion: body.codigo_instalacion,
        fecha_instalacion: body.fecha_instalacion,
        estado_operativo: body.estado_operativo,
        descripcion: body.descripcion,
        tipo_uso: body.tipo_uso,
        ubicacion: body.ubicacion,
        latitud: body.latitud,
        longitud: body.longitud,
        capacidad_maxima: body.capacidad_maxima,
        capacidad_actual: body.capacidad_actual,
        volumen_agua_m3: body.volumen_agua_m3,
        profundidad_m: body.profundidad_m,
        fecha_ultima_inspeccion: body.fecha_ultima_inspeccion,
        responsable_operativo: body.responsable_operativo,
        contacto_emergencia: body.contacto_emergencia,
        id_proceso: body.id_proceso,
      },
      include: {
        organizacion_sucursal: {
          include: {
            organizacion: true,
          },
        },
        procesos: {
          include: {
            especies: true,
          },
        },
      },
    });
    invalidateInstalacionReadCaches();
    reply.status(201).send(serializeInstalacion(instalacion));
  } catch (error: any) {
    reply.status(resolveHttpStatus(error, 400)).send({ error: error.message });
  }
}

export async function getInstalaciones(
  req: FastifyRequest<{ Querystring: { id_sucursal?: string; id_organizacion_sucursal?: string; id_empresa_sucursal?: string; activo?: string } }>,
  reply: FastifyReply
) {
  try {
    const scope = await requireRequestScope(req, reply);
    if (!scope) return;

    const filters: any[] = [];

    const scopeWhere = buildInstalacionScopeWhere(scope);
    if (Object.keys(scopeWhere).length > 0) {
      filters.push(scopeWhere);
    }

    const branchId = toPositiveInt(req.query.id_sucursal ?? req.query.id_organizacion_sucursal ?? req.query.id_empresa_sucursal);
    if (branchId) {
      filters.push({ id_organizacion_sucursal: normalizeOrganizacionSucursalId(branchId) });
    }

    if (req.query.activo !== undefined) {
      filters.push({ estado_operativo: req.query.activo === 'true' ? 'activo' : 'inactivo' });
    }

    const cacheKey = buildInstalacionesListCacheKey(scope, branchId, req.query.activo);
    const cached = getListCache(instalacionesListCache, cacheKey);
    if (cached) {
      reply.header('Cache-Control', 'private, max-age=5, stale-while-revalidate=15');
      reply.header('Vary', 'Authorization, Cookie');
      reply.header('X-Data-Source', 'cache');
      return reply.send(cached);
    }

    const inflight = instalacionesListInflight.get(cacheKey);
    if (inflight) {
      const shared = await inflight;
      reply.header('Cache-Control', 'private, max-age=5, stale-while-revalidate=15');
      reply.header('Vary', 'Authorization, Cookie');
      reply.header('X-Data-Source', 'cache-inflight');
      return reply.send(shared);
    }

    const where = filters.length > 1 ? { AND: filters } : (filters[0] ?? {});

    const computePromise = (async () => {
      const instalaciones = await prisma.instalacion.findMany({
        where,
        select: instalacionListSelect,
        orderBy: {
          fecha_instalacion: 'desc',
        },
      });
      return instalaciones.map(serializeInstalacion);
    })();

    instalacionesListInflight.set(cacheKey, computePromise);
    try {
      const payload = await computePromise;
      setListCache(
        instalacionesListCache,
        cacheKey,
        payload,
        INSTALACIONES_LIST_CACHE_TTL_MS,
        INSTALACIONES_LIST_CACHE_MAX_ENTRIES
      );
      reply.header('Cache-Control', 'private, max-age=5, stale-while-revalidate=15');
      reply.header('Vary', 'Authorization, Cookie');
      reply.header('X-Data-Source', 'db');
      return reply.send(payload);
    } finally {
      instalacionesListInflight.delete(cacheKey);
    }
  } catch (error: any) {
    reply.status(500).send({ error: error.message });
  }
}

export async function getInstalacionById(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  try {
    const scope = await requireRequestScope(req, reply);
    if (!scope) return;

    const id = parseInt(req.params.id);
    const instalacion = await prisma.instalacion.findUnique({
      where: { id_instalacion: id },
      include: {
        organizacion_sucursal: {
          include: {
            organizacion: true,
          },
        },
        sensor_instalado: { select: sensorInstaladoRelationSelect },
        procesos: {
          include: {
            especies: true,
          },
        },
      }
    });
    
    if (!instalacion) {
      return reply.status(404).send({ error: 'Instalación no encontrada' });
    }

    if (!canAccessFacility(scope, instalacion.id_instalacion, instalacion.id_organizacion_sucursal)) {
      return reply.status(403).send({ error: 'No tiene acceso a esta instalación' });
    }
    
    reply.send(serializeInstalacion(instalacion));
  } catch (error: any) {
    reply.status(500).send({ error: error.message });
  }
}

export async function updateInstalacion(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  try {
    const scope = await requireRequestScope(req, reply);
    if (!scope) return;
    if (!canManageResources(scope)) {
      return reply.status(403).send({ error: 'No tiene permisos para actualizar instalaciones' });
    }

    const id = parseInt(req.params.id);
    const existing = await prisma.instalacion.findUnique({
      where: { id_instalacion: id },
      select: { id_instalacion: true, id_organizacion_sucursal: true },
    });

    if (!existing) {
      return reply.status(404).send({ error: 'Instalación no encontrada' });
    }

    if (!canAccessFacility(scope, existing.id_instalacion, existing.id_organizacion_sucursal)) {
      return reply.status(403).send({ error: 'No tiene acceso a esta instalación' });
    }

    const raw = (req.body || {}) as any;
    const body = updateInstalacionSchema.parse({
      ...raw,
      estado_operativo: raw.estado_operativo ?? (raw.activo === true ? 'activo' : raw.activo === false ? 'inactivo' : undefined),
      id_organizacion: raw.id_organizacion,
      codigo_instalacion: raw.codigo_instalacion ?? raw.codigo,
      ubicacion: raw.ubicacion ?? raw.direccion,
      latitud: raw.latitud ?? raw.latitude,
      longitud: raw.longitud ?? raw.longitude,
      capacidad_maxima: raw.capacidad_maxima ?? raw.capacidad,
      capacidad_actual: raw.capacidad_actual,
      volumen_agua_m3: raw.volumen_agua_m3,
      profundidad_m: raw.profundidad_m,
      responsable_operativo: raw.responsable_operativo,
      contacto_emergencia: raw.contacto_emergencia,
    });

    const data: any = {};
    if (body.nombre_instalacion !== undefined) data.nombre_instalacion = body.nombre_instalacion;
    if (body.codigo_instalacion !== undefined) data.codigo_instalacion = body.codigo_instalacion;
    if (body.fecha_instalacion !== undefined) data.fecha_instalacion = body.fecha_instalacion;
    if (body.estado_operativo !== undefined) data.estado_operativo = body.estado_operativo;
    if (body.descripcion !== undefined) data.descripcion = body.descripcion;
    if (body.tipo_uso !== undefined) data.tipo_uso = body.tipo_uso;
    if (body.ubicacion !== undefined) data.ubicacion = body.ubicacion;
    if (body.latitud !== undefined) data.latitud = body.latitud;
    if (body.longitud !== undefined) data.longitud = body.longitud;
    if (body.capacidad_maxima !== undefined) data.capacidad_maxima = body.capacidad_maxima;
    if (body.capacidad_actual !== undefined) data.capacidad_actual = body.capacidad_actual;
    if (body.volumen_agua_m3 !== undefined) data.volumen_agua_m3 = body.volumen_agua_m3;
    if (body.profundidad_m !== undefined) data.profundidad_m = body.profundidad_m;
    if (body.fecha_ultima_inspeccion !== undefined) data.fecha_ultima_inspeccion = body.fecha_ultima_inspeccion;
    if (body.responsable_operativo !== undefined) data.responsable_operativo = body.responsable_operativo;
    if (body.contacto_emergencia !== undefined) data.contacto_emergencia = body.contacto_emergencia;
    if (body.id_proceso !== undefined) data.id_proceso = body.id_proceso;

    const hasNewScope = body.id_organizacion_sucursal !== undefined || body.id_empresa_sucursal !== undefined || body.id_organizacion !== undefined;
    if (hasNewScope) {
      data.id_organizacion_sucursal = await resolveInstalacionSucursalId({
        scope,
        rawSucursalId: body.id_organizacion_sucursal ?? body.id_empresa_sucursal,
        rawOrganizacionId: body.id_organizacion,
      });
    }
    
    const instalacion = await prisma.instalacion.update({
      where: { id_instalacion: id },
      data,
      include: {
        organizacion_sucursal: {
          include: {
            organizacion: true,
          },
        },
        procesos: {
          include: {
            especies: true,
          },
        },
      },
    });
    invalidateInstalacionReadCaches();
    reply.send(serializeInstalacion(instalacion));
  } catch (error: any) {
    reply.status(resolveHttpStatus(error, 400)).send({ error: error.message });
  }
}

export async function deleteInstalacion(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  try {
    const scope = await requireRequestScope(req, reply);
    if (!scope) return;
    if (!canManageResources(scope)) {
      return reply.status(403).send({ error: 'No tiene permisos para eliminar instalaciones' });
    }

    const id = parseInt(req.params.id);
    const existing = await prisma.instalacion.findUnique({
      where: { id_instalacion: id },
      select: { id_instalacion: true, id_organizacion_sucursal: true },
    });

    if (!existing) {
      return reply.status(404).send({ error: 'Instalación no encontrada' });
    }

    if (!canAccessFacility(scope, existing.id_instalacion, existing.id_organizacion_sucursal)) {
      return reply.status(403).send({ error: 'No tiene acceso a esta instalación' });
    }

    await prisma.instalacion.delete({ where: { id_instalacion: id } });
    invalidateInstalacionReadCaches();
    reply.status(204).send();
  } catch (error: any) {
    reply.status(400).send({ error: error.message });
  }
}

// CATÁLOGO SENSORES
export async function createCatalogoSensor(req: FastifyRequest, reply: FastifyReply) {
  try {
    const scope = await requireRequestScope(req, reply);
    if (!scope) return;
    if (!canManageResources(scope)) {
      return reply.status(403).send({ error: 'No tiene permisos para crear sensores de catálogo' });
    }

    const body = createCatalogoSensorSchema.parse(req.body);
    const sensor = await prisma.catalogo_sensores.create({
      data: {
        nombre: body.nombre,
        descripcion: body.descripcion,
        modelo: body.modelo,
        marca: body.marca,
        rango_medicion: body.rango_medicion,
        unidad_medida: body.unidad_medida ?? body.unidad
      }
    });
    invalidateInstalacionReadCaches();
    reply.status(201).send(serializeCatalogoSensor(sensor));
  } catch (error: any) {
    reply.status(400).send({ error: error.message });
  }
}

export async function getCatalogoSensores(_req: FastifyRequest, reply: FastifyReply) {
  try {
    const scope = await requireRequestScope(_req, reply);
    if (!scope) return;

    const sensores = await prisma.catalogo_sensores.findMany();
    reply.send(sensores.map(serializeCatalogoSensor));
  } catch (error: any) {
    reply.status(500).send({ error: error.message });
  }
}

export async function getCatalogoSensorById(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  try {
    const scope = await requireRequestScope(req, reply);
    if (!scope) return;

    const id = parseInt(req.params.id);
    const sensor = await prisma.catalogo_sensores.findUnique({
      where: { id_sensor: id }
    });
    
    if (!sensor) {
      return reply.status(404).send({ error: 'Sensor no encontrado' });
    }
    
    reply.send(serializeCatalogoSensor(sensor));
  } catch (error: any) {
    reply.status(500).send({ error: error.message });
  }
}

export async function updateCatalogoSensor(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  try {
    const scope = await requireRequestScope(req, reply);
    if (!scope) return;
    if (!canManageResources(scope)) {
      return reply.status(403).send({ error: 'No tiene permisos para actualizar sensores de catálogo' });
    }

    const id = parseInt(req.params.id);
    const body = updateCatalogoSensorSchema.parse(req.body);

    const data: any = {
      nombre: body.nombre,
      descripcion: body.descripcion,
      modelo: body.modelo,
      marca: body.marca,
      rango_medicion: body.rango_medicion,
      unidad_medida: body.unidad_medida ?? body.unidad
    };
    
    const sensor = await prisma.catalogo_sensores.update({
      where: { id_sensor: id },
      data
    });
    invalidateInstalacionReadCaches();
    reply.send(serializeCatalogoSensor(sensor));
  } catch (error: any) {
    reply.status(400).send({ error: error.message });
  }
}

export async function deleteCatalogoSensor(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  try {
    const scope = await requireRequestScope(req, reply);
    if (!scope) return;
    if (!canManageResources(scope)) {
      return reply.status(403).send({ error: 'No tiene permisos para eliminar sensores de catálogo' });
    }

    const id = parseInt(req.params.id);
    await prisma.catalogo_sensores.delete({ where: { id_sensor: id } });
    invalidateInstalacionReadCaches();
    reply.status(204).send();
  } catch (error: any) {
    reply.status(400).send({ error: error.message });
  }
}

// SENSORES INSTALADOS
export async function createSensorInstalado(req: FastifyRequest, reply: FastifyReply) {
  try {
    const scope = await requireRequestScope(req, reply);
    if (!scope) return;
    if (!canManageResources(scope)) {
      return reply.status(403).send({ error: 'No tiene permisos para instalar sensores' });
    }

    const raw = (req.body || {}) as any;
    const idSensor = await resolveCatalogoSensorId(raw);
    const estadoRaw = mapFrontendStatusToDb(raw.estado_operativo ?? raw.status);

    const body = createSensorInstaladoSchema.parse({
      id_instalacion: raw.id_instalacion,
      id_sensor: idSensor,
      fecha_instalada: raw.fecha_instalada ?? new Date(),
      descripcion: raw.descripcion ?? raw.ubicacion ?? raw.tipo_medida ?? `Sensor ${idSensor}`,
      estado_operativo: estadoRaw ?? (raw.activo === false ? 'inactivo' : (raw.mantenimiento === true ? 'mantenimiento' : 'activo')),
      fecha_mantenimiento: raw.fecha_mantenimiento,
      id_lectura: raw.id_lectura,
    });

    if (typeof body.id_instalacion === 'number') {
      const targetInstalacion = await prisma.instalacion.findUnique({
        where: { id_instalacion: body.id_instalacion },
        select: { id_organizacion_sucursal: true },
      });
      if (!targetInstalacion) {
        return reply.status(404).send({ error: 'Instalación no encontrada' });
      }
      if (!canAccessFacility(scope, body.id_instalacion, targetInstalacion.id_organizacion_sucursal)) {
        return reply.status(403).send({ error: 'No tiene acceso a la instalación seleccionada' });
      }
    }

    if (typeof body.id_instalacion === 'number') {
      const existing = await prisma.sensor_instalado.findFirst({
        where: { id_instalacion: body.id_instalacion, id_sensor: body.id_sensor },
        select: { id_sensor_instalado: true },
      });
      if (existing) {
        return reply.status(409).send({
          error: 'Sensor ya instalado en esta instalación',
          id_sensor_instalado: existing.id_sensor_instalado
        });
      }
    }

    const sensorInstalado = await prisma.sensor_instalado.create({
      data: {
        id_instalacion: body.id_instalacion ?? null,
        id_sensor: body.id_sensor,
        fecha_instalada: body.fecha_instalada,
        descripcion: body.descripcion,
      },
      select: { id_sensor_instalado: true },
    });
    const complete = await prisma.sensor_instalado.findUnique({
      where: { id_sensor_instalado: sensorInstalado.id_sensor_instalado },
      select: sensorInstaladoSelect,
    });
    invalidateInstalacionReadCaches();
    reply.status(201).send(serializeSensorInstalado(complete ?? sensorInstalado));
  } catch (error: any) {
    reply.status(400).send({ error: error.message });
  }
}

export async function getSensoresInstalados(
  req: FastifyRequest<{ Querystring: { id_instalacion?: string } }>,
  reply: FastifyReply
) {
  try {
    const scope = await requireRequestScope(req, reply);
    if (!scope) return;

    const filters: any[] = [];

    const instalacionScopeWhere = buildInstalacionScopeWhere(scope);
    if (Object.keys(instalacionScopeWhere).length > 0) {
      filters.push({ instalacion: instalacionScopeWhere });
    }

    const instalacionId = toPositiveInt(req.query.id_instalacion);
    if (instalacionId) {
      filters.push({ id_instalacion: instalacionId });
    }

    const cacheKey = buildSensoresInstaladosListCacheKey(scope, instalacionId);
    const cached = getListCache(sensoresInstaladosListCache, cacheKey);
    if (cached) {
      reply.header('Cache-Control', 'private, max-age=5, stale-while-revalidate=15');
      reply.header('Vary', 'Authorization, Cookie');
      reply.header('X-Data-Source', 'cache');
      return reply.send(cached);
    }

    const inflight = sensoresInstaladosListInflight.get(cacheKey);
    if (inflight) {
      const shared = await inflight;
      reply.header('Cache-Control', 'private, max-age=5, stale-while-revalidate=15');
      reply.header('Vary', 'Authorization, Cookie');
      reply.header('X-Data-Source', 'cache-inflight');
      return reply.send(shared);
    }

    const where = filters.length > 1 ? { AND: filters } : (filters[0] ?? {});

    const computePromise = (async () => {
      const sensores = await prisma.sensor_instalado.findMany({
        where,
        select: sensorInstaladoSelect,
      });
      return sensores.map(serializeSensorInstalado);
    })();

    sensoresInstaladosListInflight.set(cacheKey, computePromise);
    try {
      const payload = await computePromise;
      setListCache(
        sensoresInstaladosListCache,
        cacheKey,
        payload,
        SENSORES_INSTALADOS_LIST_CACHE_TTL_MS,
        SENSORES_INSTALADOS_LIST_CACHE_MAX_ENTRIES
      );
      reply.header('Cache-Control', 'private, max-age=5, stale-while-revalidate=15');
      reply.header('Vary', 'Authorization, Cookie');
      reply.header('X-Data-Source', 'db');
      return reply.send(payload);
    } finally {
      sensoresInstaladosListInflight.delete(cacheKey);
    }
  } catch (error: any) {
    reply.status(500).send({ error: error.message });
  }
}

export async function getSensorInstaladoById(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  try {
    const scope = await requireRequestScope(req, reply);
    if (!scope) return;

    const id = parseInt(req.params.id);
    const sensor = await prisma.sensor_instalado.findUnique({
      where: { id_sensor_instalado: id },
      select: sensorInstaladoSelect,
    });
    
    if (!sensor) {
      return reply.status(404).send({ error: 'Sensor instalado no encontrado' });
    }

    if (typeof sensor.id_instalacion === 'number') {
      if (!canAccessFacility(scope, sensor.id_instalacion, sensor.instalacion?.id_organizacion_sucursal)) {
        return reply.status(403).send({ error: 'No tiene acceso a este sensor instalado' });
      }
    } else if (!canManageResources(scope)) {
      return reply.status(403).send({ error: 'No tiene acceso a sensores sin instalación asignada' });
    }
    
    reply.send(serializeSensorInstalado(sensor));
  } catch (error: any) {
    reply.status(500).send({ error: error.message });
  }
}

export async function updateSensorInstalado(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  try {
    const scope = await requireRequestScope(req, reply);
    if (!scope) return;
    if (!canManageResources(scope)) {
      return reply.status(403).send({ error: 'No tiene permisos para actualizar sensores instalados' });
    }

    const id = parseInt(req.params.id);
    const raw = (req.body || {}) as any;
    const estadoRaw = mapFrontendStatusToDb(raw.estado_operativo ?? raw.status) ?? (
      raw.activo === true ? 'activo' : raw.activo === false ? 'inactivo' : undefined
    );
    const body = updateSensorInstaladoSchema.parse({
      id_instalacion: raw.id_instalacion,
      id_sensor: raw.id_sensor,
      fecha_instalada: raw.fecha_instalada,
      descripcion: raw.descripcion,
      estado_operativo: estadoRaw,
      fecha_mantenimiento: raw.fecha_mantenimiento,
      id_lectura: raw.id_lectura,
    });

    const existingSensor = await prisma.sensor_instalado.findUnique({
      where: { id_sensor_instalado: id },
      select: {
        id_sensor_instalado: true,
        id_instalacion: true,
        id_sensor: true,
        fecha_instalada: true,
        descripcion: true,
        instalacion: {
          select: {
            id_organizacion_sucursal: true,
          },
        },
        catalogo_sensores: {
          select: {
            id_sensor: true,
            nombre: true,
            descripcion: true,
            modelo: true,
            marca: true,
            rango_medicion: true,
            unidad_medida: true,
          },
        },
      },
    });

    if (!existingSensor) {
      return reply.status(404).send({ error: 'Sensor instalado no encontrado' });
    }

    if (typeof existingSensor.id_instalacion === 'number') {
      if (!canAccessFacility(scope, existingSensor.id_instalacion, existingSensor.instalacion?.id_organizacion_sucursal)) {
        return reply.status(403).send({ error: 'No tiene acceso a este sensor instalado' });
      }
    } else if (!canManageResources(scope)) {
      return reply.status(403).send({ error: 'No tiene acceso a sensores sin instalación asignada' });
    }

    if (typeof body.id_instalacion === 'number') {
      const destination = await prisma.instalacion.findUnique({
        where: { id_instalacion: body.id_instalacion },
        select: { id_organizacion_sucursal: true },
      });
      if (!destination) {
        return reply.status(404).send({ error: 'Instalación no encontrada' });
      }
      if (!canAccessFacility(scope, body.id_instalacion, destination.id_organizacion_sucursal)) {
        return reply.status(403).send({ error: 'No tiene acceso a la instalación seleccionada' });
      }
    }

    const targetInstalacionId = (
      body.id_instalacion !== undefined
        ? body.id_instalacion
        : existingSensor.id_instalacion
    );
    const targetSensorId = body.id_sensor ?? existingSensor.id_sensor;

    if (typeof targetInstalacionId === 'number') {
      const existing = await prisma.sensor_instalado.findFirst({
        where: {
          id_instalacion: targetInstalacionId,
          id_sensor: targetSensorId,
          NOT: { id_sensor_instalado: id }
        },
        select: { id_sensor_instalado: true },
      });
      if (existing) {
        return reply.status(409).send({
          error: 'Sensor ya instalado en esta instalación',
          id_sensor_instalado: existing.id_sensor_instalado
        });
      }
    }

    if ((raw.tipo_medida || raw.type || raw.unidad_medida || raw.unidad) && body.id_sensor === undefined) {
      const catalogoData: any = {};
      if (raw.tipo_medida || raw.type) catalogoData.nombre = String(raw.tipo_medida ?? raw.type);
      if (raw.unidad_medida || raw.unidad) catalogoData.unidad_medida = String(raw.unidad_medida ?? raw.unidad);
      if (raw.descripcion_sensor) catalogoData.descripcion = String(raw.descripcion_sensor);

      if (Object.keys(catalogoData).length > 0) {
        await prisma.catalogo_sensores.update({
          where: { id_sensor: existingSensor.id_sensor },
          data: catalogoData,
        });
      }
    }

    const data: any = {};
    if (body.id_instalacion !== undefined) data.id_instalacion = body.id_instalacion;
    if (body.id_sensor !== undefined) data.id_sensor = body.id_sensor;
    if (body.fecha_instalada !== undefined) data.fecha_instalada = body.fecha_instalada;
    if (body.descripcion !== undefined) data.descripcion = body.descripcion;
    
    const sensor = await prisma.sensor_instalado.update({
      where: { id_sensor_instalado: id },
      data,
      select: { id_sensor_instalado: true },
    });
    
    const complete = await prisma.sensor_instalado.findUnique({
      where: { id_sensor_instalado: sensor.id_sensor_instalado },
      select: sensorInstaladoSelect,
    });
    invalidateInstalacionReadCaches();
    reply.send(serializeSensorInstalado(complete ?? sensor));
  } catch (error: any) {
    reply.status(400).send({ error: error.message });
  }
}

export async function deleteSensorInstalado(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  try {
    const scope = await requireRequestScope(req, reply);
    if (!scope) return;
    if (!canManageResources(scope)) {
      return reply.status(403).send({ error: 'No tiene permisos para eliminar sensores instalados' });
    }

    const id = parseInt(req.params.id);
    const existing = await prisma.sensor_instalado.findUnique({
      where: { id_sensor_instalado: id },
      select: {
        id_instalacion: true,
        instalacion: {
          select: {
            id_organizacion_sucursal: true,
          },
        },
      },
    });
    if (!existing) {
      return reply.status(404).send({ error: 'Sensor instalado no encontrado' });
    }

    if (typeof existing.id_instalacion === 'number') {
      if (!canAccessFacility(scope, existing.id_instalacion, existing.instalacion?.id_organizacion_sucursal)) {
        return reply.status(403).send({ error: 'No tiene acceso a este sensor instalado' });
      }
    } else if (!canManageResources(scope)) {
      return reply.status(403).send({ error: 'No tiene acceso a sensores sin instalación asignada' });
    }

    await prisma.sensor_instalado.deleteMany({ where: { id_sensor_instalado: id } });
    invalidateInstalacionReadCaches();
    reply.status(204).send();
  } catch (error: any) {
    reply.status(400).send({ error: error.message });
  }
}
