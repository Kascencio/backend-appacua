-- Permitir sensores sin instalación y añadir estado operativo de sensor.
-- Compatible con MySQL 5.7+/8.x sin usar ADD COLUMN IF NOT EXISTS.

SET @db_name = DATABASE();

-- 1) id_instalacion nullable
SET @is_nullable = (
  SELECT IS_NULLABLE
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db_name
    AND TABLE_NAME = 'sensor_instalado'
    AND COLUMN_NAME = 'id_instalacion'
  LIMIT 1
);
SET @sql = IF(@is_nullable = 'NO',
  'ALTER TABLE sensor_instalado MODIFY COLUMN id_instalacion INT NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2) estado_operativo
SET @estado_col_exists = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db_name
    AND TABLE_NAME = 'sensor_instalado'
    AND COLUMN_NAME = 'estado_operativo'
);
SET @sql = IF(@estado_col_exists = 0,
  "ALTER TABLE sensor_instalado ADD COLUMN estado_operativo ENUM('activo','inactivo','mantenimiento') NOT NULL DEFAULT 'activo' AFTER descripcion",
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3) Ajustar enum por si existe sin 'mantenimiento'
SET @estado_col_type = (
  SELECT COLUMN_TYPE
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db_name
    AND TABLE_NAME = 'sensor_instalado'
    AND COLUMN_NAME = 'estado_operativo'
  LIMIT 1
);
SET @sql = IF(@estado_col_type NOT LIKE "%mantenimiento%",
  "ALTER TABLE sensor_instalado MODIFY COLUMN estado_operativo ENUM('activo','inactivo','mantenimiento') NOT NULL DEFAULT 'activo'",
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 4) fecha_mantenimiento
SET @fecha_mant_exists = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db_name
    AND TABLE_NAME = 'sensor_instalado'
    AND COLUMN_NAME = 'fecha_mantenimiento'
);
SET @sql = IF(@fecha_mant_exists = 0,
  'ALTER TABLE sensor_instalado ADD COLUMN fecha_mantenimiento DATETIME NULL AFTER estado_operativo',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 5) índices útiles
SET @idx_estado_exists = (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @db_name
    AND TABLE_NAME = 'sensor_instalado'
    AND INDEX_NAME = 'idx_si_estado_operativo'
);
SET @sql = IF(@idx_estado_exists = 0,
  'ALTER TABLE sensor_instalado ADD INDEX idx_si_estado_operativo (estado_operativo)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_mant_exists = (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @db_name
    AND TABLE_NAME = 'sensor_instalado'
    AND INDEX_NAME = 'idx_si_fecha_mantenimiento'
);
SET @sql = IF(@idx_mant_exists = 0,
  'ALTER TABLE sensor_instalado ADD INDEX idx_si_fecha_mantenimiento (fecha_mantenimiento)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
