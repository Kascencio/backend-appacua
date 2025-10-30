import type { FastifyRequest, FastifyReply } from 'fastify';

export async function authenticateJWT(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    await request.jwtVerify();
  } catch (err) {
    reply.status(401).send({ error: 'No autorizado' });
  }
}

export async function optionalAuth(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  try {
    await request.jwtVerify();
  } catch {
    // Optional auth - continue without user
  }
}
