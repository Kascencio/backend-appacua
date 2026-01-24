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

// INSTALACIONES
export async function createInstalacion(req: FastifyRequest, reply: FastifyReply) {
  try {
    const body = createInstalacionSchema.parse(req.body);

    const rawSucursalId = body.id_organizacion_sucursal ?? body.id_empresa_sucursal;
    const sucursalId = normalizeOrganizacionSucursalId(Number(rawSucursalId));

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
      data.id_organizacion_sucursal = normalizeOrganizacionSucursalId(Number(rawSucursalId));
    }
    
    const instalacion = await prisma.instalacion.update({
      where: { id_instalacion: id },
      data
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
    const body = createSensorInstaladoSchema.parse(req.body);

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
    const body = updateSensorInstaladoSchema.parse(req.body);

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
