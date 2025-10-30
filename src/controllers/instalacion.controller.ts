import type { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../repositories/prisma.js';

// INSTALACIONES
export async function createInstalacion(req: FastifyRequest, reply: FastifyReply) {
  try {
    const body = req.body as any;
    const instalacion = await prisma.instalacion.create({ data: body });
    reply.status(201).send(instalacion);
  } catch (error: any) {
    reply.status(400).send({ error: error.message });
  }
}

export async function getInstalaciones(_req: FastifyRequest, reply: FastifyReply) {
  try {
    const instalaciones = await prisma.instalacion.findMany({
      include: { sucursal: true, sensores: true }
    });
    reply.send(instalaciones);
  } catch (error: any) {
    reply.status(500).send({ error: error.message });
  }
}

export async function getInstalacionById(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  try {
    const id = parseInt(req.params.id);
    const instalacion = await prisma.instalacion.findUnique({
      where: { id_instalacion: id },
      include: { sucursal: true, sensores: { include: { catalogo: true } } }
    });
    
    if (!instalacion) {
      return reply.status(404).send({ error: 'Instalación no encontrada' });
    }
    
    reply.send(instalacion);
  } catch (error: any) {
    reply.status(500).send({ error: error.message });
  }
}

export async function updateInstalacion(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  try {
    const id = parseInt(req.params.id);
    const body = req.body as any;
    
    const instalacion = await prisma.instalacion.update({
      where: { id_instalacion: id },
      data: body
    });
    
    reply.send(instalacion);
  } catch (error: any) {
    reply.status(400).send({ error: error.message });
  }
}

export async function deleteInstalacion(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  try {
    const id = parseInt(req.params.id);
    await prisma.instalacion.delete({ where: { id_instalacion: id } });
    reply.status(204).send();
  } catch (error: any) {
    reply.status(400).send({ error: error.message });
  }
}

// CATÁLOGO SENSORES
export async function createCatalogoSensor(req: FastifyRequest, reply: FastifyReply) {
  try {
    const body = req.body as any;
    const sensor = await prisma.catalogoSensor.create({ data: body });
    reply.status(201).send(sensor);
  } catch (error: any) {
    reply.status(400).send({ error: error.message });
  }
}

export async function getCatalogoSensores(_req: FastifyRequest, reply: FastifyReply) {
  try {
    const sensores = await prisma.catalogoSensor.findMany();
    reply.send(sensores);
  } catch (error: any) {
    reply.status(500).send({ error: error.message });
  }
}

export async function getCatalogoSensorById(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  try {
    const id = parseInt(req.params.id);
    const sensor = await prisma.catalogoSensor.findUnique({
      where: { id_sensor: id }
    });
    
    if (!sensor) {
      return reply.status(404).send({ error: 'Sensor no encontrado' });
    }
    
    reply.send(sensor);
  } catch (error: any) {
    reply.status(500).send({ error: error.message });
  }
}

export async function updateCatalogoSensor(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  try {
    const id = parseInt(req.params.id);
    const body = req.body as any;
    
    const sensor = await prisma.catalogoSensor.update({
      where: { id_sensor: id },
      data: body
    });
    
    reply.send(sensor);
  } catch (error: any) {
    reply.status(400).send({ error: error.message });
  }
}

export async function deleteCatalogoSensor(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  try {
    const id = parseInt(req.params.id);
    await prisma.catalogoSensor.delete({ where: { id_sensor: id } });
    reply.status(204).send();
  } catch (error: any) {
    reply.status(400).send({ error: error.message });
  }
}

// SENSORES INSTALADOS
export async function createSensorInstalado(req: FastifyRequest, reply: FastifyReply) {
  try {
    const body = req.body as any;
    const sensorInstalado = await prisma.sensorInstalado.create({ data: body });
    reply.status(201).send(sensorInstalado);
  } catch (error: any) {
    reply.status(400).send({ error: error.message });
  }
}

export async function getSensoresInstalados(_req: FastifyRequest, reply: FastifyReply) {
  try {
    const sensores = await prisma.sensorInstalado.findMany({
      include: { instalacion: true, catalogo: true }
    });
    reply.send(sensores);
  } catch (error: any) {
    reply.status(500).send({ error: error.message });
  }
}

export async function getSensorInstaladoById(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  try {
    const id = parseInt(req.params.id);
    const sensor = await prisma.sensorInstalado.findUnique({
      where: { id_sensor_instalado: id },
      include: { instalacion: true, catalogo: true }
    });
    
    if (!sensor) {
      return reply.status(404).send({ error: 'Sensor instalado no encontrado' });
    }
    
    reply.send(sensor);
  } catch (error: any) {
    reply.status(500).send({ error: error.message });
  }
}

export async function updateSensorInstalado(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  try {
    const id = parseInt(req.params.id);
    const body = req.body as any;
    
    const sensor = await prisma.sensorInstalado.update({
      where: { id_sensor_instalado: id },
      data: body
    });
    
    reply.send(sensor);
  } catch (error: any) {
    reply.status(400).send({ error: error.message });
  }
}

export async function deleteSensorInstalado(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  try {
    const id = parseInt(req.params.id);
    await prisma.sensorInstalado.delete({ where: { id_sensor_instalado: id } });
    reply.status(204).send();
  } catch (error: any) {
    reply.status(400).send({ error: error.message });
  }
}
