import type { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../repositories/prisma.js';

// CATÁLOGO ESPECIES
export async function createCatalogoEspecie(req: FastifyRequest, reply: FastifyReply) {
  try {
    const body = req.body as any;
    const especie = await prisma.especies.create({ data: body });
    reply.status(201).send(especie);
  } catch (error: any) {
    reply.status(400).send({ error: error.message });
  }
}

export async function getCatalogoEspecies(_req: FastifyRequest, reply: FastifyReply) {
  try {
    const especies = await prisma.especies.findMany();
    reply.send(especies);
  } catch (error: any) {
    reply.status(500).send({ error: error.message });
  }
}

export async function getCatalogoEspecieById(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  try {
    const id = parseInt(req.params.id);
    const especie = await prisma.especies.findUnique({
      where: { id_especie: id }
    });
    
    if (!especie) {
      return reply.status(404).send({ error: 'Especie no encontrada' });
    }
    
    reply.send(especie);
  } catch (error: any) {
    reply.status(500).send({ error: error.message });
  }
}

export async function updateCatalogoEspecie(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  try {
    const id = parseInt(req.params.id);
    const body = req.body as any;
    
    const especie = await prisma.especies.update({
      where: { id_especie: id },
      data: body
    });
    
    reply.send(especie);
  } catch (error: any) {
    reply.status(400).send({ error: error.message });
  }
}

export async function deleteCatalogoEspecie(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  try {
    const id = parseInt(req.params.id);
    await prisma.especies.delete({ where: { id_especie: id } });
    reply.status(204).send();
  } catch (error: any) {
    reply.status(400).send({ error: error.message });
  }
}

// ESPECIES INSTALADAS - Nota: No existe modelo separado en schema, usar procesos o queries directas
// Por ahora, estas funciones están comentadas ya que no hay modelo especie_instalada en el schema
// Si necesitas esta funcionalidad, deberías agregar el modelo al schema o usar queries raw
export async function createEspecieInstalada(req: FastifyRequest, reply: FastifyReply) {
  reply.status(501).send({ error: 'Funcionalidad no implementada - modelo no existe en schema' });
}

export async function getEspeciesInstaladas(_req: FastifyRequest, reply: FastifyReply) {
  reply.status(501).send({ error: 'Funcionalidad no implementada - modelo no existe en schema' });
}

export async function getEspecieInstaladaById(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  reply.status(501).send({ error: 'Funcionalidad no implementada - modelo no existe en schema' });
}

export async function updateEspecieInstalada(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  reply.status(501).send({ error: 'Funcionalidad no implementada - modelo no existe en schema' });
}

export async function deleteEspecieInstalada(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  reply.status(501).send({ error: 'Funcionalidad no implementada - modelo no existe en schema' });
}

// ESPECIE PARÁMETRO
export async function createEspecieParametro(req: FastifyRequest, reply: FastifyReply) {
  try {
    const body = req.body as any;
    const especieParametro = await prisma.especie_parametro.create({ data: body });
    reply.status(201).send(especieParametro);
  } catch (error: any) {
    reply.status(400).send({ error: error.message });
  }
}

export async function getEspeciesParametros(_req: FastifyRequest, reply: FastifyReply) {
  try {
    const parametros = await prisma.especie_parametro.findMany({
      include: { parametros: true }
    });
    reply.send(parametros);
  } catch (error: any) {
    reply.status(500).send({ error: error.message });
  }
}

export async function getEspecieParametroById(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  try {
    const id = parseInt(req.params.id);
    const parametro = await prisma.especie_parametro.findUnique({
      where: { id_especie_parametro: id },
      include: { parametros: true }
    });
    
    if (!parametro) {
      return reply.status(404).send({ error: 'Especie parámetro no encontrado' });
    }
    
    reply.send(parametro);
  } catch (error: any) {
    reply.status(500).send({ error: error.message });
  }
}

export async function updateEspecieParametro(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  try {
    const id = parseInt(req.params.id);
    const body = req.body as any;
    
    const parametro = await prisma.especie_parametro.update({
      where: { id_especie_parametro: id },
      data: body
    });
    
    reply.send(parametro);
  } catch (error: any) {
    reply.status(400).send({ error: error.message });
  }
}

export async function deleteEspecieParametro(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  try {
    const id = parseInt(req.params.id);
    await prisma.especie_parametro.delete({ where: { id_especie_parametro: id } });
    reply.status(204).send();
  } catch (error: any) {
    reply.status(400).send({ error: error.message });
  }
}

// PROCESOS
export async function createProceso(req: FastifyRequest, reply: FastifyReply) {
  try {
    const body = req.body as any;
    const proceso = await prisma.procesos.create({ data: body });
    reply.status(201).send(proceso);
  } catch (error: any) {
    reply.status(400).send({ error: error.message });
  }
}

export async function getProcesos(_req: FastifyRequest, reply: FastifyReply) {
  try {
    const procesos = await prisma.procesos.findMany();
    reply.send(procesos);
  } catch (error: any) {
    reply.status(500).send({ error: error.message });
  }
}

export async function getProcesoById(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  try {
    const id = parseInt(req.params.id);
    const proceso = await prisma.procesos.findUnique({
      where: { id_proceso: id }
    });
    
    if (!proceso) {
      return reply.status(404).send({ error: 'Proceso no encontrado' });
    }
    
    reply.send(proceso);
  } catch (error: any) {
    reply.status(500).send({ error: error.message });
  }
}

export async function updateProceso(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  try {
    const id = parseInt(req.params.id);
    const body = req.body as any;
    
    const proceso = await prisma.procesos.update({
      where: { id_proceso: id },
      data: body
    });
    
    reply.send(proceso);
  } catch (error: any) {
    reply.status(400).send({ error: error.message });
  }
}

export async function deleteProceso(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  try {
    const id = parseInt(req.params.id);
    await prisma.procesos.delete({ where: { id_proceso: id } });
    reply.status(204).send();
  } catch (error: any) {
    reply.status(400).send({ error: error.message });
  }
}
