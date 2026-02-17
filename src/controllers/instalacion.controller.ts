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
  canManageResources,
  requireRequestScope,
} from '../utils/access-control.js';

function toPositiveInt(value: unknown): number | null {
  const num = typeof value === 'string' ? Number(value) : (typeof value === 'number' ? value : NaN);
  if (!Number.isFinite(num)) return null;
  const parsed = Math.trunc(num);
  return parsed > 0 ? parsed : null;
}

function serializeInstalacion(instalacion: any) {
  return {
    ...instalacion,
    id_sucursal: instalacion.id_organizacion_sucursal,
    id_empresa_sucursal: instalacion.id_organizacion_sucursal,
    nombre: instalacion.nombre_instalacion,
    tipo: instalacion.tipo_uso,
    activo: instalacion.estado_operativo === 'activo',
    created_at: instalacion.fecha_instalacion,
    updated_at: instalacion.fecha_instalacion,
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

function serializeSensorInstalado(sensor: any) {
  return {
    ...sensor,
    id: sensor.id_sensor_instalado,
    tipo_medida: sensor.catalogo_sensores?.nombre ?? sensor.tipo_medida ?? undefined,
    unidad_medida: sensor.catalogo_sensores?.unidad_medida ?? sensor.unidad_medida ?? undefined,
    activo: true,
    created_at: sensor.fecha_instalada,
    updated_at: sensor.fecha_instalada,
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

// INSTALACIONES
export async function createInstalacion(req: FastifyRequest, reply: FastifyReply) {
  try {
    const scope = await requireRequestScope(req, reply);
    if (!scope) return;
    if (!canManageResources(scope)) {
      return reply.status(403).send({ error: 'No tiene permisos para crear instalaciones' });
    }

    const body = createInstalacionSchema.parse(req.body);

    const rawSucursalId = body.id_organizacion_sucursal ?? body.id_empresa_sucursal;
    const sucursalId = normalizeOrganizacionSucursalId(Number(rawSucursalId));

    if (!canAccessBranch(scope, sucursalId)) {
      return reply.status(403).send({ error: 'No tiene acceso a la sucursal seleccionada' });
    }

    const instalacion = await prisma.instalacion.create({
      data: {
        id_organizacion_sucursal: sucursalId,
        nombre_instalacion: body.nombre_instalacion,
        fecha_instalacion: body.fecha_instalacion,
        estado_operativo: body.estado_operativo,
        descripcion: body.descripcion,
        tipo_uso: body.tipo_uso,
        id_proceso: body.id_proceso
      }
    });
    reply.status(201).send(serializeInstalacion(instalacion));
  } catch (error: any) {
    reply.status(400).send({ error: error.message });
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

    const where = filters.length > 1 ? { AND: filters } : (filters[0] ?? {});

    const instalaciones = await prisma.instalacion.findMany({
      where,
      include: {
        organizacion_sucursal: true,
        sensor_instalado: {
          include: {
            catalogo_sensores: true,
          },
        },
        procesos: {
          include: {
            especies: true,
          },
        },
      },
      orderBy: {
        fecha_instalacion: 'desc',
      },
    });
    reply.send(instalaciones.map(serializeInstalacion));
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
      include: { organizacion_sucursal: true, sensor_instalado: { include: { catalogo_sensores: true } } }
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

    const body = updateInstalacionSchema.parse(req.body);

    const data: any = {
      nombre_instalacion: body.nombre_instalacion,
      fecha_instalacion: body.fecha_instalacion,
      estado_operativo: body.estado_operativo,
      descripcion: body.descripcion,
      tipo_uso: body.tipo_uso,
      id_proceso: body.id_proceso
    };

    const rawSucursalId = body.id_organizacion_sucursal ?? body.id_empresa_sucursal;
    if (rawSucursalId !== undefined) {
      const normalizedSucursalId = normalizeOrganizacionSucursalId(Number(rawSucursalId));
      if (!canAccessBranch(scope, normalizedSucursalId)) {
        return reply.status(403).send({ error: 'No tiene acceso a la sucursal seleccionada' });
      }
      data.id_organizacion_sucursal = normalizedSucursalId;
    }
    
    const instalacion = await prisma.instalacion.update({
      where: { id_instalacion: id },
      data
    });
    
    reply.send(serializeInstalacion(instalacion));
  } catch (error: any) {
    reply.status(400).send({ error: error.message });
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

    const body = createSensorInstaladoSchema.parse({
      id_instalacion: raw.id_instalacion,
      id_sensor: idSensor,
      fecha_instalada: raw.fecha_instalada ?? new Date(),
      descripcion: raw.descripcion ?? raw.ubicacion ?? raw.tipo_medida ?? `Sensor ${idSensor}`,
      id_lectura: raw.id_lectura,
    });

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

    const existing = await prisma.sensor_instalado.findFirst({
      where: { id_instalacion: body.id_instalacion, id_sensor: body.id_sensor }
    });
    if (existing) {
      return reply.status(409).send({
        error: 'Sensor ya instalado en esta instalación',
        id_sensor_instalado: existing.id_sensor_instalado
      });
    }

    const sensorInstalado = await prisma.sensor_instalado.create({
      data: {
        id_instalacion: body.id_instalacion,
        id_sensor: body.id_sensor,
        fecha_instalada: body.fecha_instalada,
        descripcion: body.descripcion,
        id_lectura: body.id_lectura
      }
    });
    const complete = await prisma.sensor_instalado.findUnique({
      where: { id_sensor_instalado: sensorInstalado.id_sensor_instalado },
      include: { instalacion: true, catalogo_sensores: true },
    });

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

    const where = filters.length > 1 ? { AND: filters } : (filters[0] ?? {});

    const sensores = await prisma.sensor_instalado.findMany({
      where,
      include: { instalacion: true, catalogo_sensores: true }
    });
    reply.send(sensores.map(serializeSensorInstalado));
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
      include: { instalacion: true, catalogo_sensores: true }
    });
    
    if (!sensor) {
      return reply.status(404).send({ error: 'Sensor instalado no encontrado' });
    }

    if (!canAccessFacility(scope, sensor.id_instalacion, sensor.instalacion?.id_organizacion_sucursal)) {
      return reply.status(403).send({ error: 'No tiene acceso a este sensor instalado' });
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
    const body = updateSensorInstaladoSchema.parse({
      id_instalacion: raw.id_instalacion,
      id_sensor: raw.id_sensor,
      fecha_instalada: raw.fecha_instalada,
      descripcion: raw.descripcion,
      id_lectura: raw.id_lectura,
    });

    if (body.id_instalacion !== undefined && body.id_sensor !== undefined) {
      const existing = await prisma.sensor_instalado.findFirst({
        where: {
          id_instalacion: body.id_instalacion,
          id_sensor: body.id_sensor,
          NOT: { id_sensor_instalado: id }
        }
      });
      if (existing) {
        return reply.status(409).send({
          error: 'Sensor ya instalado en esta instalación',
          id_sensor_instalado: existing.id_sensor_instalado
        });
      }
    }

    const existingSensor = await prisma.sensor_instalado.findUnique({
      where: { id_sensor_instalado: id },
      include: {
        instalacion: {
          select: {
            id_organizacion_sucursal: true,
          },
        },
      },
    });

    if (!existingSensor) {
      return reply.status(404).send({ error: 'Sensor instalado no encontrado' });
    }

    if (!canAccessFacility(scope, existingSensor.id_instalacion, existingSensor.instalacion?.id_organizacion_sucursal)) {
      return reply.status(403).send({ error: 'No tiene acceso a este sensor instalado' });
    }

    if (body.id_instalacion !== undefined) {
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

    const data: any = {
      id_instalacion: body.id_instalacion,
      id_sensor: body.id_sensor,
      fecha_instalada: body.fecha_instalada,
      descripcion: body.descripcion,
      id_lectura: body.id_lectura
    };
    
    const sensor = await prisma.sensor_instalado.update({
      where: { id_sensor_instalado: id },
      data
    });
    
    const complete = await prisma.sensor_instalado.findUnique({
      where: { id_sensor_instalado: sensor.id_sensor_instalado },
      include: { instalacion: true, catalogo_sensores: true },
    });

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
      include: {
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

    if (!canAccessFacility(scope, existing.id_instalacion, existing.instalacion?.id_organizacion_sucursal)) {
      return reply.status(403).send({ error: 'No tiene acceso a este sensor instalado' });
    }

    await prisma.sensor_instalado.delete({ where: { id_sensor_instalado: id } });
    reply.status(204).send();
  } catch (error: any) {
    reply.status(400).send({ error: error.message });
  }
}
