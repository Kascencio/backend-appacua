import { z } from 'zod';
import { parseDateForPrisma } from './date.utils.js';

const prismaDate = z.preprocess((v) => parseDateForPrisma(v), z.date());
const prismaDateOptional = z.preprocess((v) => parseDateForPrisma(v), z.date().optional());
const positiveIntNullableOptional = z.preprocess((v) => {
  if (v === undefined || v === '') return undefined;
  if (v === null) return null;
  return v;
}, z.coerce.number().int().positive().nullable().optional());
const decimalField = z.coerce.number().finite();
const decimalFieldOptional = decimalField.optional();

// Lecturas & Agregados
export const rangeQuerySchema = z.object({
  sensorInstaladoId: z.coerce.number().int().positive(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(5000).optional()
});

export const promediosQuerySchema = z.object({
  granularity: z.enum(['15min', 'hour']).optional().default('15min'),
  bucketMinutes: z.coerce.number().int().min(1).max(1440).optional(),
  sensorInstaladoId: z.coerce.number().int().positive(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional()
});

const positiveIntArray = z.preprocess((value) => {
  if (Array.isArray(value)) {
    return value
      .flatMap((entry) => String(entry).split(','))
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  if (typeof value === 'string') {
    return value
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  if (typeof value === 'number') {
    return [value];
  }

  return value;
}, z.array(z.coerce.number().int().positive()).min(1).max(60));

export const promediosBatchQuerySchema = z.object({
  bucketMinutes: z.coerce.number().int().min(1).max(1440),
  sensorInstaladoIds: positiveIntArray,
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

export const wsFilterSchema = z.object({
  sensorInstaladoId: z.coerce.number().int().positive().optional(),
  instalacionId: z.coerce.number().int().positive().optional()
}).refine(v => v.sensorInstaladoId || v.instalacionId, {
  message: "Debe enviar sensorInstaladoId o instalacionId"
});

// CRUD Schemas - Organizacion
export const createOrganizacionSchema = z.object({
  nombre: z.string().min(1).max(200),
  estado: z.enum(['activa', 'inactiva']).optional().default('activa'),
  razon_social: z.string().max(255).optional(),
  rfc: z.string().max(20).optional(),
  correo: z.string().email().max(255).optional(),
  telefono: z.string().max(20).optional(),
  direccion: z.string().max(255).optional(),
  latitud: decimalFieldOptional,
  longitud: decimalFieldOptional,
  zona_horaria: z.string().max(60).optional(),
  descripcion: z.string().max(2000).optional(),
  id_estado: z.coerce.number().int().positive().optional(),
  id_municipio: z.coerce.number().int().positive().optional(),
});

export const updateOrganizacionSchema = createOrganizacionSchema.partial();

// CRUD Schemas - OrganizacionSucursal
export const createSucursalSchema = z.object({
  id_organizacion: z.coerce.number().int().positive(),
  nombre_sucursal: z.string().min(1).max(200),
  estado: z.enum(['activa', 'inactiva']).optional(),
  telefono_sucursal: z.string().max(20).optional(),
  correo_sucursal: z.string().email().max(255).optional(),
  direccion_sucursal: z.string().max(255).optional(),
  numero_int_ext: z.string().max(30).optional(),
  referencia: z.string().max(255).optional(),
  id_cp: z.coerce.number().int().positive().optional(),
  id_colonia: z.coerce.number().int().positive().optional(),
  id_estado: z.coerce.number().int().positive().optional(),
  id_municipio: z.coerce.number().int().positive().optional(),
  latitud: decimalFieldOptional,
  longitud: decimalFieldOptional,
});

export const updateSucursalSchema = createSucursalSchema.partial();

// CRUD Schemas - Instalacion
const instalacionBaseSchema = z.object({
  id_organizacion_sucursal: z.coerce.number().int().positive().optional(),
  // Alias legacy usado por algunos frontends
  id_empresa_sucursal: z.coerce.number().int().positive().optional(),
  // Nuevo alias para permitir asignar instalación por organización.
  id_organizacion: z.coerce.number().int().positive().optional(),
  nombre_instalacion: z.string().min(1).max(200).optional(),
  codigo_instalacion: z.string().max(40).optional(),
  fecha_instalacion: prismaDateOptional,
  estado_operativo: z.enum(['activo', 'inactivo']).optional(),
  descripcion: z.string().min(1).max(200).optional(),
  tipo_uso: z.enum(['acuicultura', 'tratamiento', 'otros']).optional(),
  ubicacion: z.string().max(255).optional(),
  latitud: decimalFieldOptional,
  longitud: decimalFieldOptional,
  capacidad_maxima: decimalFieldOptional,
  capacidad_actual: decimalFieldOptional,
  volumen_agua_m3: decimalFieldOptional,
  profundidad_m: decimalFieldOptional,
  fecha_ultima_inspeccion: prismaDateOptional,
  responsable_operativo: z.string().max(120).optional(),
  contacto_emergencia: z.string().max(40).optional(),
  id_proceso: z.coerce.number().int().positive().optional(),
});

export const createInstalacionSchema = instalacionBaseSchema.extend({
  nombre_instalacion: z.string().min(1).max(200),
  fecha_instalacion: prismaDate,
  estado_operativo: z.enum(['activo', 'inactivo']),
  descripcion: z.string().min(1).max(200),
  tipo_uso: z.enum(['acuicultura', 'tratamiento', 'otros']),
  id_proceso: z.coerce.number().int().positive()
}).refine(v => v.id_organizacion_sucursal || v.id_empresa_sucursal || v.id_organizacion, {
  message: 'Debe enviar id_organizacion_sucursal, id_empresa_sucursal o id_organizacion'
});

export const updateInstalacionSchema = instalacionBaseSchema;

// CRUD Schemas - CatalogoSensor
export const createCatalogoSensorSchema = z.object({
  nombre: z.string().min(1).max(100),
  descripcion: z.string().min(1).max(500),
  modelo: z.string().max(45).optional(),
  marca: z.string().max(45).optional(),
  rango_medicion: z.string().max(45).optional(),
  // Alias común desde frontend
  unidad: z.string().max(45).optional(),
  unidad_medida: z.string().max(45).optional()
});

export const updateCatalogoSensorSchema = createCatalogoSensorSchema.partial();

// CRUD Schemas - SensorInstalado
export const createSensorInstaladoSchema = z.object({
  id_instalacion: positiveIntNullableOptional,
  id_sensor: z.coerce.number().int().positive(),
  fecha_instalada: prismaDate,
  descripcion: z.string().min(1).max(50),
  estado_operativo: z.enum(['activo', 'inactivo', 'mantenimiento']).optional(),
  fecha_mantenimiento: prismaDateOptional,
  id_lectura: z.coerce.number().int().positive().optional(),
});

export const updateSensorInstaladoSchema = z.object({
  id_instalacion: positiveIntNullableOptional,
  id_sensor: z.coerce.number().int().positive().optional(),
  fecha_instalada: prismaDateOptional,
  descripcion: z.string().min(1).max(50).optional(),
  estado_operativo: z.enum(['activo', 'inactivo', 'mantenimiento']).optional(),
  fecha_mantenimiento: prismaDateOptional,
  id_lectura: z.coerce.number().int().positive().optional(),
});

export const crecimientoOstionCapturaSchema = z.object({
  id_crecimiento_ostion_captura: z.coerce.number().int().positive().optional(),
  numero_captura: z.coerce.number().int().min(1).max(1000).optional(),
  fecha_programada: prismaDateOptional,
  fecha_real: prismaDateOptional.nullable().optional(),
  estado: z.enum(['pendiente', 'parcial', 'completada']).optional(),
  observaciones: z.string().max(5000).optional(),
});

export const crecimientoOstionSchema = z.object({
  capturas_requeridas: z.coerce.number().int().min(1).max(100),
  lotes_por_captura: z.coerce.number().int().min(1).max(100),
  calendario_modo: z.enum(['automatico', 'manual']).optional().default('automatico'),
  capturas: z.array(crecimientoOstionCapturaSchema).max(200).optional(),
});

export const updateCrecimientoOstionCapturaSchema = z.object({
  fecha_programada: prismaDateOptional,
  fecha_real: prismaDateOptional.nullable().optional(),
  estado: z.enum(['pendiente', 'parcial', 'completada']).optional(),
  observaciones: z.string().max(5000).optional(),
});

export const createExtraCrecimientoOstionCapturaSchema = updateCrecimientoOstionCapturaSchema.extend({
  fecha_programada: prismaDate,
});

export const crecimientoOstionMedicionSchema = z.object({
  lote_numero: z.coerce.number().int().min(1).max(100),
  valor: z.coerce.number().finite(),
  unidad: z.enum(['cm', 'kg']),
  observaciones: z.string().max(5000).optional(),
});

export const crecimientoOstionMedicionesSchema = z.object({
  fecha_real: prismaDateOptional.nullable().optional(),
  observaciones: z.string().max(5000).optional(),
  mediciones: z.array(crecimientoOstionMedicionSchema).min(1).max(100),
});

// CRUD Schemas - Proceso
export const createProcesoSchema = z.object({
  id_especie: z.coerce.number().int().positive(),
  id_instalacion: z.coerce.number().int().positive().optional(),
  nombre_proceso: z.string().max(150).optional(),
  descripcion: z.string().max(5000).optional(),
  objetivos: z.string().max(5000).optional(),
  estado: z.enum(['planificado', 'en_progreso', 'pausado', 'completado', 'cancelado']).optional(),
  porcentaje_avance: z.coerce.number().min(0).max(100).optional(),
  fecha_inicio: prismaDate,
  fecha_final: prismaDate,
  fecha_fin_real: prismaDateOptional,
  motivo_cierre: z.string().max(5000).optional(),
  crecimiento_ostion: crecimientoOstionSchema.optional(),
}).refine(v => v.fecha_final > v.fecha_inicio, {
  message: 'fecha_final debe ser posterior a fecha_inicio'
});

export const updateProcesoSchema = z.object({
  id_especie: z.coerce.number().int().positive().optional(),
  id_instalacion: z.coerce.number().int().positive().optional(),
  nombre_proceso: z.string().max(150).optional(),
  descripcion: z.string().max(5000).optional(),
  objetivos: z.string().max(5000).optional(),
  estado: z.enum(['planificado', 'en_progreso', 'pausado', 'completado', 'cancelado']).optional(),
  porcentaje_avance: z.coerce.number().min(0).max(100).optional(),
  fecha_inicio: prismaDateOptional,
  fecha_final: prismaDateOptional,
  fecha_fin_real: prismaDateOptional,
  motivo_cierre: z.string().max(5000).optional(),
  crecimiento_ostion: crecimientoOstionSchema.optional(),
}).superRefine((v, ctx) => {
  if (v.fecha_inicio && v.fecha_final && v.fecha_final <= v.fecha_inicio) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'fecha_final debe ser posterior a fecha_inicio'
    });
  }
});
