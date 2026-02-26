-- Persistencia de notificaciones en tabla alertas
-- Compatible con MySQL 5.7+ / 8+ (sin ADD COLUMN IF NOT EXISTS)

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

CALL sp_add_column_if_missing('alertas', 'leida', 'ALTER TABLE alertas ADD COLUMN leida TINYINT(1) NOT NULL DEFAULT 0 AFTER dato_puntual');
CALL sp_add_column_if_missing('alertas', 'fecha_lectura', 'ALTER TABLE alertas ADD COLUMN fecha_lectura DATETIME NULL AFTER leida');
CALL sp_add_column_if_missing('alertas', 'fecha_alerta', 'ALTER TABLE alertas ADD COLUMN fecha_alerta DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER fecha_lectura');

UPDATE alertas
SET leida = 0
WHERE leida IS NULL;

UPDATE alertas
SET fecha_alerta = COALESCE(fecha_alerta, NOW())
WHERE fecha_alerta IS NULL;

DROP PROCEDURE IF EXISTS sp_add_column_if_missing;
