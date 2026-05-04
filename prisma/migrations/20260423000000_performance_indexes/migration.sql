-- Add indexes used by read-heavy API paths and aggregate maintenance.
CREATE INDEX `idx_organizacion_sucursal_org_estado` ON `organizacion_sucursal`(`id_organizacion`, `estado`);
CREATE INDEX `idx_usuario_estado` ON `usuario`(`estado`);
CREATE INDEX `idx_instalacion_sucursal_estado` ON `instalacion`(`id_organizacion_sucursal`, `estado_operativo`);
CREATE INDEX `idx_catalogo_sensores_nombre` ON `catalogo_sensores`(`sensor`);
CREATE INDEX `idx_sensor_instalado_inst_sensor` ON `sensor_instalado`(`id_instalacion`, `id_sensor`);
CREATE INDEX `idx_alertas_fecha_alerta` ON `alertas`(`fecha_alerta`);
CREATE INDEX `idx_alertas_leida_fecha` ON `alertas`(`leida`, `fecha_alerta`);
CREATE INDEX `idx_procesos_estado` ON `procesos`(`estado`);
CREATE INDEX `idx_lectura_fecha_hora_id` ON `lectura`(`fecha`, `hora`, `id_lectura`);
CREATE INDEX `idx_promedio_fecha_hora_id` ON `promedio`(`fecha`, `hora`, `pk_promedio`);
CREATE INDEX `idx_resumen_horaria_fecha_hora_id` ON `resumen_lectura_horaria`(`fecha`, `hora`, `id_resumen`);
