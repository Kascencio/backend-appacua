import { z } from 'zod';

// Lecturas & Agregados
export const rangeQuerySchema = z.object({
  sensorInstaladoId: z.coerce.number().int().positive(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(5000).optional()
});

export const promediosQuerySchema = z.object({
  granularity: z.enum(['15min', 'hour']),
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
  id_organizacion: z.number().int().positive(),
  nombre_sucursal: z.string().min(1).max(200),
  estado: z.string().min(1).max(50)
});

export const updateSucursalSchema = createSucursalSchema.partial();

// CRUD Schemas - Instalacion
export const createInstalacionSchema = z.object({
  id_organizacion_sucursal: z.number().int().positive(),
  nombre_instalacion: z.string().min(1).max(200)
});

export const updateInstalacionSchema = createInstalacionSchema.partial();

// CRUD Schemas - CatalogoSensor
export const createCatalogoSensorSchema = z.object({
  nombre: z.string().min(1).max(100),
  unidad: z.string().max(50).optional(),
  tipo_medida: z.enum(['temperatura', 'ph', 'oxigeno_disuelto', 'conductividad', 'turbidez', 'salinidad', 'otro']).optional(),
  rango_min: z.number().optional(),
  rango_max: z.number().optional()
});

export const updateCatalogoSensorSchema = createCatalogoSensorSchema.partial();

// CRUD Schemas - SensorInstalado
export const createSensorInstaladoSchema = z.object({
  id_instalacion: z.number().int().positive(),
  id_sensor: z.number().int().positive(),
  descripcion: z.string().max(500).optional(),
  fecha_instalada: z.string().datetime().optional()
});

export const updateSensorInstaladoSchema = createSensorInstaladoSchema.partial();

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
  id_instalacion: z.number().int().positive(),
  nombre_proceso: z.string().min(1).max(200),
  descripcion: z.string().optional(),
  fecha_inicio: z.string().datetime(),
  fecha_fin: z.string().datetime().optional(),
  estado: z.string().max(50).optional()
});

export const updateProcesoSchema = createProcesoSchema.partial();

