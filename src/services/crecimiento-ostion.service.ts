import type { Prisma } from '@prisma/client';
import { prisma } from '../repositories/prisma.js';
import { canAccessFacility, type RequestScope } from '../utils/access-control.js';

type PrismaTx = Prisma.TransactionClient;

export type CrecimientoOstionCalendarioModo = 'automatico' | 'manual';
export type CrecimientoOstionCapturaEstado = 'pendiente' | 'parcial' | 'completada';
export type CrecimientoOstionUnidad = 'cm' | 'kg';

export type CrecimientoOstionCapturaInput = {
  id_crecimiento_ostion_captura?: number;
  numero_captura?: number;
  fecha_programada?: Date;
  fecha_real?: Date | null;
  estado?: CrecimientoOstionCapturaEstado;
  observaciones?: string | null;
};

export type CrecimientoOstionConfigInput = {
  capturas_requeridas: number;
  lotes_por_captura: number;
  calendario_modo?: CrecimientoOstionCalendarioModo;
  capturas?: CrecimientoOstionCapturaInput[];
};

export type CrecimientoOstionMedicionInput = {
  lote_numero: number;
  valor: number;
  unidad: CrecimientoOstionUnidad;
  observaciones?: string | null;
};

export type CrecimientoOstionCapturaUpdateInput = {
  fecha_programada?: Date;
  fecha_real?: Date | null;
  estado?: CrecimientoOstionCapturaEstado;
  observaciones?: string | null;
};

export type CrecimientoOstionMedicionesPayload = {
  fecha_real?: Date | null;
  observaciones?: string | null;
  mediciones: CrecimientoOstionMedicionInput[];
};

function toDateOnly(value: Date | string): Date {
  const parsed = value instanceof Date ? new Date(value) : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error('Fecha inválida para crecimiento del ostión');
  }

  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
}

function formatDateOnly(value?: Date | string | null): string | null {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().split('T')[0] ?? null;
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  }

  if (typeof value === 'object' && value && 'toString' in value) {
    const num = Number(String(value));
    return Number.isFinite(num) ? num : null;
  }

  return null;
}

function buildAutomaticCaptureDates(fechaInicio: Date | string, fechaFinal: Date | string, count: number): Map<number, Date> {
  const start = toDateOnly(fechaInicio);
  const end = toDateOnly(fechaFinal);
  const durationMs = Math.max(0, end.getTime() - start.getTime());
  const schedule = new Map<number, Date>();

  for (let index = 1; index <= count; index += 1) {
    if (count <= 1) {
      schedule.set(index, end);
      continue;
    }

    const ratio = index / count;
    const candidate = new Date(start.getTime() + Math.round(durationMs * ratio));
    schedule.set(index, toDateOnly(candidate));
  }

  return schedule;
}

function serializeMedicion(row: any) {
  return {
    id_crecimiento_ostion_medicion: row.id_crecimiento_ostion_medicion,
    lote_numero: row.lote_numero,
    valor: toNullableNumber(row.valor) ?? 0,
    unidad: row.unidad,
    observaciones: row.observaciones ?? null,
    fecha_creacion: row.fecha_creacion instanceof Date ? row.fecha_creacion.toISOString() : row.fecha_creacion,
    ultima_modificacion:
      row.ultima_modificacion instanceof Date ? row.ultima_modificacion.toISOString() : row.ultima_modificacion,
  };
}

function serializeCaptura(row: any, includeMeasurements = true) {
  const mediciones = Array.isArray(row.mediciones) ? row.mediciones : [];
  return {
    id_crecimiento_ostion_captura: row.id_crecimiento_ostion_captura,
    numero_captura: row.numero_captura,
    fecha_programada: formatDateOnly(row.fecha_programada),
    fecha_real: formatDateOnly(row.fecha_real),
    estado: row.estado,
    es_extra: Boolean(row.es_extra),
    observaciones: row.observaciones ?? null,
    total_mediciones: mediciones.length,
    mediciones: includeMeasurements ? mediciones.map((item: any) => serializeMedicion(item)) : undefined,
    fecha_creacion: row.fecha_creacion instanceof Date ? row.fecha_creacion.toISOString() : row.fecha_creacion,
    ultima_modificacion:
      row.ultima_modificacion instanceof Date ? row.ultima_modificacion.toISOString() : row.ultima_modificacion,
  };
}

export function serializeCrecimientoOstionConfig(row: any, options?: { includeMeasurements?: boolean }) {
  if (!row) return null;

  const includeMeasurements = options?.includeMeasurements !== false;
  const capturas = Array.isArray(row.capturas) ? row.capturas : [];
  const completadas = capturas.filter((capture: any) => capture.estado === 'completada').length;

  return {
    id_crecimiento_ostion_config: row.id_crecimiento_ostion_config,
    id_proceso: row.id_proceso,
    capturas_requeridas: row.capturas_requeridas,
    lotes_por_captura: row.lotes_por_captura,
    calendario_modo: row.calendario_modo,
    total_capturas: capturas.length,
    capturas_completadas: completadas,
    capturas: capturas.map((capture: any) => serializeCaptura(capture, includeMeasurements)),
    fecha_creacion: row.fecha_creacion instanceof Date ? row.fecha_creacion.toISOString() : row.fecha_creacion,
    ultima_modificacion:
      row.ultima_modificacion instanceof Date ? row.ultima_modificacion.toISOString() : row.ultima_modificacion,
  };
}

async function getConfigByProceso(
  tx: PrismaTx | typeof prisma,
  idProceso: number,
  includeMeasurements = true,
) {
  return tx.crecimiento_ostion_config.findUnique({
    where: { id_proceso: idProceso },
    include: {
      capturas: {
        orderBy: { numero_captura: 'asc' },
        include: includeMeasurements
          ? {
              mediciones: {
                orderBy: { lote_numero: 'asc' },
              },
            }
          : undefined,
      },
    },
  });
}

export async function getProcesoWithCrecimiento(idProceso: number) {
  return prisma.procesos.findUnique({
    where: { id_proceso: idProceso },
    include: {
      instalacion: true,
      crecimiento_ostion_config: {
        include: {
          capturas: {
            orderBy: { numero_captura: 'asc' },
            include: {
              mediciones: {
                orderBy: { lote_numero: 'asc' },
              },
            },
          },
        },
      },
    },
  });
}

export function canAccessProceso(scope: RequestScope, proceso: any): boolean {
  if (scope.role === 'superadmin') return true;
  if (!Array.isArray(proceso?.instalacion) || proceso.instalacion.length === 0) return false;

  return proceso.instalacion.some((instalacion: any) =>
    canAccessFacility(scope, instalacion.id_instalacion, instalacion.id_organizacion_sucursal),
  );
}

export async function syncProcesoCrecimientoOstionConfig(
  tx: PrismaTx,
  args: {
    idProceso: number;
    fechaInicio: Date | string;
    fechaFinal: Date | string;
    crecimiento: CrecimientoOstionConfigInput;
  },
) {
  const payload = args.crecimiento;
  const calendarioModo = payload.calendario_modo ?? 'automatico';
  const schedule = buildAutomaticCaptureDates(args.fechaInicio, args.fechaFinal, payload.capturas_requeridas);
  const existing = await getConfigByProceso(tx, args.idProceso, true);

  const persistedConfig = existing
    ? await tx.crecimiento_ostion_config.update({
        where: { id_crecimiento_ostion_config: existing.id_crecimiento_ostion_config },
        data: {
          capturas_requeridas: payload.capturas_requeridas,
          lotes_por_captura: payload.lotes_por_captura,
          calendario_modo: calendarioModo,
        },
      })
    : await tx.crecimiento_ostion_config.create({
        data: {
          id_proceso: args.idProceso,
          capturas_requeridas: payload.capturas_requeridas,
          lotes_por_captura: payload.lotes_por_captura,
          calendario_modo: calendarioModo,
        },
      });

  const currentCapturas = (existing?.capturas ?? []) as any[];
  const baseCapturas = currentCapturas.filter((capture) => !capture.es_extra);
  const captureInputById = new Map<number, CrecimientoOstionCapturaInput>();
  const captureInputByNumber = new Map<number, CrecimientoOstionCapturaInput>();

  for (const capture of payload.capturas ?? []) {
    if (capture.id_crecimiento_ostion_captura) {
      captureInputById.set(capture.id_crecimiento_ostion_captura, capture);
    }
    if (capture.numero_captura) {
      captureInputByNumber.set(capture.numero_captura, capture);
    }
  }

  const existingBaseByNumber = new Map<number, any>(baseCapturas.map((capture) => [capture.numero_captura, capture]));
  const removableCaptureIds: number[] = [];

  for (const capture of baseCapturas) {
    const matchedInput =
      captureInputById.get(capture.id_crecimiento_ostion_captura) ??
      captureInputByNumber.get(capture.numero_captura);
    const hasMeasurements = (capture.mediciones?.length ?? 0) > 0;
    const isPendingMutable = capture.estado === 'pendiente' && !capture.fecha_real && !hasMeasurements;

    if (capture.numero_captura > payload.capturas_requeridas && isPendingMutable) {
      removableCaptureIds.push(capture.id_crecimiento_ostion_captura);
      continue;
    }

    const updateData: Record<string, unknown> = {};

    if (matchedInput?.observaciones !== undefined) {
      updateData.observaciones = matchedInput.observaciones || null;
    }

    if (matchedInput?.fecha_real !== undefined) {
      updateData.fecha_real = matchedInput.fecha_real ? toDateOnly(matchedInput.fecha_real) : null;
    }

    if (matchedInput?.estado !== undefined) {
      updateData.estado = matchedInput.estado;
    }

    if (isPendingMutable) {
      if (matchedInput?.fecha_programada) {
        updateData.fecha_programada = toDateOnly(matchedInput.fecha_programada);
      } else if (calendarioModo === 'automatico') {
        updateData.fecha_programada = schedule.get(capture.numero_captura) ?? capture.fecha_programada;
      }
    }

    if (Object.keys(updateData).length > 0) {
      await tx.crecimiento_ostion_captura.update({
        where: { id_crecimiento_ostion_captura: capture.id_crecimiento_ostion_captura },
        data: updateData,
      });
    }
  }

  if (removableCaptureIds.length > 0) {
    await tx.crecimiento_ostion_captura.deleteMany({
      where: {
        id_crecimiento_ostion_captura: { in: removableCaptureIds },
      },
    });
  }

  for (let number = 1; number <= payload.capturas_requeridas; number += 1) {
    if (existingBaseByNumber.has(number)) continue;

    const matchedInput = captureInputByNumber.get(number);
    await tx.crecimiento_ostion_captura.create({
      data: {
        id_crecimiento_ostion_config: persistedConfig.id_crecimiento_ostion_config,
        numero_captura: number,
        fecha_programada: matchedInput?.fecha_programada
          ? toDateOnly(matchedInput.fecha_programada)
          : schedule.get(number) ?? toDateOnly(args.fechaFinal),
        fecha_real: matchedInput?.fecha_real ? toDateOnly(matchedInput.fecha_real) : null,
        estado: matchedInput?.estado ?? 'pendiente',
        observaciones: matchedInput?.observaciones || null,
      },
    });
  }

  const refreshed = await getConfigByProceso(tx, args.idProceso, true);
  return serializeCrecimientoOstionConfig(refreshed, { includeMeasurements: true });
}

export async function upsertProcesoCrecimientoOstionMediciones(
  tx: PrismaTx,
  idProceso: number,
  idCaptura: number,
  payload: CrecimientoOstionMedicionesPayload,
) {
  const config = await getConfigByProceso(tx, idProceso, true);
  if (!config) {
    throw new Error('El proceso no tiene configuración de crecimiento del ostión');
  }

  const capture = (config.capturas as any[]).find((item: any) => item.id_crecimiento_ostion_captura === idCaptura);
  if (!capture) {
    throw new Error('Captura de crecimiento no encontrada');
  }

  for (const medicion of payload.mediciones) {
    if (medicion.lote_numero < 1 || medicion.lote_numero > config.lotes_por_captura) {
      throw new Error(`El lote ${medicion.lote_numero} está fuera del rango configurado`);
    }

    const existing = (capture.mediciones as any[]).find((item: any) => item.lote_numero === medicion.lote_numero);
    const data = {
      valor: medicion.valor,
      unidad: medicion.unidad,
      observaciones: medicion.observaciones || null,
    };

    if (existing) {
      await tx.crecimiento_ostion_medicion.update({
        where: { id_crecimiento_ostion_medicion: existing.id_crecimiento_ostion_medicion },
        data,
      });
    } else {
      await tx.crecimiento_ostion_medicion.create({
        data: {
          id_crecimiento_ostion_captura: idCaptura,
          lote_numero: medicion.lote_numero,
          ...data,
        },
      });
    }
  }

  const refreshedConfig = await getConfigByProceso(tx, idProceso, true);
  if (!refreshedConfig) {
    throw new Error('No fue posible recargar la configuración de crecimiento');
  }

  const refreshedCapture = (refreshedConfig.capturas as any[]).find(
    (item: any) => item.id_crecimiento_ostion_captura === idCaptura,
  );
  if (!refreshedCapture) {
    throw new Error('No fue posible recargar la captura de crecimiento');
  }

  const totalMeasurements = refreshedCapture.mediciones.length;
  const nextEstado: CrecimientoOstionCapturaEstado =
    totalMeasurements >= refreshedConfig.lotes_por_captura
      ? 'completada'
      : totalMeasurements > 0
        ? 'parcial'
        : 'pendiente';

  await tx.crecimiento_ostion_captura.update({
    where: { id_crecimiento_ostion_captura: idCaptura },
    data: {
      fecha_real:
        payload.fecha_real !== undefined
          ? payload.fecha_real
            ? toDateOnly(payload.fecha_real)
            : null
          : refreshedCapture.fecha_real ?? (totalMeasurements > 0 ? toDateOnly(new Date()) : null),
      observaciones: payload.observaciones !== undefined ? payload.observaciones || null : refreshedCapture.observaciones,
      estado: nextEstado,
    },
  });

  const finalConfig = await getConfigByProceso(tx, idProceso, true);
  return serializeCrecimientoOstionConfig(finalConfig, { includeMeasurements: true });
}

export async function createExtraProcesoCrecimientoOstionCaptura(
  tx: PrismaTx,
  idProceso: number,
  payload: CrecimientoOstionCapturaUpdateInput,
) {
  const config = await getConfigByProceso(tx, idProceso, true);
  if (!config) {
    throw new Error('El proceso no tiene configuración de crecimiento del ostión');
  }

  const nextNumber = config.capturas.reduce((max, capture) => Math.max(max, capture.numero_captura), 0) + 1;

  await tx.crecimiento_ostion_captura.create({
    data: {
      id_crecimiento_ostion_config: config.id_crecimiento_ostion_config,
      numero_captura: nextNumber,
      fecha_programada: payload.fecha_programada ? toDateOnly(payload.fecha_programada) : toDateOnly(new Date()),
      fecha_real: payload.fecha_real ? toDateOnly(payload.fecha_real) : null,
      estado: payload.estado ?? 'pendiente',
      es_extra: true,
      observaciones: payload.observaciones || null,
    },
  });

  const finalConfig = await getConfigByProceso(tx, idProceso, true);
  return serializeCrecimientoOstionConfig(finalConfig, { includeMeasurements: true });
}

export async function updateProcesoCrecimientoOstionCaptura(
  tx: PrismaTx,
  idProceso: number,
  idCaptura: number,
  payload: CrecimientoOstionCapturaUpdateInput,
) {
  const config = await getConfigByProceso(tx, idProceso, true);
  if (!config) {
    throw new Error('El proceso no tiene configuración de crecimiento del ostión');
  }

  const capture = config.capturas.find((item) => item.id_crecimiento_ostion_captura === idCaptura);
  if (!capture) {
    throw new Error('Captura de crecimiento no encontrada');
  }

  const updateData: Record<string, unknown> = {};

  if (payload.observaciones !== undefined) {
    updateData.observaciones = payload.observaciones || null;
  }

  if (payload.fecha_real !== undefined) {
    updateData.fecha_real = payload.fecha_real ? toDateOnly(payload.fecha_real) : null;
  }

  if (payload.estado !== undefined) {
    updateData.estado = payload.estado;
  }

  if (payload.fecha_programada !== undefined && capture.estado === 'pendiente') {
    updateData.fecha_programada = toDateOnly(payload.fecha_programada);
  }

  if (Object.keys(updateData).length > 0) {
    await tx.crecimiento_ostion_captura.update({
      where: { id_crecimiento_ostion_captura: idCaptura },
      data: updateData,
    });
  }

  const finalConfig = await getConfigByProceso(tx, idProceso, true);
  return serializeCrecimientoOstionConfig(finalConfig, { includeMeasurements: true });
}
