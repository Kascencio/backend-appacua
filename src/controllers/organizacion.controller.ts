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

function mapBooleanActivoToEstado(activo: unknown): 'activa' | 'inactiva' | undefined {
  if (activo === undefined) return undefined;
  return Boolean(activo) ? 'activa' : 'inactiva';
}

function serializeOrganizacion(organizacion: any) {
  return {
    ...organizacion,
    id_empresa: organizacion.id_organizacion,
    activo: organizacion.estado === 'activa',
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
    activo: sucursal.estado === 'activa',
    created_at: sucursal.fecha_creacion,
    updated_at: sucursal.ultima_modificacion,
    estado_operativo: sucursal.estado,
    id_empresa_sucursal: sucursal.id_organizacion_sucursal + 10000,
    tipo: 'sucursal',
  };
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
    });
    // Convertir estado string a enum
    const data = {
      ...body,
      estado: body.estado as 'activa' | 'inactiva',
      razon_social: raw.razon_social ?? raw.razonSocial,
      rfc: raw.rfc,
      correo: raw.correo ?? raw.email,
      telefono: raw.telefono ?? raw.phone,
      descripcion: raw.descripcion,
      id_estado: raw.id_estado ? Number(raw.id_estado) : undefined,
      id_municipio: raw.id_municipio ? Number(raw.id_municipio) : undefined,
    };
    const organizacion = await prisma.organizacion.create({ data });
    reply.status(201).send(serializeOrganizacion(organizacion));
  } catch (error: any) {
    reply.status(400).send({ error: error.message || 'Error al crear organización' });
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
        estados: true,
        municipios: true,
        organizacion_sucursal: true,
      },
      orderBy: {
        fecha_creacion: 'desc',
      },
    });

    reply.send(organizaciones.map(serializeOrganizacion));
  } catch (error: any) {
    reply.status(500).send({ error: error.message });
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
    
    reply.send(serializeOrganizacion(organizacion));
  } catch (error: any) {
    reply.status(500).send({ error: error.message });
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
    });
    
    // Convertir estado string a enum si existe
    const data: any = { ...body };
    if (body.estado) {
      data.estado = body.estado as 'activa' | 'inactiva';
    }
    if (raw.razon_social !== undefined) data.razon_social = raw.razon_social;
    if (raw.rfc !== undefined) data.rfc = raw.rfc;
    if (raw.correo !== undefined || raw.email !== undefined) data.correo = raw.correo ?? raw.email;
    if (raw.telefono !== undefined || raw.phone !== undefined) data.telefono = raw.telefono ?? raw.phone;
    if (raw.descripcion !== undefined) data.descripcion = raw.descripcion;
    if (raw.id_estado !== undefined) data.id_estado = toPositiveInt(raw.id_estado);
    if (raw.id_municipio !== undefined) data.id_municipio = toPositiveInt(raw.id_municipio);
    if (raw.activo !== undefined && body.estado === undefined) {
      data.estado = mapBooleanActivoToEstado(raw.activo);
    }
    
    const organizacion = await prisma.organizacion.update({
      where: { id_organizacion: id },
      data
    });
    
    reply.send(serializeOrganizacion(organizacion));
  } catch (error: any) {
    reply.status(400).send({ error: error.message || 'Error al actualizar organización' });
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
    
    reply.status(204).send();
  } catch (error: any) {
    reply.status(400).send({ error: error.message || 'Error al eliminar organización' });
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
    });

    const sucursal = await prisma.organizacion_sucursal.create({
      data: {
        id_organizacion: body.id_organizacion,
        nombre_sucursal: body.nombre_sucursal,
        telefono_sucursal: raw.telefono_sucursal ?? raw.telefono ?? null,
        correo_sucursal: raw.correo_sucursal ?? raw.email ?? null,
        id_estado: toPositiveInt(raw.id_estado),
        id_municipio: toPositiveInt(raw.id_municipio),
        estado: (body.estado ?? 'activa') as 'activa' | 'inactiva'
      }
    });
    reply.status(201).send(serializeSucursal(sucursal));
  } catch (error: any) {
    reply.status(400).send({ error: error.message });
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
        organizacion: true,
        instalacion: true,
        estados: true,
        municipios: true,
      },
      orderBy: {
        fecha_creacion: 'desc',
      },
    });

    reply.send(sucursales.map(serializeSucursal));
  } catch (error: any) {
    reply.status(500).send({ error: error.message });
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
    
    reply.send(serializeSucursal(sucursal));
  } catch (error: any) {
    reply.status(500).send({ error: error.message });
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
    });

    const data: any = {
      id_organizacion: body.id_organizacion,
      nombre_sucursal: body.nombre_sucursal,
      estado: body.estado as any
    };

    // Permitir actualizar campos extra si vienen (sin romper compatibilidad)
    if (raw.telefono_sucursal !== undefined || raw.telefono !== undefined) data.telefono_sucursal = raw.telefono_sucursal ?? raw.telefono;
    if (raw.correo_sucursal !== undefined || raw.email !== undefined) data.correo_sucursal = raw.correo_sucursal ?? raw.email;
    if (raw.id_estado !== undefined) data.id_estado = toPositiveInt(raw.id_estado);
    if (raw.id_municipio !== undefined) data.id_municipio = toPositiveInt(raw.id_municipio);
    
    const sucursal = await prisma.organizacion_sucursal.update({
      where: { id_organizacion_sucursal: id },
      data
    });
    
    reply.send(serializeSucursal(sucursal));
  } catch (error: any) {
    reply.status(400).send({ error: error.message });
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
    
    reply.status(204).send();
  } catch (error: any) {
    reply.status(400).send({ error: error.message });
  }
}
