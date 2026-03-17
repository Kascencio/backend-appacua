import type { FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '../repositories/prisma.js';
import {
  createExtraCrecimientoOstionCapturaSchema,
  crecimientoOstionMedicionesSchema,
  crecimientoOstionSchema,
  updateCrecimientoOstionCapturaSchema,
} from '../utils/validators.js';
import { canManageResources, requireRequestScope } from '../utils/access-control.js';
import {
  canAccessProceso,
  createExtraProcesoCrecimientoOstionCaptura,
  getProcesoWithCrecimiento,
  serializeCrecimientoOstionConfig,
  syncProcesoCrecimientoOstionConfig,
  updateProcesoCrecimientoOstionCaptura,
  upsertProcesoCrecimientoOstionMediciones,
} from '../services/crecimiento-ostion.service.js';

async function getAuthorizedProceso(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  const scope = await requireRequestScope(req, reply);
  if (!scope) return null;

  const idProceso = Number.parseInt(req.params.id, 10);
  if (!Number.isFinite(idProceso) || idProceso <= 0) {
    reply.status(400).send({ error: 'id de proceso inválido' });
    return null;
  }

  const proceso = await getProcesoWithCrecimiento(idProceso);
  if (!proceso) {
    reply.status(404).send({ error: 'Proceso no encontrado' });
    return null;
  }

  if (!canAccessProceso(scope, proceso)) {
    reply.status(403).send({ error: 'No tiene acceso a este proceso' });
    return null;
  }

  return { scope, proceso, idProceso };
}

export async function getProcesoCrecimientoOstion(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  try {
    const authorized = await getAuthorizedProceso(req, reply);
    if (!authorized) return;

    reply.send(serializeCrecimientoOstionConfig(authorized.proceso.crecimiento_ostion_config, { includeMeasurements: true }));
  } catch (error: any) {
    reply.status(500).send({ error: error.message });
  }
}

export async function updateProcesoCrecimientoOstion(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  try {
    const authorized = await getAuthorizedProceso(req, reply);
    if (!authorized) return;
    if (!canManageResources(authorized.scope)) {
      return reply.status(403).send({ error: 'No tiene permisos para configurar crecimiento del ostión' });
    }

    const body = crecimientoOstionSchema.parse(req.body || {});
    const crecimiento = await prisma.$transaction((tx) =>
      syncProcesoCrecimientoOstionConfig(tx, {
        idProceso: authorized.idProceso,
        fechaInicio: authorized.proceso.fecha_inicio,
        fechaFinal: authorized.proceso.fecha_final,
        crecimiento: body,
      }),
    );

    reply.send(crecimiento);
  } catch (error: any) {
    reply.status(400).send({ error: error.message });
  }
}

export async function createProcesoCrecimientoOstionCaptura(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  try {
    const authorized = await getAuthorizedProceso(req, reply);
    if (!authorized) return;

    const body = createExtraCrecimientoOstionCapturaSchema.parse(req.body || {});
    const crecimiento = await prisma.$transaction((tx) =>
      createExtraProcesoCrecimientoOstionCaptura(tx, authorized.idProceso, body),
    );

    reply.status(201).send(crecimiento);
  } catch (error: any) {
    reply.status(400).send({ error: error.message });
  }
}

export async function updateProcesoCrecimientoOstionCapturaById(
  req: FastifyRequest<{ Params: { id: string; capturaId: string } }>,
  reply: FastifyReply,
) {
  try {
    const authorized = await getAuthorizedProceso(
      req as unknown as FastifyRequest<{ Params: { id: string } }>,
      reply,
    );
    if (!authorized) return;

    const idCaptura = Number.parseInt(req.params.capturaId, 10);
    if (!Number.isFinite(idCaptura) || idCaptura <= 0) {
      return reply.status(400).send({ error: 'id de captura inválido' });
    }

    const body = updateCrecimientoOstionCapturaSchema.parse(req.body || {});
    const crecimiento = await prisma.$transaction((tx) =>
      updateProcesoCrecimientoOstionCaptura(tx, authorized.idProceso, idCaptura, body),
    );

    reply.send(crecimiento);
  } catch (error: any) {
    reply.status(400).send({ error: error.message });
  }
}

export async function saveProcesoCrecimientoOstionMediciones(
  req: FastifyRequest<{ Params: { id: string; capturaId: string } }>,
  reply: FastifyReply,
) {
  try {
    const authorized = await getAuthorizedProceso(
      req as unknown as FastifyRequest<{ Params: { id: string } }>,
      reply,
    );
    if (!authorized) return;

    const idCaptura = Number.parseInt(req.params.capturaId, 10);
    if (!Number.isFinite(idCaptura) || idCaptura <= 0) {
      return reply.status(400).send({ error: 'id de captura inválido' });
    }

    const body = crecimientoOstionMedicionesSchema.parse(req.body || {});
    const crecimiento = await prisma.$transaction((tx) =>
      upsertProcesoCrecimientoOstionMediciones(tx, authorized.idProceso, idCaptura, body),
    );

    reply.send(crecimiento);
  } catch (error: any) {
    reply.status(400).send({ error: error.message });
  }
}
