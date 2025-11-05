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
      include: { organizacion_sucursal: true, sensor_instalado: true }
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
      include: { organizacion_sucursal: true, sensor_instalado: { include: { catalogo_sensores: true } } }
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
    const sensor = await prisma.catalogo_sensores.create({ data: body });
    reply.status(201).send(sensor);
  } catch (error: any) {
    reply.status(400).send({ error: error.message });
  }
}

export async function getCatalogoSensores(_req: FastifyRequest, reply: FastifyReply) {
  try {
    const sensores = await prisma.catalogo_sensores.findMany();
    reply.send(sensores);
  } catch (error: any) {
    reply.status(500).send({ error: error.message });
  }
}

export async function getCatalogoSensorById(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  try {
    const id = parseInt(req.params.id);
    const sensor = await prisma.catalogo_sensores.findUnique({
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
    
    const sensor = await prisma.catalogo_sensores.update({
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
    await prisma.catalogo_sensores.delete({ where: { id_sensor: id } });
    reply.status(204).send();
  } catch (error: any) {
    reply.status(400).send({ error: error.message });
  }
}

// SENSORES INSTALADOS
export async function createSensorInstalado(req: FastifyRequest, reply: FastifyReply) {
  try {
    const body = req.body as any;
    const sensorInstalado = await prisma.sensor_instalado.create({ data: body });
    reply.status(201).send(sensorInstalado);
  } catch (error: any) {
    reply.status(400).send({ error: error.message });
  }
}

export async function getSensoresInstalados(_req: FastifyRequest, reply: FastifyReply) {
  try {
    const sensores = await prisma.sensor_instalado.findMany({
      include: { instalacion: true, catalogo_sensores: true }
    });
    reply.send(sensores);
  } catch (error: any) {
    reply.status(500).send({ error: error.message });
  }
}

export async function getSensorInstaladoById(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  try {
    const id = parseInt(req.params.id);
    const sensor = await prisma.sensor_instalado.findUnique({
      where: { id_sensor_instalado: id },
      include: { instalacion: true, catalogo_sensores: true }
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
    
    const sensor = await prisma.sensor_instalado.update({
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
    await prisma.sensor_instalado.delete({ where: { id_sensor_instalado: id } });
    reply.status(204).send();
  } catch (error: any) {
    reply.status(400).send({ error: error.message });
  }
}
