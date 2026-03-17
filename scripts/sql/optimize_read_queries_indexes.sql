-- Optimiza filtros/rangos por fecha+hora de lecturas en endpoints de monitoreo.
-- Ejecutar en el esquema objetivo:
--   mysql -u <user> -p <database> < optimize_read_queries_indexes.sql

SET @target_schema = DATABASE();
SET @index_name = 'idx_lectura_sensor_fecha_hora';

SET @has_index = (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = @target_schema
    AND table_name = 'lectura'
    AND index_name = @index_name
);

SET @ddl = IF(
  @has_index = 0,
  'ALTER TABLE lectura ADD INDEX idx_lectura_sensor_fecha_hora (id_sensor_instalado, fecha, hora)',
  'SELECT ''Index idx_lectura_sensor_fecha_hora already exists'' AS info'
);

PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
