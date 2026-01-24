-- AQUA SONDA - Triggers de agregación
-- Mantiene tablas:
--  - promedios: promedio por bloque de 15 minutos (hora = inicio del bloque)
--  - resumen_lectura_horaria: promedio y conteo por hora
--
-- Tablas involucradas (según schema.prisma):
--  lectura(id_lectura, id_sensor_instalado, valor, fecha, hora)
--  promedios(pk_promedio, id_sensor_instalado, fecha, hora, promedio)  -- uq (id_sensor_instalado, fecha, hora)
--  resumen_lectura_horaria(id_resumen, id_sensor_instalado, fecha, hora, promedio, registros) -- uq (id_sensor_instalado, fecha, hora)
--
-- Nota:
-- - No cambia el esquema. Solo crea triggers.
-- - Si ya existe un trigger AFTER INSERT en `lectura`, debes reemplazarlo o integrar la lógica.
-- AQUA SONDA - Triggers de agregación
-- Mantiene tablas:
--  - promedios: promedio por bloque de 15 minutos (hora = inicio del bloque)
--  - resumen_lectura_horaria: promedio y conteo por hora
--
-- Tablas involucradas (según schema.prisma):
--  lectura(id_lectura, id_sensor_instalado, valor, fecha, hora)
--  promedios(pk_promedio, id_sensor_instalado, fecha, hora, promedio)  -- uq (id_sensor_instalado, fecha, hora)
--  resumen_lectura_horaria(id_resumen, id_sensor_instalado, fecha, hora, promedio, registros) -- uq (id_sensor_instalado, fecha, hora)
--
-- Nota:
-- - No cambia el esquema. Solo crea triggers.
-- - Si ya existe un trigger AFTER INSERT en `lectura`, debes reemplazarlo o integrar la lógica.

DELIMITER $$

DROP TRIGGER IF EXISTS trg_lectura_ai_agregados $$

CREATE TRIGGER trg_lectura_ai_agregados
AFTER INSERT ON lectura
FOR EACH ROW
BEGIN
  DECLARE v_slot_15 TIME;
  DECLARE v_slot_hora TIME;

  -- Bloque de 15 minutos: 00, 15, 30, 45
  -- (NEW.hora es TIME; 900 segundos = 15 min)
  SET v_slot_15 = SEC_TO_TIME(FLOOR(TIME_TO_SEC(NEW.hora) / 900) * 900);

  -- Bloque por hora
  SET v_slot_hora = SEC_TO_TIME(FLOOR(TIME_TO_SEC(NEW.hora) / 3600) * 3600);

  -- 1) Promedio por 15 minutos (recalcula AVG exacto del bloque)
  --    Usamos ON DUPLICATE KEY por la UNIQUE (id_sensor_instalado, fecha, hora)
  INSERT INTO promedio (id_sensor_instalado, fecha, hora, promedio)
  VALUES (NEW.id_sensor_instalado, NEW.fecha, v_slot_15, NEW.valor)
  ON DUPLICATE KEY UPDATE
    promedio = (
      SELECT ROUND(AVG(l.valor), 2)
      FROM lectura l
      WHERE l.id_sensor_instalado = NEW.id_sensor_instalado
        AND l.fecha = NEW.fecha
        AND l.hora >= v_slot_15
        AND l.hora < ADDTIME(v_slot_15, '00:15:00')
    );

  -- 2) Resumen por hora (incremental: promedio + registros)
  INSERT INTO resumen_lectura_horaria (id_sensor_instalado, fecha, hora, promedio, registros)
  VALUES (NEW.id_sensor_instalado, NEW.fecha, v_slot_hora, NEW.valor, 1)
  ON DUPLICATE KEY UPDATE
    promedio = ROUND((promedio * registros + NEW.valor) / (registros + 1), 2),
    registros = registros + 1;

END $$

DELIMITER ;
