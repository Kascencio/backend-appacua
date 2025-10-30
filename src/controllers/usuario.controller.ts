import type { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../repositories/prisma.js';

// USUARIOS
export async function createUsuario(req: FastifyRequest, reply: FastifyReply) {
  try {
    const body = req.body as any;
    const usuario = await prisma.usuario.create({ data: body });
    reply.status(201).send(usuario);
  } catch (error: any) {
    reply.status(400).send({ error: error.message });
  }
}

export async function getUsuarios(_req: FastifyRequest, reply: FastifyReply) {
  try {
    const usuarios = await prisma.usuario.findMany({
      select: {
        id_usuario: true,
        nombre: true,
        email: true,
        id_tipo_rol: true,
        activo: true,
        fecha_creacion: true,
        tipoRol: true,
        password_hash: false
      }
    });
    reply.send(usuarios);
  } catch (error: any) {
    reply.status(500).send({ error: error.message });
  }
}

export async function getUsuarioById(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  try {
    const id = parseInt(req.params.id);
    const usuario = await prisma.usuario.findUnique({
      where: { id_usuario: id },
      select: {
        id_usuario: true,
        nombre: true,
        email: true,
        id_tipo_rol: true,
        activo: true,
        fecha_creacion: true,
        tipoRol: true,
        password_hash: false
      }
    });
    
    if (!usuario) {
      return reply.status(404).send({ error: 'Usuario no encontrado' });
    }
    
    reply.send(usuario);
  } catch (error: any) {
    reply.status(500).send({ error: error.message });
  }
}

export async function updateUsuario(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  try {
    const id = parseInt(req.params.id);
    const body = req.body as any;
    
    const usuario = await prisma.usuario.update({
      where: { id_usuario: id },
      data: body
    });
    
    reply.send(usuario);
  } catch (error: any) {
    reply.status(400).send({ error: error.message });
  }
}

export async function deleteUsuario(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  try {
    const id = parseInt(req.params.id);
    await prisma.usuario.delete({ where: { id_usuario: id } });
    reply.status(204).send();
  } catch (error: any) {
    reply.status(400).send({ error: error.message });
  }
}

// TIPO ROL
export async function createTipoRol(req: FastifyRequest, reply: FastifyReply) {
  try {
    const body = req.body as any;
    const tipoRol = await prisma.tipoRol.create({ data: body });
    reply.status(201).send(tipoRol);
  } catch (error: any) {
    reply.status(400).send({ error: error.message });
  }
}

export async function getTiposRol(_req: FastifyRequest, reply: FastifyReply) {
  try {
    const roles = await prisma.tipoRol.findMany();
    reply.send(roles);
  } catch (error: any) {
    reply.status(500).send({ error: error.message });
  }
}

export async function getTipoRolById(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  try {
    const id = parseInt(req.params.id);
    const rol = await prisma.tipoRol.findUnique({
      where: { id_tipo_rol: id }
    });
    
    if (!rol) {
      return reply.status(404).send({ error: 'Tipo de rol no encontrado' });
    }
    
    reply.send(rol);
  } catch (error: any) {
    reply.status(500).send({ error: error.message });
  }
}

export async function updateTipoRol(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  try {
    const id = parseInt(req.params.id);
    const body = req.body as any;
    
    const rol = await prisma.tipoRol.update({
      where: { id_tipo_rol: id },
      data: body
    });
    
    reply.send(rol);
  } catch (error: any) {
    reply.status(400).send({ error: error.message });
  }
}

export async function deleteTipoRol(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  try {
    const id = parseInt(req.params.id);
    await prisma.tipoRol.delete({ where: { id_tipo_rol: id } });
    reply.status(204).send();
  } catch (error: any) {
    reply.status(400).send({ error: error.message });
  }
}

// ALERTAS
export async function createAlerta(req: FastifyRequest, reply: FastifyReply) {
  try {
    const body = req.body as any;
    const alerta = await prisma.alerta.create({ data: body });
    reply.status(201).send(alerta);
  } catch (error: any) {
    reply.status(400).send({ error: error.message });
  }
}

export async function getAlertas(req: FastifyRequest<{ Querystring: { estado?: string } }>, reply: FastifyReply) {
  try {
    const { estado } = req.query;
    const alertas = await prisma.alerta.findMany({
      where: estado ? { estado } : undefined,
      orderBy: { fecha_generada: 'desc' }
    });
    reply.send(alertas);
  } catch (error: any) {
    reply.status(500).send({ error: error.message });
  }
}

export async function getAlertaById(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  try {
    const id = parseInt(req.params.id);
    const alerta = await prisma.alerta.findUnique({
      where: { id_alerta: id }
    });
    
    if (!alerta) {
      return reply.status(404).send({ error: 'Alerta no encontrada' });
    }
    
    reply.send(alerta);
  } catch (error: any) {
    reply.status(500).send({ error: error.message });
  }
}

export async function updateAlerta(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  try {
    const id = parseInt(req.params.id);
    const body = req.body as any;
    
    const alerta = await prisma.alerta.update({
      where: { id_alerta: id },
      data: body
    });
    
    reply.send(alerta);
  } catch (error: any) {
    reply.status(400).send({ error: error.message });
  }
}

export async function deleteAlerta(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  try {
    const id = parseInt(req.params.id);
    await prisma.alerta.delete({ where: { id_alerta: id } });
    reply.status(204).send();
  } catch (error: any) {
    reply.status(400).send({ error: error.message });
  }
}

// PARÁMETROS
export async function createParametro(req: FastifyRequest, reply: FastifyReply) {
  try {
    const body = req.body as any;
    const parametro = await prisma.parametro.create({ data: body });
    reply.status(201).send(parametro);
  } catch (error: any) {
    reply.status(400).send({ error: error.message });
  }
}

export async function getParametros(_req: FastifyRequest, reply: FastifyReply) {
  try {
    const parametros = await prisma.parametro.findMany();
    reply.send(parametros);
  } catch (error: any) {
    reply.status(500).send({ error: error.message });
  }
}

export async function getParametroById(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  try {
    const id = parseInt(req.params.id);
    const parametro = await prisma.parametro.findUnique({
      where: { id_parametro: id }
    });
    
    if (!parametro) {
      return reply.status(404).send({ error: 'Parámetro no encontrado' });
    }
    
    reply.send(parametro);
  } catch (error: any) {
    reply.status(500).send({ error: error.message });
  }
}

export async function updateParametro(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  try {
    const id = parseInt(req.params.id);
    const body = req.body as any;
    
    const parametro = await prisma.parametro.update({
      where: { id_parametro: id },
      data: body
    });
    
    reply.send(parametro);
  } catch (error: any) {
    reply.status(400).send({ error: error.message });
  }
}

export async function deleteParametro(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  try {
    const id = parseInt(req.params.id);
    await prisma.parametro.delete({ where: { id_parametro: id } });
    reply.status(204).send();
  } catch (error: any) {
    reply.status(400).send({ error: error.message });
  }
}
