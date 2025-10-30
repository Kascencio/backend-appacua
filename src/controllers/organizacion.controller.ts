import type { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../repositories/prisma.js';
import { createOrganizacionSchema, updateOrganizacionSchema } from '../utils/validators.js';

export async function createOrganizacion(req: FastifyRequest, reply: FastifyReply) {
  try {
    const body = createOrganizacionSchema.parse(req.body);
    const organizacion = await prisma.organizacion.create({ data: body });
    reply.status(201).send(organizacion);
  } catch (error: any) {
    reply.status(400).send({ error: error.message || 'Error al crear organización' });
  }
}

export async function getOrganizaciones(_req: FastifyRequest, reply: FastifyReply) {
  try {
    const organizaciones = await prisma.organizacion.findMany({
      include: { sucursales: true }
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
      include: { sucursales: true }
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
    
    const organizacion = await prisma.organizacion.update({
      where: { id_organizacion: id },
      data: body
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
    const body = req.body as any;
    const sucursal = await prisma.organizacionSucursal.create({ data: body });
    reply.status(201).send(sucursal);
  } catch (error: any) {
    reply.status(400).send({ error: error.message });
  }
}

export async function getSucursales(_req: FastifyRequest, reply: FastifyReply) {
  try {
    const sucursales = await prisma.organizacionSucursal.findMany({
      include: { organizacion: true, instalaciones: true }
    });
    reply.send(sucursales);
  } catch (error: any) {
    reply.status(500).send({ error: error.message });
  }
}

export async function getSucursalById(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  try {
    const id = parseInt(req.params.id);
    const sucursal = await prisma.organizacionSucursal.findUnique({
      where: { id_organizacion_sucursal: id },
      include: { organizacion: true, instalaciones: true }
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
    const body = req.body as any;
    
    const sucursal = await prisma.organizacionSucursal.update({
      where: { id_organizacion_sucursal: id },
      data: body
    });
    
    reply.send(sucursal);
  } catch (error: any) {
    reply.status(400).send({ error: error.message });
  }
}

export async function deleteSucursal(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  try {
    const id = parseInt(req.params.id);
    await prisma.organizacionSucursal.delete({
      where: { id_organizacion_sucursal: id }
    });
    
    reply.status(204).send();
  } catch (error: any) {
    reply.status(400).send({ error: error.message });
  }
}
