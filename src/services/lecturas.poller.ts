import { prisma } from '../repositories/prisma.js';
import { enqueueLecturaAggregatesRefresh } from './lectura-aggregates.service.js';
import { broadcastLecturaCreated, broadcastNotification } from './ws.lecturas.server.js';
import { sendAlertToTelegram } from './telegram.service.js';

type RangeRule = {
  min: number;
  max: number;
};

const ALERT_COOLDOWN_MS = 30 * 60 * 1000; // 30 minutos por sensor

const RANGE_RULES: Record<string, RangeRule> = {
  temperatura: { min: 20, max: 32 },
  ph: { min: 6.5, max: 8.8 },
  'oxigeno disuelto': { min: 4, max: 12 },
  oxigeno: { min: 4, max: 12 },
  salinidad: { min: 0, max: 35 },
  turbidez: { min: 0, max: 30 },
  nitratos: { min: 0, max: 50 },
  amonio: { min: 0, max: 1 },
  conductividad: { min: 300, max: 2500 },
  orp: { min: 150, max: 450 },
};

function normalizeSensorName(name: string): string {
  return String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function getRangeRule(sensorType: string): RangeRule | null {
  const normalized = normalizeSensorName(sensorType);

  if (RANGE_RULES[normalized]) return RANGE_RULES[normalized];

  if (normalized.includes('temperatura')) return RANGE_RULES.temperatura;
  if (normalized.includes('ph')) return RANGE_RULES.ph;
  if (normalized.includes('oxigen')) return RANGE_RULES.oxigeno;
  if (normalized.includes('salin')) return RANGE_RULES.salinidad;
  if (normalized.includes('turbi')) return RANGE_RULES.turbidez;
  if (normalized.includes('nitrat')) return RANGE_RULES.nitratos;
  if (normalized.includes('amon')) return RANGE_RULES.amonio;
  if (normalized.includes('conduct')) return RANGE_RULES.conductividad;
  if (normalized.includes('orp') || normalized.includes('redox')) return RANGE_RULES.orp;

  return null;
}

export function startLecturasPoller(intervalMs = 750) {
  let lastSeenId = 0n;
  let running = false;
  const lastAlertBySensor = new Map<number, number>();

  async function tick() {
    if (running) return;
    running = true;
    try {
      if (lastSeenId === 0n) {
        const max = await prisma.lectura.aggregate({ _max: { id_lectura: true } });
        lastSeenId = BigInt(max._max.id_lectura ?? 0);
      }
      const rows = await prisma.$queryRawUnsafe<any[]>(`
        SELECT l.id_lectura, l.id_sensor_instalado, l.valor,
               CAST(CONCAT(l.fecha, ' ', l.hora) AS DATETIME) AS tomada_en,
               si.id_instalacion, cs.sensor AS tipo_medida, cs.unidad_medida
        FROM lectura l
        JOIN sensor_instalado si ON si.id_sensor_instalado = l.id_sensor_instalado
        JOIN catalogo_sensores cs ON cs.id_sensor = si.id_sensor
        WHERE l.id_lectura > ?
        ORDER BY l.id_lectura ASC
        LIMIT 1000
      `, lastSeenId.toString());

      for (const r of rows) {
        const ev = {
          id_lectura: Number(r.id_lectura),
          sensor_instalado_id: r.id_sensor_instalado,
          instalacion_id: r.id_instalacion,
          tipo_medida: r.tipo_medida,
          tomada_en: new Date(r.tomada_en).toISOString(),
          valor: Number(r.valor)
        };
        broadcastLecturaCreated(ev);

        const rule = getRangeRule(String(r.tipo_medida || ''));
        if (!rule) continue;

        const value = Number(r.valor);
        if (!Number.isFinite(value)) continue;

        const outOfRange = value < rule.min || value > rule.max;
        if (!outOfRange) continue;

        const instalacionId = Number(r.id_instalacion);
        if (!Number.isFinite(instalacionId) || instalacionId <= 0) {
          // Sensores sin instalación asignada no generan alertas persistidas.
          continue;
        }

        const sensorInstaladoId = Number(r.id_sensor_instalado);
        const now = Date.now();
        const lastAlertTs = lastAlertBySensor.get(sensorInstaladoId) ?? 0;
        if (now - lastAlertTs < ALERT_COOLDOWN_MS) continue;

        lastAlertBySensor.set(sensorInstaladoId, now);

        const descripcion = `Valor fuera de rango para ${r.tipo_medida}: ${value}. Rango esperado ${rule.min}-${rule.max}.`;

        const createdAlert = await prisma.alertas.create({
          data: {
            id_instalacion: instalacionId,
            id_sensor_instalado: sensorInstaladoId,
            descripcion,
            dato_puntual: value,
          },
        });

        const alertPayload = {
          id_alertas: createdAlert.id_alertas,
          id_alerta: createdAlert.id_alertas,
          id_instalacion: instalacionId,
          id_sensor_instalado: sensorInstaladoId,
          descripcion,
          dato_puntual: value,
          parameter: String(r.tipo_medida || ''),
          tipo_alerta: 'critica',
          estado_alerta: 'activa',
          read: Boolean(createdAlert.leida),
          leida: Boolean(createdAlert.leida),
          fecha: createdAlert.fecha_alerta.toISOString(),
          fecha_alerta: createdAlert.fecha_alerta.toISOString(),
          fecha_lectura: createdAlert.fecha_lectura ? createdAlert.fecha_lectura.toISOString() : null,
          sensor_instalado: {
            id_sensor_instalado: sensorInstaladoId,
            catalogo_sensores: {
              nombre: String(r.tipo_medida || ''),
              unidad_medida: String(r.unidad_medida || ''),
            },
          },
        };

        broadcastNotification({
          type: 'alerta.created',
          data: alertPayload,
        });

        void sendAlertToTelegram({
          id_alertas: createdAlert.id_alertas,
          descripcion,
          dato_puntual: value,
          instalacion: {
            id_instalacion: instalacionId,
            nombre_instalacion: `Instalación ${instalacionId}`,
          },
          sensor: {
            id_sensor_instalado: sensorInstaladoId,
            nombre: String(r.tipo_medida || ''),
            unidad_medida: String(r.unidad_medida || '') || undefined,
          },
        }).catch(() => undefined);
      }

      if (rows.length > 0) {
        const sensorIds = [...new Set(
          rows
            .map((row) => Number(row.id_sensor_instalado))
            .filter((value) => Number.isFinite(value) && value > 0),
        )];
        const timestamps = rows
          .map((row) => new Date(row.tomada_en))
          .filter((value) => !Number.isNaN(value.getTime()))
          .sort((a, b) => a.getTime() - b.getTime());

        const from = timestamps[0];
        const to = timestamps[timestamps.length - 1];

        if (from && to && sensorIds.length > 0) {
          await enqueueLecturaAggregatesRefresh({
            from,
            to,
            sensorIds,
          }).catch(() => undefined);
        }
      }

      if (rows.length) {
        const maxId = rows[rows.length - 1].id_lectura;
        lastSeenId = BigInt(maxId);
      }
    } catch (e) {
      // minimal log
      // console.error('[poller] error', e);
    } finally {
      running = false;
    }
  }

  setInterval(tick, intervalMs);
}
