-- Reparación de esquema para endpoints:
--  - GET /api/instalaciones
--  - GET /api/sensores-instalados
--
-- Objetivo: alinear columnas mínimas esperadas por Prisma en producción
-- sin depender de migraciones históricas.
--
-- Compatible con MySQL 5.7+ / 8.0

SET NAMES utf8mb4;
SET @db_name = DATABASE();

DELIMITER $$

DROP PROCEDURE IF EXISTS sp_add_column_if_missing $$
CREATE PROCEDURE sp_add_column_if_missing(
  IN p_table VARCHAR(64),
  IN p_column VARCHAR(64),
  IN p_alter_sql TEXT
)
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = p_table
      AND column_name = p_column
  ) THEN
    SET @stmt := p_alter_sql;
    PREPARE s FROM @stmt;
    EXECUTE s;
    DEALLOCATE PREPARE s;
  END IF;
END $$

DELIMITER ;

-- =========================
-- 1) instalacion
-- =========================

-- Compatibilidad con esquemas que aún usan id_empresa_sucursal
CALL sp_add_column_if_missing(
  'instalacion',
  'id_organizacion_sucursal',
  'ALTER TABLE instalacion ADD COLUMN id_organizacion_sucursal INT NULL'
);

SET @has_old_branch_col := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = @db_name
    AND table_name = 'instalacion'
    AND column_name = 'id_empresa_sucursal'
);
SET @has_new_branch_col := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = @db_name
    AND table_name = 'instalacion'
    AND column_name = 'id_organizacion_sucursal'
);
SET @sql := IF(
  @has_old_branch_col = 1 AND @has_new_branch_col = 1,
  'UPDATE instalacion
   SET id_organizacion_sucursal = COALESCE(id_organizacion_sucursal, id_empresa_sucursal)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

CALL sp_add_column_if_missing(
  'instalacion',
  'fecha_instalacion',
  'ALTER TABLE instalacion ADD COLUMN fecha_instalacion DATE NULL'
);
CALL sp_add_column_if_missing(
  'instalacion',
  'estado_operativo',
  "ALTER TABLE instalacion ADD COLUMN estado_operativo ENUM('activo','inactivo') NOT NULL DEFAULT 'activo'"
);
CALL sp_add_column_if_missing(
  'instalacion',
  'tipo_uso',
  "ALTER TABLE instalacion ADD COLUMN tipo_uso ENUM('acuicultura','tratamiento','otros') NOT NULL DEFAULT 'otros'"
);
CALL sp_add_column_if_missing(
  'instalacion',
  'id_proceso',
  'ALTER TABLE instalacion ADD COLUMN id_proceso INT NULL'
);

-- Normalizar campos requeridos por Prisma
SET @sql := IF(
  EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = @db_name
      AND table_name = 'instalacion'
      AND column_name = 'descripcion'
  ),
  "UPDATE instalacion
   SET descripcion = 'Sin descripcion'
   WHERE descripcion IS NULL OR TRIM(descripcion) = ''",
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = @db_name
      AND table_name = 'instalacion'
      AND column_name = 'fecha_instalacion'
  ),
  "UPDATE instalacion
   SET fecha_instalacion = COALESCE(fecha_instalacion, CURRENT_DATE())",
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = @db_name
      AND table_name = 'instalacion'
      AND column_name = 'fecha_instalacion'
  ),
  "ALTER TABLE instalacion
   MODIFY COLUMN fecha_instalacion DATE NOT NULL",
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = @db_name
      AND table_name = 'instalacion'
      AND column_name = 'estado_operativo'
  ),
  "UPDATE instalacion
   SET estado_operativo = 'activo'
   WHERE estado_operativo IS NULL
      OR estado_operativo NOT IN ('activo','inactivo')",
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = @db_name
      AND table_name = 'instalacion'
      AND column_name = 'tipo_uso'
  ),
  "UPDATE instalacion
   SET tipo_uso = 'otros'
   WHERE tipo_uso IS NULL
      OR tipo_uso NOT IN ('acuicultura','tratamiento','otros')",
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Forzar tipos esperados
SET @sql := IF(
  EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = @db_name
      AND table_name = 'instalacion'
      AND column_name = 'estado_operativo'
  ),
  "ALTER TABLE instalacion
   MODIFY COLUMN estado_operativo ENUM('activo','inactivo') NOT NULL DEFAULT 'activo'",
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = @db_name
      AND table_name = 'instalacion'
      AND column_name = 'tipo_uso'
  ),
  "ALTER TABLE instalacion
   MODIFY COLUMN tipo_uso ENUM('acuicultura','tratamiento','otros') NOT NULL DEFAULT 'otros'",
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Backfill de id_organizacion_sucursal para evitar nulls en campo requerido por Prisma
SET @default_branch := (
  SELECT MIN(id_organizacion_sucursal)
  FROM organizacion_sucursal
);
SET @sql := IF(
  @default_branch IS NOT NULL,
  CONCAT(
    'UPDATE instalacion SET id_organizacion_sucursal = COALESCE(id_organizacion_sucursal, ',
    @default_branch,
    ')'
  ),
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @null_branch_count := (
  SELECT COUNT(*)
  FROM instalacion
  WHERE id_organizacion_sucursal IS NULL
);
SET @sql := IF(
  @null_branch_count = 0,
  'ALTER TABLE instalacion MODIFY COLUMN id_organizacion_sucursal INT NOT NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Backfill de id_proceso para evitar nulls en campo requerido por Prisma
SET @default_species := (
  SELECT MIN(id_especie)
  FROM especies
);
SET @sql := IF(
  @default_species IS NULL,
  "INSERT INTO especies (nombre) VALUES ('Especie temporal')",
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @default_species := (
  SELECT MIN(id_especie)
  FROM especies
);
SET @default_process := (
  SELECT MIN(id_proceso)
  FROM procesos
);
SET @sql := IF(
  @default_process IS NULL AND @default_species IS NOT NULL,
  CONCAT(
    "INSERT INTO procesos (id_especie, nombre_proceso, estado, fecha_inicio, fecha_final) VALUES (",
    @default_species,
    ", 'Proceso temporal', 'planificado', CURRENT_DATE(), DATE_ADD(CURRENT_DATE(), INTERVAL 30 DAY))"
  ),
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @default_process := (
  SELECT MIN(id_proceso)
  FROM procesos
);
SET @sql := IF(
  @default_process IS NOT NULL,
  CONCAT(
    'UPDATE instalacion SET id_proceso = COALESCE(id_proceso, ',
    @default_process,
    ')'
  ),
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @null_process_count := (
  SELECT COUNT(*)
  FROM instalacion
  WHERE id_proceso IS NULL
);
SET @sql := IF(
  @null_process_count = 0,
  'ALTER TABLE instalacion MODIFY COLUMN id_proceso INT NOT NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- =========================
-- 2) sensor_instalado
-- =========================
CALL sp_add_column_if_missing(
  'sensor_instalado',
  'estado_operativo',
  "ALTER TABLE sensor_instalado ADD COLUMN estado_operativo ENUM('activo','inactivo','mantenimiento') NOT NULL DEFAULT 'activo'"
);
CALL sp_add_column_if_missing(
  'sensor_instalado',
  'fecha_mantenimiento',
  'ALTER TABLE sensor_instalado ADD COLUMN fecha_mantenimiento DATETIME NULL'
);
CALL sp_add_column_if_missing(
  'sensor_instalado',
  'id_lectura',
  'ALTER TABLE sensor_instalado ADD COLUMN id_lectura INT NULL'
);

SET @sql := IF(
  EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = @db_name
      AND table_name = 'sensor_instalado'
      AND column_name = 'estado_operativo'
  ),
  "UPDATE sensor_instalado
   SET estado_operativo = 'activo'
   WHERE estado_operativo IS NULL
      OR estado_operativo NOT IN ('activo','inactivo','mantenimiento')",
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = @db_name
      AND table_name = 'sensor_instalado'
      AND column_name = 'estado_operativo'
  ),
  "ALTER TABLE sensor_instalado
   MODIFY COLUMN estado_operativo ENUM('activo','inactivo','mantenimiento') NOT NULL DEFAULT 'activo'",
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- =========================
-- 3) lectura (para orderBy fecha/hora)
-- =========================
CALL sp_add_column_if_missing(
  'lectura',
  'hora',
  "ALTER TABLE lectura ADD COLUMN hora TIME NOT NULL DEFAULT '00:00:00'"
);

-- =========================
-- 4) Limpieza
-- =========================
DROP PROCEDURE IF EXISTS sp_add_column_if_missing;
