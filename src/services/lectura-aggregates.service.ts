import { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '../repositories/prisma.js';

type TxClient = Prisma.TransactionClient;

type RefreshLecturaAggregatesInput = {
  from: Date;
  to: Date;
  sensorIds?: number[];
};

const FIFTEEN_MINUTES_SECONDS = 15 * 60;
const HOUR_SECONDS = 60 * 60;
const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

const STARTUP_BACKFILL_DAYS = Number(process.env.LECTURA_AGGREGATES_STARTUP_BACKFILL_DAYS ?? 30);
const RECONCILE_INTERVAL_MS = Number(process.env.LECTURA_AGGREGATES_RECONCILE_INTERVAL_MS ?? 5 * 60 * 1000);
const RECONCILE_LOOKBACK_HOURS = Number(process.env.LECTURA_AGGREGATES_RECONCILE_LOOKBACK_HOURS ?? 48);

let refreshQueue = Promise.resolve();
let maintenanceStarted = false;
const aggregatesDiagnostics = {
  queue_pending_jobs: 0,
  queue_completed_jobs: 0,
  queue_failed_jobs: 0,
  last_enqueued_at: null as string | null,
  last_refresh_started_at: null as string | null,
  last_refresh_finished_at: null as string | null,
  last_refresh_duration_ms: null as number | null,
  last_refresh_error_at: null as string | null,
  last_refresh_error_message: null as string | null,
  last_refresh_from: null as string | null,
  last_refresh_to: null as string | null,
  last_refresh_sensor_count: 0,
};

function normalizeSensorIds(sensorIds?: number[]): number[] {
  if (!Array.isArray(sensorIds) || sensorIds.length === 0) return [];

  return [...new Set(
    sensorIds
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value > 0)
      .map((value) => Math.trunc(value)),
  )].sort((a, b) => a - b);
}

function startOfHour(value: Date): Date {
  const next = new Date(value);
  next.setMinutes(0, 0, 0);
  return next;
}

function endOfHour(value: Date): Date {
  const next = startOfHour(value);
  next.setTime(next.getTime() + HOUR_MS - 1000);
  return next;
}

function buildSensorFilterSql(column: string, sensorIds: number[]): { clause: string; params: number[] } {
  if (sensorIds.length === 0) {
    return { clause: '', params: [] };
  }

  const placeholders = sensorIds.map(() => '?').join(', ');
  return {
    clause: ` AND ${column} IN (${placeholders})`,
    params: sensorIds,
  };
}

async function recomputePromedios(
  db: TxClient,
  from: Date,
  to: Date,
  sensorIds: number[],
): Promise<void> {
  const { clause, params } = buildSensorFilterSql('id_sensor_instalado', sensorIds);

  await db.$executeRawUnsafe(
    `
      DELETE FROM promedio
      WHERE TIMESTAMP(fecha, hora) BETWEEN ? AND ?
      ${clause}
    `,
    from,
    to,
    ...params,
  );

  await db.$executeRawUnsafe(
    `
      INSERT INTO promedio (id_sensor_instalado, fecha, hora, promedio)
      SELECT
        aggregated.id_sensor_instalado,
        DATE(aggregated.bucket_ts) AS fecha,
        TIME(aggregated.bucket_ts) AS hora,
        aggregated.promedio
      FROM (
        SELECT
          l.id_sensor_instalado,
          FROM_UNIXTIME(
            FLOOR(UNIX_TIMESTAMP(TIMESTAMP(l.fecha, l.hora)) / ${FIFTEEN_MINUTES_SECONDS}) * ${FIFTEEN_MINUTES_SECONDS}
          ) AS bucket_ts,
          ROUND(AVG(l.valor), 2) AS promedio
        FROM lectura l
        WHERE TIMESTAMP(l.fecha, l.hora) BETWEEN ? AND ?
        ${sensorIds.length > 0 ? `AND l.id_sensor_instalado IN (${sensorIds.map(() => '?').join(', ')})` : ''}
        GROUP BY l.id_sensor_instalado, bucket_ts
      ) aggregated
      ON DUPLICATE KEY UPDATE promedio = VALUES(promedio)
    `,
    from,
    to,
    ...sensorIds,
  );
}

async function recomputeResumenHorario(
  db: TxClient,
  from: Date,
  to: Date,
  sensorIds: number[],
): Promise<void> {
  const { clause, params } = buildSensorFilterSql('id_sensor_instalado', sensorIds);

  await db.$executeRawUnsafe(
    `
      DELETE FROM resumen_lectura_horaria
      WHERE TIMESTAMP(fecha, hora) BETWEEN ? AND ?
      ${clause}
    `,
    from,
    to,
    ...params,
  );

  await db.$executeRawUnsafe(
    `
      INSERT INTO resumen_lectura_horaria (id_sensor_instalado, fecha, hora, promedio, registros)
      SELECT
        aggregated.id_sensor_instalado,
        DATE(aggregated.bucket_ts) AS fecha,
        TIME(aggregated.bucket_ts) AS hora,
        aggregated.promedio,
        aggregated.registros
      FROM (
        SELECT
          l.id_sensor_instalado,
          FROM_UNIXTIME(
            FLOOR(UNIX_TIMESTAMP(TIMESTAMP(l.fecha, l.hora)) / ${HOUR_SECONDS}) * ${HOUR_SECONDS}
          ) AS bucket_ts,
          ROUND(AVG(l.valor), 2) AS promedio,
          COUNT(*) AS registros
        FROM lectura l
        WHERE TIMESTAMP(l.fecha, l.hora) BETWEEN ? AND ?
        ${sensorIds.length > 0 ? `AND l.id_sensor_instalado IN (${sensorIds.map(() => '?').join(', ')})` : ''}
        GROUP BY l.id_sensor_instalado, bucket_ts
      ) aggregated
      ON DUPLICATE KEY UPDATE
        promedio = VALUES(promedio),
        registros = VALUES(registros)
    `,
    from,
    to,
    ...sensorIds,
  );
}

export async function refreshLecturaAggregatesWindow(
  input: RefreshLecturaAggregatesInput,
  db: PrismaClient = prisma,
): Promise<void> {
  const sensorIds = normalizeSensorIds(input.sensorIds);
  const fromDate = new Date(input.from);
  const toDate = new Date(input.to);
  const startedAt = Date.now();

  aggregatesDiagnostics.last_refresh_started_at = new Date(startedAt).toISOString();
  aggregatesDiagnostics.last_refresh_from = fromDate.toISOString();
  aggregatesDiagnostics.last_refresh_to = toDate.toISOString();
  aggregatesDiagnostics.last_refresh_sensor_count = sensorIds.length;
  aggregatesDiagnostics.last_refresh_error_at = null;
  aggregatesDiagnostics.last_refresh_error_message = null;

  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    throw new Error('refreshLecturaAggregatesWindow recibió un rango inválido');
  }

  const alignedFrom = startOfHour(fromDate);
  const alignedTo = endOfHour(toDate);

  if (alignedFrom > alignedTo) return;

  await db.$transaction(async (tx) => {
    await recomputePromedios(tx, alignedFrom, alignedTo, sensorIds);
    await recomputeResumenHorario(tx, alignedFrom, alignedTo, sensorIds);
  });

  aggregatesDiagnostics.last_refresh_finished_at = new Date().toISOString();
  aggregatesDiagnostics.last_refresh_duration_ms = Number((Date.now() - startedAt).toFixed(2));
}

export function enqueueLecturaAggregatesRefresh(input: RefreshLecturaAggregatesInput): Promise<void> {
  aggregatesDiagnostics.queue_pending_jobs += 1;
  aggregatesDiagnostics.last_enqueued_at = new Date().toISOString();

  const task = refreshQueue
    .catch(() => undefined)
    .then(async () => {
      try {
        await refreshLecturaAggregatesWindow(input);
        aggregatesDiagnostics.queue_completed_jobs += 1;
      } catch (error: any) {
        aggregatesDiagnostics.queue_failed_jobs += 1;
        aggregatesDiagnostics.last_refresh_error_at = new Date().toISOString();
        aggregatesDiagnostics.last_refresh_error_message =
          error?.message || 'No se pudo recalcular agregados de lectura';
        throw error;
      } finally {
        aggregatesDiagnostics.queue_pending_jobs = Math.max(0, aggregatesDiagnostics.queue_pending_jobs - 1);
      }
    });

  refreshQueue = task.catch(() => undefined);
  return task;
}

export function startLecturaAggregatesMaintenance(): void {
  if (maintenanceStarted) return;
  maintenanceStarted = true;

  const now = new Date();
  const startupDays = Number.isFinite(STARTUP_BACKFILL_DAYS)
    ? Math.max(0, Math.trunc(STARTUP_BACKFILL_DAYS))
    : 0;

  if (startupDays > 0) {
    const from = new Date(now.getTime() - startupDays * 24 * HOUR_MS);
    void enqueueLecturaAggregatesRefresh({ from, to: now }).catch((error) => {
      console.error('[lectura-aggregates] startup backfill failed', error);
    });
  }

  const intervalMs = Number.isFinite(RECONCILE_INTERVAL_MS)
    ? Math.max(0, Math.trunc(RECONCILE_INTERVAL_MS))
    : 0;
  const lookbackHours = Number.isFinite(RECONCILE_LOOKBACK_HOURS)
    ? Math.max(1, Math.trunc(RECONCILE_LOOKBACK_HOURS))
    : 48;

  if (intervalMs <= 0) return;

  const timer = setInterval(() => {
    const to = new Date();
    const from = new Date(to.getTime() - lookbackHours * HOUR_MS);
    void enqueueLecturaAggregatesRefresh({ from, to }).catch((error) => {
      console.error('[lectura-aggregates] periodic reconcile failed', error);
    });
  }, intervalMs);

  timer.unref?.();
}

export function getLecturaAggregatesDiagnostics() {
  return {
    maintenance_started: maintenanceStarted,
    startup_backfill_days: STARTUP_BACKFILL_DAYS,
    reconcile_interval_ms: RECONCILE_INTERVAL_MS,
    reconcile_lookback_hours: RECONCILE_LOOKBACK_HOURS,
    queue_pending_jobs: aggregatesDiagnostics.queue_pending_jobs,
    queue_completed_jobs: aggregatesDiagnostics.queue_completed_jobs,
    queue_failed_jobs: aggregatesDiagnostics.queue_failed_jobs,
    last_enqueued_at: aggregatesDiagnostics.last_enqueued_at,
    last_refresh_started_at: aggregatesDiagnostics.last_refresh_started_at,
    last_refresh_finished_at: aggregatesDiagnostics.last_refresh_finished_at,
    last_refresh_duration_ms: aggregatesDiagnostics.last_refresh_duration_ms,
    last_refresh_error_at: aggregatesDiagnostics.last_refresh_error_at,
    last_refresh_error_message: aggregatesDiagnostics.last_refresh_error_message,
    last_refresh_window: (
      aggregatesDiagnostics.last_refresh_from && aggregatesDiagnostics.last_refresh_to
        ? {
            from: aggregatesDiagnostics.last_refresh_from,
            to: aggregatesDiagnostics.last_refresh_to,
            sensor_count: aggregatesDiagnostics.last_refresh_sensor_count,
          }
        : null
    ),
  };
}
