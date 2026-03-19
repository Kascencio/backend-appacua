import type { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../repositories/prisma.js';
import {
  buildOrganizacionScopeWhere,
  buildSucursalScopeWhere,
  canAccessBranch,
  canAccessOrganization,
  isSuperadmin,
  requireRequestScope,
} from '../utils/access-control.js';
import {
  createOrganizacionSchema,
  updateOrganizacionSchema,
  createSucursalSchema,
  updateSucursalSchema
} from '../utils/validators.js';

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

function mapBooleanActivoToEstado(activo: unknown): 'activa' | 'inactiva' | undefined {
  if (activo === undefined) return undefined;
  return Boolean(activo) ? 'activa' : 'inactiva';
}

function serializeOrganizacion(organizacion: any) {
  return {
    ...organizacion,
    id_empresa: organizacion.id_organizacion,
    activo: organizacion.estado === 'activa',
    latitud: toNullableNumber(organizacion.latitud),
    longitud: toNullableNumber(organizacion.longitud),
    nombre_estado: organizacion.estados?.nombre,
    nombre_municipio: organizacion.municipios?.nombre,
    created_at: organizacion.fecha_creacion,
    updated_at: organizacion.ultima_modificacion,
  };
}

function serializeSucursal(sucursal: any) {
  return {
    ...sucursal,
    id_sucursal: sucursal.id_organizacion_sucursal,
    id_empresa: sucursal.id_organizacion,
    nombre: sucursal.nombre_sucursal,
    calle: sucursal.direccion_sucursal,
    direccion: sucursal.direccion_sucursal,
    telefono: sucursal.telefono_sucursal,
    email: sucursal.correo_sucursal,
    latitud: toNullableNumber(sucursal.latitud),
    longitud: toNullableNumber(sucursal.longitud),
    nombre_estado: sucursal.estados?.nombre,
    nombre_municipio: sucursal.municipios?.nombre,
    activo: sucursal.estado === 'activa',
    created_at: sucursal.fecha_creacion,
    updated_at: sucursal.ultima_modificacion,
    estado_operativo: sucursal.estado,
    id_empresa_sucursal: sucursal.id_organizacion_sucursal + 10000,
    tipo: 'sucursal',
  };
}

function replyWithError(
  req: FastifyRequest,
  reply: FastifyReply,
  statusCode: number,
  error: unknown,
  fallbackMessage: string
) {
  const message = typeof (error as { message?: unknown })?.message === 'string' && (error as { message?: string }).message
    ? (error as { message: string }).message
    : fallbackMessage;

  if (reply.sent) {
    req.log.warn({ err: error, statusCode }, 'Se omitio una segunda respuesta porque la solicitud ya fue respondida');
    return reply;
  }

  return reply.status(statusCode).send({ error: message });
}

export async function createOrganizacion(req: FastifyRequest, reply: FastifyReply) {
  try {
    const scope = await requireRequestScope(req, reply);
    if (!scope) return;
    if (!isSuperadmin(scope)) {
      return reply.status(403).send({ error: 'Solo superadmin puede crear organizaciones' });
    }

    const raw = (req.body || {}) as any;
    const body = createOrganizacionSchema.parse({
      nombre: raw.nombre,
      estado: raw.estado ?? mapBooleanActivoToEstado(raw.activo) ?? 'activa',
      razon_social: raw.razon_social ?? raw.razonSocial,
      rfc: raw.rfc,
      correo: raw.correo ?? raw.email,
      telefono: raw.telefono ?? raw.phone,
      direccion: raw.direccion ?? raw.direccion_completa,
      latitud: raw.latitud ?? raw.latitude,
      longitud: raw.longitud ?? raw.longitude,
      zona_horaria: raw.zona_horaria ?? raw.timezone,
      descripcion: raw.descripcion,
      id_estado: raw.id_estado,
      id_municipio: raw.id_municipio,
    });

    const data = {
      estado: body.estado as 'activa' | 'inactiva',
      nombre: body.nombre,
      razon_social: body.razon_social,
      rfc: body.rfc,
      correo: body.correo,
      telefono: body.telefono,
      direccion: body.direccion,
      latitud: body.latitud,
      longitud: body.longitud,
      zona_horaria: body.zona_horaria,
      descripcion: body.descripcion,
      id_estado: body.id_estado ?? undefined,
      id_municipio: body.id_municipio ?? undefined,
    };
    const organizacion = await prisma.organizacion.create({ data });
    return reply.status(201).send(serializeOrganizacion(organizacion));
  } catch (error: any) {
    return replyWithError(req, reply, 400, error, 'Error al crear organización');
  }
}

export async function getOrganizaciones(
  req: FastifyRequest<{ Querystring: { search?: string; estado?: string; activo?: string; page?: string; limit?: string } }>,
  reply: FastifyReply
) {
  try {
    const scope = await requireRequestScope(req, reply);
    if (!scope) return;
    if (!isSuperadmin(scope) && scope.role !== 'admin') {
      return reply.status(403).send({ error: 'No tiene permisos para consultar organizaciones' });
    }

    const filters: any[] = [];
    const search = req.query.search?.trim();
    const estadoFromActivo = req.query.activo !== undefined
      ? mapBooleanActivoToEstado(req.query.activo === 'true')
      : undefined;
    const estado = req.query.estado as 'activa' | 'inactiva' | undefined;

    const scopeWhere = buildOrganizacionScopeWhere(scope);
    if (Object.keys(scopeWhere).length > 0) {
      filters.push(scopeWhere);
    }

    if (search) {
      filters.push({
        OR: [
        { nombre: { contains: search } },
        { razon_social: { contains: search } },
        { correo: { contains: search } },
        ],
      });
    }

    if (estado || estadoFromActivo) {
      filters.push({ estado: estado || estadoFromActivo });
    }

    const where = filters.length > 1 ? { AND: filters } : (filters[0] ?? {});

    const organizaciones = await prisma.organizacion.findMany({
      where,
      include: {
        estados: {
          select: {
            nombre: true,
          },
        },
        municipios: {
          select: {
            nombre: true,
          },
        },
      },
      orderBy: {
        fecha_creacion: 'desc',
      },
    });

    return reply.send(organizaciones.map(serializeOrganizacion));
  } catch (error: any) {
    return replyWithError(req, reply, 500, error, 'Error al consultar organizaciones');
  }
}

export async function getOrganizacionById(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  try {
    const scope = await requireRequestScope(req, reply);
    if (!scope) return;
    if (!isSuperadmin(scope) && scope.role !== 'admin') {
      return reply.status(403).send({ error: 'No tiene permisos para consultar organizaciones' });
    }

    const id = parseInt(req.params.id);
    if (!canAccessOrganization(scope, id)) {
      return reply.status(403).send({ error: 'No tiene acceso a esta organización' });
    }

    const organizacion = await prisma.organizacion.findUnique({
      where: { id_organizacion: id },
      include: {
        estados: true,
        municipios: true,
        organizacion_sucursal: true,
      },
    });
    
    if (!organizacion) {
      return reply.status(404).send({ error: 'Organización no encontrada' });
    }
    
    return reply.send(serializeOrganizacion(organizacion));
  } catch (error: any) {
    return replyWithError(req, reply, 500, error, 'Error al consultar organización');
  }
}

export async function updateOrganizacion(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  try {
    const scope = await requireRequestScope(req, reply);
    if (!scope) return;
    if (!isSuperadmin(scope)) {
      return reply.status(403).send({ error: 'Solo superadmin puede actualizar organizaciones' });
    }

    const id = parseInt(req.params.id);
    const raw = (req.body || {}) as any;
    const body = updateOrganizacionSchema.parse({
      nombre: raw.nombre,
      estado: raw.estado ?? mapBooleanActivoToEstado(raw.activo),
      razon_social: raw.razon_social ?? raw.razonSocial,
      rfc: raw.rfc,
      correo: raw.correo ?? raw.email,
      telefono: raw.telefono ?? raw.phone,
      direccion: raw.direccion ?? raw.direccion_completa,
      latitud: raw.latitud ?? raw.latitude,
      longitud: raw.longitud ?? raw.longitude,
      zona_horaria: raw.zona_horaria ?? raw.timezone,
      descripcion: raw.descripcion,
      id_estado: raw.id_estado,
      id_municipio: raw.id_municipio,
    });
    
    const data: any = {};
    if (body.nombre !== undefined) data.nombre = body.nombre;
    if (body.estado !== undefined) data.estado = body.estado as 'activa' | 'inactiva';
    if (body.razon_social !== undefined) data.razon_social = body.razon_social;
    if (body.rfc !== undefined) data.rfc = body.rfc;
    if (body.correo !== undefined) data.correo = body.correo;
    if (body.telefono !== undefined) data.telefono = body.telefono;
    if (body.direccion !== undefined) data.direccion = body.direccion;
    if (body.latitud !== undefined) data.latitud = body.latitud;
    if (body.longitud !== undefined) data.longitud = body.longitud;
    if (body.zona_horaria !== undefined) data.zona_horaria = body.zona_horaria;
    if (body.descripcion !== undefined) data.descripcion = body.descripcion;
    if (raw.id_estado !== undefined) data.id_estado = toPositiveInt(body.id_estado);
    if (raw.id_municipio !== undefined) data.id_municipio = toPositiveInt(body.id_municipio);
    if (raw.activo !== undefined && body.estado === undefined) {
      data.estado = mapBooleanActivoToEstado(raw.activo);
    }
    
    const organizacion = await prisma.organizacion.update({
      where: { id_organizacion: id },
      data
    });
    
    return reply.send(serializeOrganizacion(organizacion));
  } catch (error: any) {
    return replyWithError(req, reply, 400, error, 'Error al actualizar organización');
  }
}

export async function deleteOrganizacion(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  try {
    const scope = await requireRequestScope(req, reply);
    if (!scope) return;
    if (!isSuperadmin(scope)) {
      return reply.status(403).send({ error: 'Solo superadmin puede eliminar organizaciones' });
    }

    const id = parseInt(req.params.id);
    await prisma.organizacion.delete({
      where: { id_organizacion: id }
    });
    
    return reply.status(204).send();
  } catch (error: any) {
    return replyWithError(req, reply, 400, error, 'Error al eliminar organización');
  }
}

// Sucursales
export async function createSucursal(req: FastifyRequest, reply: FastifyReply) {
  try {
    const scope = await requireRequestScope(req, reply);
    if (!scope) return;
    if (!isSuperadmin(scope)) {
      return reply.status(403).send({ error: 'Solo superadmin puede crear sucursales' });
    }

    const raw = (req.body || {}) as any;
    const body = createSucursalSchema.parse({
      id_organizacion: raw.id_organizacion ?? raw.id_empresa ?? raw.id_padre,
      nombre_sucursal: raw.nombre_sucursal ?? raw.nombre,
      estado: raw.estado ?? mapBooleanActivoToEstado(raw.activo),
      telefono_sucursal: raw.telefono_sucursal ?? raw.telefono,
      correo_sucursal: raw.correo_sucursal ?? raw.email,
      direccion_sucursal: raw.direccion_sucursal ?? raw.direccion ?? raw.calle,
      numero_int_ext: raw.numero_int_ext,
      referencia: raw.referencia,
      id_cp: raw.id_cp,
      id_colonia: raw.id_colonia,
      id_estado: raw.id_estado,
      id_municipio: raw.id_municipio,
      latitud: raw.latitud ?? raw.latitude,
      longitud: raw.longitud ?? raw.longitude,
    });

    const sucursal = await prisma.organizacion_sucursal.create({
      data: {
        id_organizacion: body.id_organizacion,
        nombre_sucursal: body.nombre_sucursal,
        telefono_sucursal: body.telefono_sucursal ?? null,
        correo_sucursal: body.correo_sucursal ?? null,
        direccion_sucursal: body.direccion_sucursal ?? null,
        numero_int_ext: body.numero_int_ext ?? null,
        referencia: body.referencia ?? null,
        id_cp: body.id_cp ?? null,
        id_colonia: body.id_colonia ?? null,
        id_estado: body.id_estado ?? null,
        id_municipio: body.id_municipio ?? null,
        latitud: body.latitud ?? null,
        longitud: body.longitud ?? null,
        estado: (body.estado ?? 'activa') as 'activa' | 'inactiva'
      }
    });
    return reply.status(201).send(serializeSucursal(sucursal));
  } catch (error: any) {
    return replyWithError(req, reply, 400, error, 'Error al crear sucursal');
  }
}

export async function getSucursales(
  req: FastifyRequest<{ Querystring: { id_empresa?: string; id_organizacion?: string; activo?: string } }>,
  reply: FastifyReply
) {
  try {
    const scope = await requireRequestScope(req, reply);
    if (!scope) return;
    if (!isSuperadmin(scope) && scope.role !== 'admin') {
      return reply.status(403).send({ error: 'No tiene permisos para consultar sucursales' });
    }

    const filters: any[] = [];

    const scopeWhere = buildSucursalScopeWhere(scope);
    if (Object.keys(scopeWhere).length > 0) {
      filters.push(scopeWhere);
    }

    const idEmpresa = toPositiveInt(req.query.id_empresa ?? req.query.id_organizacion);
    if (idEmpresa) {
      filters.push({ id_organizacion: idEmpresa });
    }

    if (req.query.activo !== undefined) {
      filters.push({ estado: req.query.activo === 'true' ? 'activa' : 'inactiva' });
    }

    const where = filters.length > 1 ? { AND: filters } : (filters[0] ?? {});

    const sucursales = await prisma.organizacion_sucursal.findMany({
      where,
      include: {
        organizacion: {
          select: {
            id_organizacion: true,
            nombre: true,
          },
        },
        estados: {
          select: {
            nombre: true,
          },
        },
        municipios: {
          select: {
            nombre: true,
          },
        },
      },
      orderBy: {
        fecha_creacion: 'desc',
      },
    });

    return reply.send(sucursales.map(serializeSucursal));
  } catch (error: any) {
    return replyWithError(req, reply, 500, error, 'Error al consultar sucursales');
  }
}

export async function getSucursalById(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  try {
    const scope = await requireRequestScope(req, reply);
    if (!scope) return;
    if (!isSuperadmin(scope) && scope.role !== 'admin') {
      return reply.status(403).send({ error: 'No tiene permisos para consultar sucursales' });
    }

    const id = parseInt(req.params.id);
    if (!canAccessBranch(scope, id)) {
      return reply.status(403).send({ error: 'No tiene acceso a esta sucursal' });
    }

    const sucursal = await prisma.organizacion_sucursal.findUnique({
      where: { id_organizacion_sucursal: id },
      include: {
        organizacion: true,
        instalacion: true,
        estados: true,
        municipios: true,
      },
    });
    
    if (!sucursal) {
      return reply.status(404).send({ error: 'Sucursal no encontrada' });
    }
    
    return reply.send(serializeSucursal(sucursal));
  } catch (error: any) {
    return replyWithError(req, reply, 500, error, 'Error al consultar sucursal');
  }
}

export async function updateSucursal(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  try {
    const scope = await requireRequestScope(req, reply);
    if (!scope) return;
    if (!isSuperadmin(scope)) {
      return reply.status(403).send({ error: 'Solo superadmin puede actualizar sucursales' });
    }

    const id = parseInt(req.params.id);
    const raw = (req.body || {}) as any;
    const body = updateSucursalSchema.parse({
      id_organizacion: raw.id_organizacion ?? raw.id_empresa ?? raw.id_padre,
      nombre_sucursal: raw.nombre_sucursal ?? raw.nombre,
      estado: raw.estado ?? mapBooleanActivoToEstado(raw.activo),
      telefono_sucursal: raw.telefono_sucursal ?? raw.telefono,
      correo_sucursal: raw.correo_sucursal ?? raw.email,
      direccion_sucursal: raw.direccion_sucursal ?? raw.direccion ?? raw.calle,
      numero_int_ext: raw.numero_int_ext,
      referencia: raw.referencia,
      id_cp: raw.id_cp,
      id_colonia: raw.id_colonia,
      id_estado: raw.id_estado,
      id_municipio: raw.id_municipio,
      latitud: raw.latitud ?? raw.latitude,
      longitud: raw.longitud ?? raw.longitude,
    });

    const data: any = {};
    if (body.id_organizacion !== undefined) data.id_organizacion = body.id_organizacion;
    if (body.nombre_sucursal !== undefined) data.nombre_sucursal = body.nombre_sucursal;
    if (body.estado !== undefined) data.estado = body.estado as 'activa' | 'inactiva';

    if (body.telefono_sucursal !== undefined) data.telefono_sucursal = body.telefono_sucursal;
    if (body.correo_sucursal !== undefined) data.correo_sucursal = body.correo_sucursal;
    if (body.direccion_sucursal !== undefined) data.direccion_sucursal = body.direccion_sucursal;
    if (body.numero_int_ext !== undefined) data.numero_int_ext = body.numero_int_ext;
    if (body.referencia !== undefined) data.referencia = body.referencia;
    if (raw.id_cp !== undefined) data.id_cp = toPositiveInt(body.id_cp);
    if (raw.id_colonia !== undefined) data.id_colonia = toPositiveInt(body.id_colonia);
    if (raw.id_estado !== undefined) data.id_estado = toPositiveInt(body.id_estado);
    if (raw.id_municipio !== undefined) data.id_municipio = toPositiveInt(body.id_municipio);
    if (body.latitud !== undefined) data.latitud = body.latitud;
    if (body.longitud !== undefined) data.longitud = body.longitud;
    
    const sucursal = await prisma.organizacion_sucursal.update({
      where: { id_organizacion_sucursal: id },
      data
    });
    
    return reply.send(serializeSucursal(sucursal));
  } catch (error: any) {
    return replyWithError(req, reply, 400, error, 'Error al actualizar sucursal');
  }
}

export async function deleteSucursal(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  try {
    const scope = await requireRequestScope(req, reply);
    if (!scope) return;
    if (!isSuperadmin(scope)) {
      return reply.status(403).send({ error: 'Solo superadmin puede eliminar sucursales' });
    }

    const id = parseInt(req.params.id);
    await prisma.organizacion_sucursal.delete({
      where: { id_organizacion_sucursal: id }
    });
    
    return reply.status(204).send();
  } catch (error: any) {
    return replyWithError(req, reply, 400, error, 'Error al eliminar sucursal');
  }
}
