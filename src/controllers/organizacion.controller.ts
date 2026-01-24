import type { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../repositories/prisma.js';
import {
  createOrganizacionSchema,
  updateOrganizacionSchema,
  createSucursalSchema,
  updateSucursalSchema
} from '../utils/validators.js';

export async function createOrganizacion(req: FastifyRequest, reply: FastifyReply) {
  try {
    const body = createOrganizacionSchema.parse(req.body);
    // Convertir estado string a enum
    const data = {
      ...body,
      estado: body.estado as 'activa' | 'inactiva'
    };
    const organizacion = await prisma.organizacion.create({ data });
    reply.status(201).send(organizacion);
  } catch (error: any) {
    reply.status(400).send({ error: error.message || 'Error al crear organización' });
  }
}

export async function getOrganizaciones(_req: FastifyRequest, reply: FastifyReply) {
  try {
    const organizaciones = await prisma.organizacion.findMany({
      include: { organizacion_sucursal: true }
    });
    reply.send(organizaciones);
  } catch (error: any) {
    reply.status(500).send({ error: error.message });
  }
}

export async function getOrganizacionById(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  try {
    const id = parseInt(req.params.id);
    const organizacion = await prisma.organizacion.findUnique({
      where: { id_organizacion: id },
      include: { organizacion_sucursal: true }
    });
    
    if (!organizacion) {
      return reply.status(404).send({ error: 'Organización no encontrada' });
    }
    
    reply.send(organizacion);
  } catch (error: any) {
    reply.status(500).send({ error: error.message });
  }
}

export async function updateOrganizacion(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  try {
    const id = parseInt(req.params.id);
    const body = updateOrganizacionSchema.parse(req.body);
    
    // Convertir estado string a enum si existe
    const data: any = { ...body };
    if (body.estado) {
      data.estado = body.estado as 'activa' | 'inactiva';
    }
    
    const organizacion = await prisma.organizacion.update({
      where: { id_organizacion: id },
      data
    });
    
    reply.send(organizacion);
  } catch (error: any) {
    reply.status(400).send({ error: error.message || 'Error al actualizar organización' });
  }
}

export async function deleteOrganizacion(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  try {
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
    const body = createSucursalSchema.parse(req.body);
    const sucursal = await prisma.organizacion_sucursal.create({
      data: {
        id_organizacion: body.id_organizacion,
        nombre_sucursal: body.nombre_sucursal,
        telefono_sucursal: (req.body as any)?.telefono_sucursal,
        correo_sucursal: (req.body as any)?.correo_sucursal,
        id_estado: (req.body as any)?.id_estado,
        id_municipio: (req.body as any)?.id_municipio,
        estado: (body.estado ?? 'activa') as 'activa' | 'inactiva'
      }
    });
    reply.status(201).send(sucursal);
  } catch (error: any) {
    reply.status(400).send({ error: error.message });
  }
}

export async function getSucursales(_req: FastifyRequest, reply: FastifyReply) {
  try {
    const sucursales = await prisma.organizacion_sucursal.findMany({
      include: { organizacion: true, instalacion: true }
    });
    reply.send(sucursales);
  } catch (error: any) {
    reply.status(500).send({ error: error.message });
  }
}

export async function getSucursalById(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  try {
    const id = parseInt(req.params.id);
    const sucursal = await prisma.organizacion_sucursal.findUnique({
      where: { id_organizacion_sucursal: id },
      include: { organizacion: true, instalacion: true }
    });
    
    if (!sucursal) {
      return reply.status(404).send({ error: 'Sucursal no encontrada' });
    }
    
    reply.send(sucursal);
  } catch (error: any) {
    reply.status(500).send({ error: error.message });
  }
}

export async function updateSucursal(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  try {
    const id = parseInt(req.params.id);
    const body = updateSucursalSchema.parse(req.body);

    const data: any = {
      id_organizacion: body.id_organizacion,
      nombre_sucursal: body.nombre_sucursal,
      estado: body.estado as any
    };

    // Permitir actualizar campos extra si vienen (sin romper compatibilidad)
    const raw: any = req.body as any;
    if (raw.telefono_sucursal !== undefined) data.telefono_sucursal = raw.telefono_sucursal;
    if (raw.correo_sucursal !== undefined) data.correo_sucursal = raw.correo_sucursal;
    if (raw.id_estado !== undefined) data.id_estado = raw.id_estado;
    if (raw.id_municipio !== undefined) data.id_municipio = raw.id_municipio;
    
    const sucursal = await prisma.organizacion_sucursal.update({
      where: { id_organizacion_sucursal: id },
      data
    });
    
    reply.send(sucursal);
  } catch (error: any) {
    reply.status(400).send({ error: error.message });
  }
}

export async function deleteSucursal(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  try {
    const id = parseInt(req.params.id);
    await prisma.organizacion_sucursal.delete({
      where: { id_organizacion_sucursal: id }
    });
    
    reply.status(204).send();
  } catch (error: any) {
    reply.status(400).send({ error: error.message });
  }
}
