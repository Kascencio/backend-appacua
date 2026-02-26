-- AQUA Monitor
-- Alineación de backend/BD con campos usados en frontend (idempotente)
-- Compatible con MySQL 5.7+ / 8+ sin usar "ADD COLUMN IF NOT EXISTS".

SET NAMES utf8mb4;

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

-- organizacion
CALL sp_add_column_if_missing('organizacion', 'direccion', 'ALTER TABLE organizacion ADD COLUMN direccion VARCHAR(255) NULL AFTER telefono');
CALL sp_add_column_if_missing('organizacion', 'latitud', 'ALTER TABLE organizacion ADD COLUMN latitud DECIMAL(10,7) NULL AFTER direccion');
CALL sp_add_column_if_missing('organizacion', 'longitud', 'ALTER TABLE organizacion ADD COLUMN longitud DECIMAL(10,7) NULL AFTER latitud');
CALL sp_add_column_if_missing('organizacion', 'zona_horaria', 'ALTER TABLE organizacion ADD COLUMN zona_horaria VARCHAR(60) NULL AFTER longitud');

-- organizacion_sucursal
CALL sp_add_column_if_missing('organizacion_sucursal', 'direccion_sucursal', 'ALTER TABLE organizacion_sucursal ADD COLUMN direccion_sucursal VARCHAR(255) NULL AFTER correo_sucursal');
CALL sp_add_column_if_missing('organizacion_sucursal', 'numero_int_ext', 'ALTER TABLE organizacion_sucursal ADD COLUMN numero_int_ext VARCHAR(30) NULL AFTER direccion_sucursal');
CALL sp_add_column_if_missing('organizacion_sucursal', 'referencia', 'ALTER TABLE organizacion_sucursal ADD COLUMN referencia VARCHAR(255) NULL AFTER numero_int_ext');
CALL sp_add_column_if_missing('organizacion_sucursal', 'id_cp', 'ALTER TABLE organizacion_sucursal ADD COLUMN id_cp INT NULL AFTER referencia');
CALL sp_add_column_if_missing('organizacion_sucursal', 'id_colonia', 'ALTER TABLE organizacion_sucursal ADD COLUMN id_colonia INT NULL AFTER id_cp');
CALL sp_add_column_if_missing('organizacion_sucursal', 'latitud', 'ALTER TABLE organizacion_sucursal ADD COLUMN latitud DECIMAL(10,7) NULL AFTER id_colonia');
CALL sp_add_column_if_missing('organizacion_sucursal', 'longitud', 'ALTER TABLE organizacion_sucursal ADD COLUMN longitud DECIMAL(10,7) NULL AFTER latitud');

-- instalacion
CALL sp_add_column_if_missing('instalacion', 'codigo_instalacion', 'ALTER TABLE instalacion ADD COLUMN codigo_instalacion VARCHAR(40) NULL AFTER nombre_instalacion');
CALL sp_add_column_if_missing('instalacion', 'ubicacion', 'ALTER TABLE instalacion ADD COLUMN ubicacion VARCHAR(255) NULL AFTER tipo_uso');
CALL sp_add_column_if_missing('instalacion', 'latitud', 'ALTER TABLE instalacion ADD COLUMN latitud DECIMAL(10,7) NULL AFTER ubicacion');
CALL sp_add_column_if_missing('instalacion', 'longitud', 'ALTER TABLE instalacion ADD COLUMN longitud DECIMAL(10,7) NULL AFTER latitud');
CALL sp_add_column_if_missing('instalacion', 'capacidad_maxima', 'ALTER TABLE instalacion ADD COLUMN capacidad_maxima DECIMAL(12,2) NULL AFTER longitud');
CALL sp_add_column_if_missing('instalacion', 'capacidad_actual', 'ALTER TABLE instalacion ADD COLUMN capacidad_actual DECIMAL(12,2) NULL AFTER capacidad_maxima');
CALL sp_add_column_if_missing('instalacion', 'volumen_agua_m3', 'ALTER TABLE instalacion ADD COLUMN volumen_agua_m3 DECIMAL(12,2) NULL AFTER capacidad_actual');
CALL sp_add_column_if_missing('instalacion', 'profundidad_m', 'ALTER TABLE instalacion ADD COLUMN profundidad_m DECIMAL(6,2) NULL AFTER volumen_agua_m3');
CALL sp_add_column_if_missing('instalacion', 'fecha_ultima_inspeccion', 'ALTER TABLE instalacion ADD COLUMN fecha_ultima_inspeccion DATE NULL AFTER profundidad_m');
CALL sp_add_column_if_missing('instalacion', 'responsable_operativo', 'ALTER TABLE instalacion ADD COLUMN responsable_operativo VARCHAR(120) NULL AFTER fecha_ultima_inspeccion');
CALL sp_add_column_if_missing('instalacion', 'contacto_emergencia', 'ALTER TABLE instalacion ADD COLUMN contacto_emergencia VARCHAR(40) NULL AFTER responsable_operativo');

-- especies
CALL sp_add_column_if_missing('especies', 'nombre_cientifico', 'ALTER TABLE especies ADD COLUMN nombre_cientifico VARCHAR(150) NULL AFTER nombre');
CALL sp_add_column_if_missing('especies', 'descripcion', 'ALTER TABLE especies ADD COLUMN descripcion TEXT NULL AFTER nombre_cientifico');
CALL sp_add_column_if_missing('especies', 'temperatura_optima_min', 'ALTER TABLE especies ADD COLUMN temperatura_optima_min DECIMAL(6,2) NULL AFTER descripcion');
CALL sp_add_column_if_missing('especies', 'temperatura_optima_max', 'ALTER TABLE especies ADD COLUMN temperatura_optima_max DECIMAL(6,2) NULL AFTER temperatura_optima_min');
CALL sp_add_column_if_missing('especies', 'ph_optimo_min', 'ALTER TABLE especies ADD COLUMN ph_optimo_min DECIMAL(4,2) NULL AFTER temperatura_optima_max');
CALL sp_add_column_if_missing('especies', 'ph_optimo_max', 'ALTER TABLE especies ADD COLUMN ph_optimo_max DECIMAL(4,2) NULL AFTER ph_optimo_min');
CALL sp_add_column_if_missing('especies', 'oxigeno_optimo_min', 'ALTER TABLE especies ADD COLUMN oxigeno_optimo_min DECIMAL(6,2) NULL AFTER ph_optimo_max');
CALL sp_add_column_if_missing('especies', 'oxigeno_optimo_max', 'ALTER TABLE especies ADD COLUMN oxigeno_optimo_max DECIMAL(6,2) NULL AFTER oxigeno_optimo_min');
CALL sp_add_column_if_missing('especies', 'salinidad_optima_min', 'ALTER TABLE especies ADD COLUMN salinidad_optima_min DECIMAL(6,2) NULL AFTER oxigeno_optimo_max');
CALL sp_add_column_if_missing('especies', 'salinidad_optima_max', 'ALTER TABLE especies ADD COLUMN salinidad_optima_max DECIMAL(6,2) NULL AFTER salinidad_optima_min');
CALL sp_add_column_if_missing('especies', 'estado', 'ALTER TABLE especies ADD COLUMN estado ENUM(''activa'',''inactiva'') NOT NULL DEFAULT ''activa'' AFTER salinidad_optima_max');

-- procesos
CALL sp_add_column_if_missing('procesos', 'nombre_proceso', 'ALTER TABLE procesos ADD COLUMN nombre_proceso VARCHAR(150) NULL AFTER id_especie');
CALL sp_add_column_if_missing('procesos', 'descripcion', 'ALTER TABLE procesos ADD COLUMN descripcion TEXT NULL AFTER nombre_proceso');
CALL sp_add_column_if_missing('procesos', 'objetivos', 'ALTER TABLE procesos ADD COLUMN objetivos TEXT NULL AFTER descripcion');
CALL sp_add_column_if_missing('procesos', 'estado', 'ALTER TABLE procesos ADD COLUMN estado ENUM(''planificado'',''en_progreso'',''pausado'',''completado'',''cancelado'') NOT NULL DEFAULT ''planificado'' AFTER objetivos');
CALL sp_add_column_if_missing('procesos', 'porcentaje_avance', 'ALTER TABLE procesos ADD COLUMN porcentaje_avance DECIMAL(5,2) NULL AFTER estado');
CALL sp_add_column_if_missing('procesos', 'fecha_fin_real', 'ALTER TABLE procesos ADD COLUMN fecha_fin_real DATE NULL AFTER fecha_final');
CALL sp_add_column_if_missing('procesos', 'motivo_cierre', 'ALTER TABLE procesos ADD COLUMN motivo_cierre TEXT NULL AFTER fecha_fin_real');

-- alertas (persistencia de estado de notificaciones)
CALL sp_add_column_if_missing('alertas', 'leida', 'ALTER TABLE alertas ADD COLUMN leida TINYINT(1) NOT NULL DEFAULT 0 AFTER dato_puntual');
CALL sp_add_column_if_missing('alertas', 'fecha_lectura', 'ALTER TABLE alertas ADD COLUMN fecha_lectura DATETIME NULL AFTER leida');
CALL sp_add_column_if_missing('alertas', 'fecha_alerta', 'ALTER TABLE alertas ADD COLUMN fecha_alerta DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER fecha_lectura');

DROP PROCEDURE IF EXISTS sp_add_column_if_missing;

-- Roles requeridos por frontend (incluye SUPERADMIN)
INSERT INTO tipo_rol (nombre)
SELECT 'SUPERADMIN'
WHERE NOT EXISTS (
  SELECT 1
  FROM tipo_rol
  WHERE UPPER(TRIM(nombre)) = 'SUPERADMIN'
);

INSERT INTO tipo_rol (nombre)
SELECT 'ADMIN'
WHERE NOT EXISTS (
  SELECT 1
  FROM tipo_rol
  WHERE UPPER(TRIM(nombre)) = 'ADMIN'
);

INSERT INTO tipo_rol (nombre)
SELECT 'USER'
WHERE NOT EXISTS (
  SELECT 1
  FROM tipo_rol
  WHERE UPPER(TRIM(nombre)) = 'USER'
);

-- Backfill base para que UI tenga datos consistentes
UPDATE especies
SET nombre_cientifico = nombre
WHERE nombre_cientifico IS NULL OR TRIM(nombre_cientifico) = '';

UPDATE procesos
SET nombre_proceso = CONCAT('Proceso ', id_proceso)
WHERE nombre_proceso IS NULL OR TRIM(nombre_proceso) = '';

UPDATE procesos
SET descripcion = CONCAT('Cultivo de ', COALESCE((SELECT e.nombre FROM especies e WHERE e.id_especie = procesos.id_especie), 'especie no definida'))
WHERE descripcion IS NULL OR TRIM(descripcion) = '';

UPDATE procesos
SET estado = CASE
  WHEN CURDATE() < fecha_inicio THEN 'planificado'
  WHEN CURDATE() > fecha_final THEN 'completado'
  ELSE 'en_progreso'
END
WHERE estado IS NULL OR estado IN ('planificado', 'en_progreso', 'completado');

UPDATE procesos
SET porcentaje_avance = CASE
  WHEN fecha_final <= fecha_inicio THEN 0
  WHEN CURDATE() <= fecha_inicio THEN 0
  WHEN CURDATE() >= fecha_final THEN 100
  ELSE ROUND((DATEDIFF(CURDATE(), fecha_inicio) / NULLIF(DATEDIFF(fecha_final, fecha_inicio), 0)) * 100, 2)
END
WHERE porcentaje_avance IS NULL;

UPDATE instalacion
SET codigo_instalacion = CONCAT('INS-', LPAD(id_instalacion, 5, '0'))
WHERE codigo_instalacion IS NULL OR TRIM(codigo_instalacion) = '';

UPDATE instalacion i
JOIN organizacion_sucursal s ON s.id_organizacion_sucursal = i.id_organizacion_sucursal
SET i.ubicacion = COALESCE(i.ubicacion, s.direccion_sucursal, s.nombre_sucursal)
WHERE i.ubicacion IS NULL OR TRIM(i.ubicacion) = '';

UPDATE instalacion
SET capacidad_actual = 0
WHERE capacidad_actual IS NULL;

-- Coordenadas placeholder para evitar mapas vacíos cuando no hay geodatos cargados
UPDATE organizacion_sucursal
SET latitud = 17.9869 + ((id_organizacion_sucursal % 15) * 0.003),
    longitud = -92.9303 - ((id_organizacion_sucursal % 15) * 0.003)
WHERE latitud IS NULL OR longitud IS NULL;

UPDATE organizacion o
JOIN (
  SELECT id_organizacion, AVG(latitud) AS lat, AVG(longitud) AS lng
  FROM organizacion_sucursal
  WHERE latitud IS NOT NULL AND longitud IS NOT NULL
  GROUP BY id_organizacion
) agg ON agg.id_organizacion = o.id_organizacion
SET o.latitud = COALESCE(o.latitud, agg.lat),
    o.longitud = COALESCE(o.longitud, agg.lng)
WHERE o.latitud IS NULL OR o.longitud IS NULL;
