import type { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../repositories/prisma.js';
import { createProcesoSchema, updateProcesoSchema } from '../utils/validators.js';
import {
  buildInstalacionScopeWhere,
  canAccessFacility,
  canManageResources,
  requireRequestScope,
} from '../utils/access-control.js';

type EspecieParametroPayload = {
  id_parametro: number;
  Rmin: number;
  Rmax: number;
};

function toPositiveInt(value: unknown): number | null {
  const num = typeof value === 'string' ? Number(value) : (typeof value === 'number' ? value : NaN);
  if (!Number.isFinite(num)) return null;
  const parsed = Math.trunc(num);
  return parsed > 0 ? parsed : null;
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function normalizeDate(value: Date | string): string {
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

function computeProcesoEstado(fechaInicio: Date | string, fechaFinal: Date | string): 'planificado' | 'en_progreso' | 'completado' {
  const now = new Date();
  const inicio = new Date(fechaInicio);
  const fin = new Date(fechaFinal);

  if (now < inicio) return 'planificado';
  if (now > fin) return 'completado';
  return 'en_progreso';
}

function parseEspecieParametrosPayload(raw: unknown): EspecieParametroPayload[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    throw new Error('parametros debe ser un arreglo');
  }

  const normalized = new Map<number, EspecieParametroPayload>();

  for (const item of raw) {
    const row = (item || {}) as Record<string, unknown>;
    const idParametro = toPositiveInt(row.id_parametro);
    const rmin = toNullableNumber(row.Rmin ?? row.rango_min);
    const rmax = toNullableNumber(row.Rmax ?? row.rango_max);

    if (!idParametro) {
      throw new Error('Cada parámetro debe incluir id_parametro válido');
    }
    if (rmin === null || rmax === null) {
      throw new Error(`El parámetro ${idParametro} requiere Rmin y Rmax`);
    }
    if (rmin >= rmax) {
      throw new Error(`Rmin debe ser menor que Rmax para el parámetro ${idParametro}`);
    }

    normalized.set(idParametro, {
      id_parametro: idParametro,
      Rmin: rmin,
      Rmax: rmax,
    });
  }

  return [...normalized.values()];
}

async function syncEspecieParametros(
  tx: any,
  idEspecie: number,
  parametros: EspecieParametroPayload[],
): Promise<void> {
  const existing = await tx.especie_parametro.findMany({
    where: { id_especie: idEspecie },
    orderBy: { id_especie_parametro: 'asc' },
  });

  const incomingByParametro = new Map<number, EspecieParametroPayload>(
    parametros.map((item) => [item.id_parametro, item]),
  );

  const existingByParametro = new Map<number, typeof existing>();
  for (const row of existing) {
    const current = existingByParametro.get(row.id_parametro) ?? [];
    current.push(row);
    existingByParametro.set(row.id_parametro, current);
  }

  const idsToDelete: number[] = [];

  for (const row of existing) {
    if (!incomingByParametro.has(row.id_parametro)) {
      idsToDelete.push(row.id_especie_parametro);
    }
  }

  for (const [idParametro, incoming] of incomingByParametro.entries()) {
    const rows = existingByParametro.get(idParametro) ?? [];
    const first = rows[0];

    if (first) {
      await tx.especie_parametro.update({
        where: { id_especie_parametro: first.id_especie_parametro },
        data: {
          Rmin: incoming.Rmin,
          Rmax: incoming.Rmax,
        },
      });

      if (rows.length > 1) {
        idsToDelete.push(...rows.slice(1).map((row: { id_especie_parametro: number }) => row.id_especie_parametro));
      }
      continue;
    }

    await tx.especie_parametro.create({
      data: {
        id_especie: idEspecie,
        id_parametro: idParametro,
        Rmin: incoming.Rmin,
        Rmax: incoming.Rmax,
      },
    });
  }

  if (idsToDelete.length > 0) {
    await tx.especie_parametro.deleteMany({
      where: {
        id_especie_parametro: { in: idsToDelete },
      },
    });
  }
}

function serializeEspecie(especie: any) {
  return {
    ...especie,
    nombre_comun: especie.nombre,
    nombre_cientifico: especie.nombre_cientifico ?? especie.nombre,
    temperatura_optima_min: toNullableNumber(especie.temperatura_optima_min),
    temperatura_optima_max: toNullableNumber(especie.temperatura_optima_max),
    ph_optimo_min: toNullableNumber(especie.ph_optimo_min),
    ph_optimo_max: toNullableNumber(especie.ph_optimo_max),
    oxigeno_optimo_min: toNullableNumber(especie.oxigeno_optimo_min),
    oxigeno_optimo_max: toNullableNumber(especie.oxigeno_optimo_max),
    salinidad_optima_min: toNullableNumber(especie.salinidad_optima_min),
    salinidad_optima_max: toNullableNumber(especie.salinidad_optima_max),
    activo: especie.estado !== 'inactiva',
  };
}

function serializeEspecieParametro(parametro: any) {
  return {
    ...parametro,
    nombre_parametro: parametro.parametros?.nombre_parametro,
    unidad_medida: parametro.parametros?.unidad_medida,
    nombre_especie: parametro.especies?.nombre,
  };
}

function serializeProceso(proceso: any) {
  const instalacion = proceso.instalacion?.[0];
  const estado = proceso.estado ?? computeProcesoEstado(proceso.fecha_inicio, proceso.fecha_final);
  const nombreProceso = proceso.nombre_proceso?.trim()
    ? proceso.nombre_proceso
    : `Proceso ${proceso.id_proceso}`;
  const descripcion = proceso.descripcion?.trim()
    ? proceso.descripcion
    : proceso.especies?.nombre
      ? `Cultivo de ${proceso.especies.nombre}`
      : undefined;

  return {
    ...proceso,
    id_instalacion: instalacion?.id_instalacion ?? null,
    nombre: nombreProceso,
    nombre_proceso: nombreProceso,
    descripcion,
    objetivos: proceso.objetivos,
    fecha_fin_esperada: proceso.fecha_final,
    fecha_fin_real: proceso.fecha_fin_real ?? (estado === 'completado' ? proceso.fecha_final : null),
    porcentaje_avance: toNullableNumber(proceso.porcentaje_avance),
    estado,
    created_at: normalizeDate(proceso.fecha_inicio),
    updated_at: normalizeDate(proceso.fecha_fin_real ?? proceso.fecha_final),
    nombre_especie: proceso.especies?.nombre,
    nombre_instalacion: instalacion?.nombre_instalacion,
  };
}

// CATÁLOGO ESPECIES
export async function createCatalogoEspecie(req: FastifyRequest, reply: FastifyReply) {
  try {
    const scope = await requireRequestScope(req, reply);
    if (!scope) return;
    if (!canManageResources(scope)) {
      return reply.status(403).send({ error: 'No tiene permisos para crear especies' });
    }

    const body = (req.body || {}) as any;
    const nombre = String(body.nombre ?? body.nombre_comun ?? '').trim();
    const parametrosPayload = parseEspecieParametrosPayload(body.parametros);

    if (!nombre) {
      return reply.status(400).send({ error: 'nombre es obligatorio' });
    }

    const estado = body.estado === 'inactiva' || body.activo === false ? 'inactiva' : 'activa';

    const especie = await prisma.$transaction(async (tx) => {
      const created = await tx.especies.create({
        data: {
          nombre,
          nombre_cientifico: body.nombre_cientifico ? String(body.nombre_cientifico).trim() : null,
          descripcion: body.descripcion ? String(body.descripcion) : null,
          estado,
          temperatura_optima_min: toNullableNumber(body.temperatura_optima_min),
          temperatura_optima_max: toNullableNumber(body.temperatura_optima_max),
          ph_optimo_min: toNullableNumber(body.ph_optimo_min),
          ph_optimo_max: toNullableNumber(body.ph_optimo_max),
          oxigeno_optimo_min: toNullableNumber(body.oxigeno_optimo_min),
          oxigeno_optimo_max: toNullableNumber(body.oxigeno_optimo_max),
          salinidad_optima_min: toNullableNumber(body.salinidad_optima_min),
          salinidad_optima_max: toNullableNumber(body.salinidad_optima_max),
        },
      });

      if (parametrosPayload.length > 0) {
        await syncEspecieParametros(tx, created.id_especie, parametrosPayload);
      }

      return created;
    });

    reply.status(201).send(serializeEspecie(especie));
  } catch (error: any) {
    reply.status(400).send({ error: error.message });
  }
}

export async function getCatalogoEspecies(_req: FastifyRequest, reply: FastifyReply) {
  try {
    const scope = await requireRequestScope(_req, reply);
    if (!scope) return;

    const especies = await prisma.especies.findMany({
      orderBy: {
        nombre: 'asc',
      },
    });

    reply.send(especies.map(serializeEspecie));
  } catch (error: any) {
    reply.status(500).send({ error: error.message });
  }
}

export async function getCatalogoEspecieById(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  try {
    const scope = await requireRequestScope(req, reply);
    if (!scope) return;

    const id = parseInt(req.params.id, 10);
    const especie = await prisma.especies.findUnique({
      where: { id_especie: id }
    });

    if (!especie) {
      return reply.status(404).send({ error: 'Especie no encontrada' });
    }

    reply.send(serializeEspecie(especie));
  } catch (error: any) {
    reply.status(500).send({ error: error.message });
  }
}

export async function updateCatalogoEspecie(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  try {
    const scope = await requireRequestScope(req, reply);
    if (!scope) return;
    if (!canManageResources(scope)) {
      return reply.status(403).send({ error: 'No tiene permisos para actualizar especies' });
    }

    const id = parseInt(req.params.id, 10);
    const body = (req.body || {}) as any;
    const shouldSyncParametros = body.parametros !== undefined;
    const parametrosPayload = shouldSyncParametros ? parseEspecieParametrosPayload(body.parametros) : [];

    const nombre = body.nombre !== undefined
      ? String(body.nombre).trim()
      : body.nombre_comun !== undefined
        ? String(body.nombre_comun).trim()
        : undefined;

    const data: any = {};

    if (nombre) data.nombre = nombre;
    if (body.nombre_cientifico !== undefined) data.nombre_cientifico = body.nombre_cientifico ? String(body.nombre_cientifico).trim() : null;
    if (body.descripcion !== undefined) data.descripcion = body.descripcion ? String(body.descripcion) : null;
    if (body.estado !== undefined || body.activo !== undefined) {
      data.estado = body.estado ?? (body.activo === false ? 'inactiva' : 'activa');
    }
    if (body.temperatura_optima_min !== undefined) data.temperatura_optima_min = toNullableNumber(body.temperatura_optima_min);
    if (body.temperatura_optima_max !== undefined) data.temperatura_optima_max = toNullableNumber(body.temperatura_optima_max);
    if (body.ph_optimo_min !== undefined) data.ph_optimo_min = toNullableNumber(body.ph_optimo_min);
    if (body.ph_optimo_max !== undefined) data.ph_optimo_max = toNullableNumber(body.ph_optimo_max);
    if (body.oxigeno_optimo_min !== undefined) data.oxigeno_optimo_min = toNullableNumber(body.oxigeno_optimo_min);
    if (body.oxigeno_optimo_max !== undefined) data.oxigeno_optimo_max = toNullableNumber(body.oxigeno_optimo_max);
    if (body.salinidad_optima_min !== undefined) data.salinidad_optima_min = toNullableNumber(body.salinidad_optima_min);
    if (body.salinidad_optima_max !== undefined) data.salinidad_optima_max = toNullableNumber(body.salinidad_optima_max);

    const especie = await prisma.$transaction(async (tx) => {
      const updated = await tx.especies.update({
        where: { id_especie: id },
        data,
      });

      if (shouldSyncParametros) {
        await syncEspecieParametros(tx, id, parametrosPayload);
      }

      return updated;
    });

    reply.send(serializeEspecie(especie));
  } catch (error: any) {
    reply.status(400).send({ error: error.message });
  }
}

export async function deleteCatalogoEspecie(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  try {
    const scope = await requireRequestScope(req, reply);
    if (!scope) return;
    if (!canManageResources(scope)) {
      return reply.status(403).send({ error: 'No tiene permisos para eliminar especies' });
    }

    const id = parseInt(req.params.id, 10);
    await prisma.especies.delete({ where: { id_especie: id } });
    reply.status(204).send();
  } catch (error: any) {
    reply.status(400).send({ error: error.message });
  }
}

// ESPECIE PARÁMETRO
export async function createEspecieParametro(req: FastifyRequest, reply: FastifyReply) {
  try {
    const scope = await requireRequestScope(req, reply);
    if (!scope) return;
    if (!canManageResources(scope)) {
      return reply.status(403).send({ error: 'No tiene permisos para crear parámetros por especie' });
    }

    const body = (req.body || {}) as any;
    const especieParametro = await prisma.especie_parametro.create({
      data: {
        id_especie: Number(body.id_especie),
        id_parametro: Number(body.id_parametro),
        Rmin: Number(body.Rmin),
        Rmax: Number(body.Rmax),
      },
      include: {
        especies: true,
        parametros: true,
      },
    });

    reply.status(201).send(serializeEspecieParametro(especieParametro));
  } catch (error: any) {
    reply.status(400).send({ error: error.message });
  }
}

export async function getEspeciesParametros(_req: FastifyRequest, reply: FastifyReply) {
  try {
    const scope = await requireRequestScope(_req, reply);
    if (!scope) return;

    const parametros = await prisma.especie_parametro.findMany({
      include: { parametros: true, especies: true },
      orderBy: {
        id_especie_parametro: 'asc',
      },
    });
    reply.send(parametros.map(serializeEspecieParametro));
  } catch (error: any) {
    reply.status(500).send({ error: error.message });
  }
}

export async function getEspecieParametroById(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  try {
    const scope = await requireRequestScope(req, reply);
    if (!scope) return;

    const id = parseInt(req.params.id, 10);
    const parametro = await prisma.especie_parametro.findUnique({
      where: { id_especie_parametro: id },
      include: { parametros: true, especies: true }
    });

    if (!parametro) {
      return reply.status(404).send({ error: 'Especie parámetro no encontrado' });
    }

    reply.send(serializeEspecieParametro(parametro));
  } catch (error: any) {
    reply.status(500).send({ error: error.message });
  }
}

export async function updateEspecieParametro(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  try {
    const scope = await requireRequestScope(req, reply);
    if (!scope) return;
    if (!canManageResources(scope)) {
      return reply.status(403).send({ error: 'No tiene permisos para actualizar parámetros por especie' });
    }

    const id = parseInt(req.params.id, 10);
    const body = req.body as any;

    const parametro = await prisma.especie_parametro.update({
      where: { id_especie_parametro: id },
      data: {
        ...(body.id_especie !== undefined ? { id_especie: Number(body.id_especie) } : {}),
        ...(body.id_parametro !== undefined ? { id_parametro: Number(body.id_parametro) } : {}),
        ...(body.Rmin !== undefined ? { Rmin: Number(body.Rmin) } : {}),
        ...(body.Rmax !== undefined ? { Rmax: Number(body.Rmax) } : {}),
      },
      include: {
        especies: true,
        parametros: true,
      },
    });

    reply.send(serializeEspecieParametro(parametro));
  } catch (error: any) {
    reply.status(400).send({ error: error.message });
  }
}

export async function deleteEspecieParametro(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  try {
    const scope = await requireRequestScope(req, reply);
    if (!scope) return;
    if (!canManageResources(scope)) {
      return reply.status(403).send({ error: 'No tiene permisos para eliminar parámetros por especie' });
    }

    const id = parseInt(req.params.id, 10);
    await prisma.especie_parametro.delete({ where: { id_especie_parametro: id } });
    reply.status(204).send();
  } catch (error: any) {
    reply.status(400).send({ error: error.message });
  }
}

// PROCESOS
export async function createProceso(req: FastifyRequest, reply: FastifyReply) {
  try {
    const scope = await requireRequestScope(req, reply);
    if (!scope) return;
    if (!canManageResources(scope)) {
      return reply.status(403).send({ error: 'No tiene permisos para crear procesos' });
    }

    const raw = (req.body || {}) as any;
    const body = createProcesoSchema.parse({
      ...raw,
      nombre_proceso: raw.nombre_proceso ?? raw.nombre,
    });

    const idInstalacion = body.id_instalacion ?? toPositiveInt(raw.id_instalacion);
    if (idInstalacion) {
      const targetInstalacion = await prisma.instalacion.findUnique({
        where: { id_instalacion: idInstalacion },
        select: { id_organizacion_sucursal: true },
      });

      if (!targetInstalacion) {
        return reply.status(404).send({ error: 'Instalación no encontrada' });
      }

      if (!canAccessFacility(scope, idInstalacion, targetInstalacion.id_organizacion_sucursal)) {
        return reply.status(403).send({ error: 'No tiene acceso a la instalación seleccionada' });
      }
    }

    const proceso = await prisma.$transaction(async (tx) => {
      const created = await tx.procesos.create({
        data: {
          id_especie: body.id_especie,
          nombre_proceso: body.nombre_proceso,
          descripcion: body.descripcion,
          objetivos: body.objetivos,
          estado: body.estado,
          porcentaje_avance: body.porcentaje_avance,
          fecha_inicio: body.fecha_inicio,
          fecha_final: body.fecha_final,
          fecha_fin_real: body.fecha_fin_real,
          motivo_cierre: body.motivo_cierre,
        }
      });

      if (idInstalacion) {
        await tx.instalacion.update({
          where: { id_instalacion: idInstalacion },
          data: { id_proceso: created.id_proceso },
        });
      }

      return tx.procesos.findUniqueOrThrow({
        where: { id_proceso: created.id_proceso },
        include: {
          especies: true,
          instalacion: true,
        },
      });
    });

    reply.status(201).send(serializeProceso(proceso));
  } catch (error: any) {
    reply.status(400).send({ error: error.message });
  }
}

export async function getProcesos(
  req: FastifyRequest<{ Querystring: { id_instalacion?: string; id_especie?: string; estado?: string } }>,
  reply: FastifyReply
) {
  try {
    const scope = await requireRequestScope(req, reply);
    if (!scope) return;

    const idInstalacion = toPositiveInt(req.query.id_instalacion);
    const idEspecie = toPositiveInt(req.query.id_especie);
    const estado = String(req.query.estado ?? '').trim().toLowerCase();

    const filters: any[] = [];
    if (idEspecie) filters.push({ id_especie: idEspecie });

    const instalacionScopeWhere = buildInstalacionScopeWhere(scope);
    const instalacionConditions: any[] = [];
    if (idInstalacion) instalacionConditions.push({ id_instalacion: idInstalacion });
    if (Object.keys(instalacionScopeWhere).length > 0) instalacionConditions.push(instalacionScopeWhere);

    if (instalacionConditions.length > 0) {
      filters.push({
        instalacion: {
          some: instalacionConditions.length > 1
            ? { AND: instalacionConditions }
            : instalacionConditions[0],
        },
      });
    }

    const where = filters.length > 1 ? { AND: filters } : (filters[0] ?? {});

    const procesos = await prisma.procesos.findMany({
      where,
      include: {
        especies: true,
        instalacion: true,
      },
      orderBy: {
        fecha_inicio: 'desc',
      },
    });

    const serialized = procesos.map(serializeProceso);
    const filtered = estado
      ? serialized.filter((proceso) => proceso.estado === estado)
      : serialized;

    reply.send(filtered);
  } catch (error: any) {
    reply.status(500).send({ error: error.message });
  }
}

export async function getProcesoById(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  try {
    const scope = await requireRequestScope(req, reply);
    if (!scope) return;

    const id = parseInt(req.params.id, 10);
    const proceso = await prisma.procesos.findUnique({
      where: { id_proceso: id },
      include: {
        especies: true,
        instalacion: true,
      },
    });

    if (!proceso) {
      return reply.status(404).send({ error: 'Proceso no encontrado' });
    }

    if (scope.role !== 'superadmin') {
      const hasInstallation = proceso.instalacion.length > 0;
      const hasAccess = proceso.instalacion.some((instalacion) =>
        canAccessFacility(scope, instalacion.id_instalacion, instalacion.id_organizacion_sucursal)
      );

      if (!hasInstallation || !hasAccess) {
        return reply.status(403).send({ error: 'No tiene acceso a este proceso' });
      }
    }

    reply.send(serializeProceso(proceso));
  } catch (error: any) {
    reply.status(500).send({ error: error.message });
  }
}

export async function updateProceso(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  try {
    const scope = await requireRequestScope(req, reply);
    if (!scope) return;
    if (!canManageResources(scope)) {
      return reply.status(403).send({ error: 'No tiene permisos para actualizar procesos' });
    }

    const id = parseInt(req.params.id, 10);
    const raw = (req.body || {}) as any;
    const body = updateProcesoSchema.parse({
      ...raw,
      nombre_proceso: raw.nombre_proceso ?? raw.nombre,
    });

    const existing = await prisma.procesos.findUnique({
      where: { id_proceso: id },
      include: { instalacion: true },
    });
    if (!existing) {
      return reply.status(404).send({ error: 'Proceso no encontrado' });
    }

    if (scope.role !== 'superadmin') {
      const hasAccessToExisting = existing.instalacion.some((instalacion) =>
        canAccessFacility(scope, instalacion.id_instalacion, instalacion.id_organizacion_sucursal)
      );

      if (existing.instalacion.length > 0 && !hasAccessToExisting) {
        return reply.status(403).send({ error: 'No tiene acceso a este proceso' });
      }
    }

    const idInstalacion = body.id_instalacion ?? toPositiveInt(raw.id_instalacion);
    if (idInstalacion) {
      const targetInstalacion = await prisma.instalacion.findUnique({
        where: { id_instalacion: idInstalacion },
        select: { id_organizacion_sucursal: true },
      });

      if (!targetInstalacion) {
        return reply.status(404).send({ error: 'Instalación no encontrada' });
      }

      if (!canAccessFacility(scope, idInstalacion, targetInstalacion.id_organizacion_sucursal)) {
        return reply.status(403).send({ error: 'No tiene acceso a la instalación seleccionada' });
      }
    }

    const proceso = await prisma.$transaction(async (tx) => {
      const data: any = {
        ...(body.id_especie !== undefined ? { id_especie: body.id_especie } : {}),
        ...(body.nombre_proceso !== undefined ? { nombre_proceso: body.nombre_proceso } : {}),
        ...(body.descripcion !== undefined ? { descripcion: body.descripcion } : {}),
        ...(body.objetivos !== undefined ? { objetivos: body.objetivos } : {}),
        ...(body.estado !== undefined ? { estado: body.estado } : {}),
        ...(body.porcentaje_avance !== undefined ? { porcentaje_avance: body.porcentaje_avance } : {}),
        ...(body.fecha_inicio !== undefined ? { fecha_inicio: body.fecha_inicio } : {}),
        ...(body.fecha_final !== undefined ? { fecha_final: body.fecha_final } : {}),
        ...(body.fecha_fin_real !== undefined ? { fecha_fin_real: body.fecha_fin_real } : {}),
        ...(body.motivo_cierre !== undefined ? { motivo_cierre: body.motivo_cierre } : {}),
      };

      await tx.procesos.update({
        where: { id_proceso: id },
        data,
      });

      if (idInstalacion) {
        await tx.instalacion.update({
          where: { id_instalacion: idInstalacion },
          data: { id_proceso: id },
        });
      }

      return tx.procesos.findUniqueOrThrow({
        where: { id_proceso: id },
        include: {
          especies: true,
          instalacion: true,
        },
      });
    });

    reply.send(serializeProceso(proceso));
  } catch (error: any) {
    reply.status(400).send({ error: error.message });
  }
}

export async function deleteProceso(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  try {
    const scope = await requireRequestScope(req, reply);
    if (!scope) return;
    if (!canManageResources(scope)) {
      return reply.status(403).send({ error: 'No tiene permisos para eliminar procesos' });
    }

    const id = parseInt(req.params.id, 10);
    const existing = await prisma.procesos.findUnique({
      where: { id_proceso: id },
      include: { instalacion: true },
    });

    if (!existing) {
      return reply.status(404).send({ error: 'Proceso no encontrado' });
    }

    if (scope.role !== 'superadmin') {
      const hasAccess = existing.instalacion.some((instalacion) =>
        canAccessFacility(scope, instalacion.id_instalacion, instalacion.id_organizacion_sucursal)
      );
      if (existing.instalacion.length > 0 && !hasAccess) {
        return reply.status(403).send({ error: 'No tiene acceso a este proceso' });
      }
    }

    await prisma.procesos.delete({ where: { id_proceso: id } });
    reply.status(204).send();
  } catch (error: any) {
    reply.status(400).send({ error: error.message });
  }
}
