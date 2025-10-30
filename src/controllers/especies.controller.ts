import type { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../repositories/prisma.js';

// CATÁLOGO ESPECIES
export async function createCatalogoEspecie(req: FastifyRequest, reply: FastifyReply) {
  try {
    const body = req.body as any;
    const especie = await prisma.catalogoEspecie.create({ data: body });
    reply.status(201).send(especie);
  } catch (error: any) {
    reply.status(400).send({ error: error.message });
  }
}

export async function getCatalogoEspecies(_req: FastifyRequest, reply: FastifyReply) {
  try {
    const especies = await prisma.catalogoEspecie.findMany();
    reply.send(especies);
  } catch (error: any) {
    reply.status(500).send({ error: error.message });
  }
}

export async function getCatalogoEspecieById(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  try {
    const id = parseInt(req.params.id);
    const especie = await prisma.catalogoEspecie.findUnique({
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
    
    const especie = await prisma.catalogoEspecie.update({
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
    await prisma.catalogoEspecie.delete({ where: { id_especie: id } });
    reply.status(204).send();
  } catch (error: any) {
    reply.status(400).send({ error: error.message });
  }
}

// ESPECIES INSTALADAS
export async function createEspecieInstalada(req: FastifyRequest, reply: FastifyReply) {
  try {
    const body = req.body as any;
    const especieInstalada = await prisma.especieInstalada.create({ data: body });
    reply.status(201).send(especieInstalada);
  } catch (error: any) {
    reply.status(400).send({ error: error.message });
  }
}

export async function getEspeciesInstaladas(_req: FastifyRequest, reply: FastifyReply) {
  try {
    const especies = await prisma.especieInstalada.findMany({
      include: { catalogoEspecie: true }
    });
    reply.send(especies);
  } catch (error: any) {
    reply.status(500).send({ error: error.message });
  }
}

export async function getEspecieInstaladaById(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  try {
    const id = parseInt(req.params.id);
    const especie = await prisma.especieInstalada.findUnique({
      where: { id_especie_instalada: id },
      include: { catalogoEspecie: true, trackings: true }
    });
    
    if (!especie) {
      return reply.status(404).send({ error: 'Especie instalada no encontrada' });
    }
    
    reply.send(especie);
  } catch (error: any) {
    reply.status(500).send({ error: error.message });
  }
}

export async function updateEspecieInstalada(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  try {
    const id = parseInt(req.params.id);
    const body = req.body as any;
    
    const especie = await prisma.especieInstalada.update({
      where: { id_especie_instalada: id },
      data: body
    });
    
    reply.send(especie);
  } catch (error: any) {
    reply.status(400).send({ error: error.message });
  }
}

export async function deleteEspecieInstalada(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  try {
    const id = parseInt(req.params.id);
    await prisma.especieInstalada.delete({ where: { id_especie_instalada: id } });
    reply.status(204).send();
  } catch (error: any) {
    reply.status(400).send({ error: error.message });
  }
}

// ESPECIE PARÁMETRO
export async function createEspecieParametro(req: FastifyRequest, reply: FastifyReply) {
  try {
    const body = req.body as any;
    const especieParametro = await prisma.especieParametro.create({ data: body });
    reply.status(201).send(especieParametro);
  } catch (error: any) {
    reply.status(400).send({ error: error.message });
  }
}

export async function getEspeciesParametros(_req: FastifyRequest, reply: FastifyReply) {
  try {
    const parametros = await prisma.especieParametro.findMany({
      include: { parametro: true }
    });
    reply.send(parametros);
  } catch (error: any) {
    reply.status(500).send({ error: error.message });
  }
}

export async function getEspecieParametroById(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  try {
    const id = parseInt(req.params.id);
    const parametro = await prisma.especieParametro.findUnique({
      where: { id_especie_parametro: id },
      include: { parametro: true }
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
    
    const parametro = await prisma.especieParametro.update({
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
    await prisma.especieParametro.delete({ where: { id_especie_parametro: id } });
    reply.status(204).send();
  } catch (error: any) {
    reply.status(400).send({ error: error.message });
  }
}

// PROCESOS
export async function createProceso(req: FastifyRequest, reply: FastifyReply) {
  try {
    const body = req.body as any;
    const proceso = await prisma.proceso.create({ data: body });
    reply.status(201).send(proceso);
  } catch (error: any) {
    reply.status(400).send({ error: error.message });
  }
}

export async function getProcesos(_req: FastifyRequest, reply: FastifyReply) {
  try {
    const procesos = await prisma.proceso.findMany();
    reply.send(procesos);
  } catch (error: any) {
    reply.status(500).send({ error: error.message });
  }
}

export async function getProcesoById(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  try {
    const id = parseInt(req.params.id);
    const proceso = await prisma.proceso.findUnique({
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
    
    const proceso = await prisma.proceso.update({
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
    await prisma.proceso.delete({ where: { id_proceso: id } });
    reply.status(204).send();
  } catch (error: any) {
    reply.status(400).send({ error: error.message });
  }
}
