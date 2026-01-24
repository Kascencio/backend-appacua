import { z } from 'zod';
import { parseDateForPrisma, parseTimeForPrisma } from './date.utils.js';

const prismaDate = z.preprocess((v) => parseDateForPrisma(v), z.date());
const prismaDateOptional = z.preprocess((v) => parseDateForPrisma(v), z.date().optional());
const prismaTimeOptional = z.preprocess((v) => parseTimeForPrisma(v), z.date().optional());

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

export const wsFilterSchema = z.object({
  sensorInstaladoId: z.coerce.number().int().positive().optional(),
  instalacionId: z.coerce.number().int().positive().optional()
}).refine(v => v.sensorInstaladoId || v.instalacionId, {
  message: "Debe enviar sensorInstaladoId o instalacionId"
});

// CRUD Schemas - Organizacion
export const createOrganizacionSchema = z.object({
  nombre: z.string().min(1).max(200),
  estado: z.string().min(1).max(50)
});

export const updateOrganizacionSchema = createOrganizacionSchema.partial();

// CRUD Schemas - OrganizacionSucursal
export const createSucursalSchema = z.object({
  id_organizacion: z.coerce.number().int().positive(),
  nombre_sucursal: z.string().min(1).max(200),
  estado: z.enum(['activa', 'inactiva']).optional()
});

export const updateSucursalSchema = createSucursalSchema.partial();

// CRUD Schemas - Instalacion
const instalacionBaseSchema = z.object({
  id_organizacion_sucursal: z.coerce.number().int().positive().optional(),
  // Alias legacy usado por algunos frontends
  id_empresa_sucursal: z.coerce.number().int().positive().optional(),
  nombre_instalacion: z.string().min(1).max(200).optional(),
  fecha_instalacion: prismaDateOptional,
  estado_operativo: z.enum(['activo', 'inactivo']).optional(),
  descripcion: z.string().min(1).max(200).optional(),
  tipo_uso: z.enum(['acuicultura', 'tratamiento', 'otros']).optional(),
  id_proceso: z.coerce.number().int().positive().optional()
});

export const createInstalacionSchema = instalacionBaseSchema.extend({
  nombre_instalacion: z.string().min(1).max(200),
  fecha_instalacion: prismaDate,
  estado_operativo: z.enum(['activo', 'inactivo']),
  descripcion: z.string().min(1).max(200),
  tipo_uso: z.enum(['acuicultura', 'tratamiento', 'otros']),
  id_proceso: z.coerce.number().int().positive()
}).refine(v => v.id_organizacion_sucursal || v.id_empresa_sucursal, {
  message: 'Debe enviar id_organizacion_sucursal o id_empresa_sucursal'
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
  id_instalacion: z.coerce.number().int().positive(),
  id_sensor: z.coerce.number().int().positive(),
  fecha_instalada: prismaDate,
  descripcion: z.string().min(1).max(50),
  id_lectura: z.coerce.number().int().positive().optional()
});

export const updateSensorInstaladoSchema = z.object({
  id_instalacion: z.coerce.number().int().positive().optional(),
  id_sensor: z.coerce.number().int().positive().optional(),
  fecha_instalada: prismaDateOptional,
  descripcion: z.string().min(1).max(50).optional(),
  id_lectura: z.coerce.number().int().positive().optional()
});

// CRUD Schemas - Usuario
export const createUsuarioSchema = z.object({
  nombre: z.string().min(1).max(200),
  email: z.string().email(),
  password_hash: z.string().min(6),
  id_tipo_rol: z.number().int().positive(),
  activo: z.boolean().optional()
});

export const updateUsuarioSchema = createUsuarioSchema.partial();

// CRUD Schemas - TipoRol
export const createTipoRolSchema = z.object({
  nombre_rol: z.string().min(1).max(100),
  descripcion: z.string().max(500).optional()
});

export const updateTipoRolSchema = createTipoRolSchema.partial();

// CRUD Schemas - Alerta
export const createAlertaSchema = z.object({
  id_sensor_instalado: z.number().int().positive(),
  tipo_alerta: z.string().min(1).max(100),
  mensaje: z.string().min(1),
  nivel: z.enum(['info', 'warning', 'critical']),
  estado: z.string().max(50).optional()
});

export const updateAlertaSchema = z.object({
  fecha_resuelta: z.string().datetime().optional(),
  estado: z.string().max(50).optional()
});

// CRUD Schemas - Parametro
export const createParametroSchema = z.object({
  nombre: z.string().min(1).max(100),
  unidad: z.string().max(50).optional(),
  descripcion: z.string().max(500).optional(),
  rango_min: z.number().optional(),
  rango_max: z.number().optional()
});

export const updateParametroSchema = createParametroSchema.partial();

// CRUD Schemas - Especies
export const createCatalogoEspecieSchema = z.object({
  nombre_cientifico: z.string().min(1).max(200),
  nombre_comun: z.string().max(200).optional(),
  tipo: z.string().max(100).optional(),
  descripcion: z.string().optional()
});

export const updateCatalogoEspecieSchema = createCatalogoEspecieSchema.partial();

export const createEspecieInstaladaSchema = z.object({
  id_instalacion: z.number().int().positive(),
  id_especie: z.number().int().positive(),
  cantidad_inicial: z.number().int().nonnegative().optional(),
  fecha_introduccion: z.string().datetime(),
  estado: z.string().max(50).optional()
});

export const updateEspecieInstaladaSchema = createEspecieInstaladaSchema.partial();

export const createEspecieParametroSchema = z.object({
  id_especie: z.number().int().positive(),
  id_parametro: z.number().int().positive(),
  valor_optimo_min: z.number().optional(),
  valor_optimo_max: z.number().optional()
});

export const updateEspecieParametroSchema = createEspecieParametroSchema.partial();

// CRUD Schemas - Proceso
export const createProcesoSchema = z.object({
  id_especie: z.coerce.number().int().positive(),
  fecha_inicio: prismaDate,
  fecha_final: prismaDate
}).refine(v => v.fecha_final > v.fecha_inicio, {
  message: 'fecha_final debe ser posterior a fecha_inicio'
});

export const updateProcesoSchema = z.object({
  id_especie: z.coerce.number().int().positive().optional(),
  fecha_inicio: prismaDateOptional,
  fecha_final: prismaDateOptional
}).superRefine((v, ctx) => {
  if (v.fecha_inicio && v.fecha_final && v.fecha_final <= v.fecha_inicio) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'fecha_final debe ser posterior a fecha_inicio'
    });
  }
});

