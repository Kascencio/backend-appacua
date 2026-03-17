-- CreateTable
CREATE TABLE `estados` (
    `id_estado` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre_estado` VARCHAR(45) NOT NULL,

    PRIMARY KEY (`id_estado`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `municipios` (
    `id_municipio` INTEGER NOT NULL AUTO_INCREMENT,
    `id_estado` INTEGER NOT NULL,
    `nombre_municipio` VARCHAR(45) NOT NULL,

    INDEX `id_estado`(`id_estado`),
    PRIMARY KEY (`id_municipio`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `codigos_postales` (
    `id_cp` INTEGER NOT NULL AUTO_INCREMENT,
    `id_municipio` INTEGER NOT NULL,
    `codigo_postal` VARCHAR(10) NOT NULL,

    INDEX `id_municipio`(`id_municipio`),
    PRIMARY KEY (`id_cp`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `colonias` (
    `id_colonia` INTEGER NOT NULL AUTO_INCREMENT,
    `id_cp` INTEGER NOT NULL,
    `nombre_colonia` VARCHAR(100) NOT NULL,

    INDEX `id_cp`(`id_cp`),
    PRIMARY KEY (`id_colonia`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `organizacion` (
    `id_organizacion` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre` VARCHAR(160) NOT NULL,
    `razon_social` VARCHAR(255) NULL,
    `rfc` VARCHAR(20) NULL,
    `correo` VARCHAR(255) NULL,
    `telefono` VARCHAR(20) NULL,
    `direccion` VARCHAR(255) NULL,
    `latitud` DECIMAL(10, 7) NULL,
    `longitud` DECIMAL(10, 7) NULL,
    `zona_horaria` VARCHAR(60) NULL,
    `descripcion` TEXT NULL,
    `id_estado` INTEGER NULL,
    `id_municipio` INTEGER NULL,
    `estado` ENUM('activa', 'inactiva') NOT NULL DEFAULT 'activa',
    `fecha_creacion` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `ultima_modificacion` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_organizacion_estado`(`id_estado`),
    INDEX `idx_organizacion_municipio`(`id_municipio`),
    INDEX `idx_organizacion_rfc`(`rfc`),
    INDEX `idx_organizacion_correo`(`correo`),
    PRIMARY KEY (`id_organizacion`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `organizacion_sucursal` (
    `id_organizacion_sucursal` INTEGER NOT NULL AUTO_INCREMENT,
    `id_organizacion` INTEGER NOT NULL,
    `nombre_sucursal` VARCHAR(160) NOT NULL,
    `telefono_sucursal` VARCHAR(20) NULL,
    `correo_sucursal` VARCHAR(255) NULL,
    `direccion_sucursal` VARCHAR(255) NULL,
    `numero_int_ext` VARCHAR(30) NULL,
    `referencia` VARCHAR(255) NULL,
    `id_cp` INTEGER NULL,
    `id_colonia` INTEGER NULL,
    `latitud` DECIMAL(10, 7) NULL,
    `longitud` DECIMAL(10, 7) NULL,
    `id_estado` INTEGER NULL,
    `id_municipio` INTEGER NULL,
    `estado` ENUM('activa', 'inactiva') NOT NULL DEFAULT 'activa',
    `fecha_creacion` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `ultima_modificacion` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_organizacion_sucursal_org`(`id_organizacion`),
    INDEX `idx_organizacion_sucursal_estado`(`id_estado`),
    INDEX `idx_organizacion_sucursal_municipio`(`id_municipio`),
    PRIMARY KEY (`id_organizacion_sucursal`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tipo_rol` (
    `id_rol` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre` VARCHAR(50) NOT NULL,

    UNIQUE INDEX `uq_nombre_rol`(`nombre`),
    PRIMARY KEY (`id_rol`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `usuario` (
    `id_usuario` INTEGER NOT NULL AUTO_INCREMENT,
    `id_rol` INTEGER NOT NULL,
    `nombre_completo` VARCHAR(100) NOT NULL,
    `correo` VARCHAR(100) NOT NULL,
    `telefono` VARCHAR(20) NULL,
    `password_hash` CHAR(60) NOT NULL,
    `estado` ENUM('activo', 'inactivo') NOT NULL DEFAULT 'activo',
    `fecha_creacion` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `uq_usuario_correo`(`correo`),
    INDEX `fk_usuario_rol`(`id_rol`),
    PRIMARY KEY (`id_usuario`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `telegram_suscripcion` (
    `id_telegram_suscripcion` INTEGER NOT NULL AUTO_INCREMENT,
    `id_usuario` INTEGER NOT NULL,
    `chat_id` VARCHAR(64) NOT NULL,
    `username` VARCHAR(100) NULL,
    `first_name` VARCHAR(120) NULL,
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `fecha_creacion` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `ultima_verificacion` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `uq_telegram_chat_id`(`chat_id`),
    INDEX `idx_telegram_usuario`(`id_usuario`),
    INDEX `idx_telegram_activo`(`activo`),
    PRIMARY KEY (`id_telegram_suscripcion`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `token_recuperacion` (
    `id_token` INTEGER NOT NULL AUTO_INCREMENT,
    `id_usuario` INTEGER NOT NULL,
    `token` CHAR(64) NOT NULL,
    `expiracion` DATETIME(0) NOT NULL,

    UNIQUE INDEX `uq_token`(`token`),
    INDEX `fk_tr_usuario`(`id_usuario`),
    PRIMARY KEY (`id_token`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `instalacion` (
    `id_instalacion` INTEGER NOT NULL AUTO_INCREMENT,
    `id_organizacion_sucursal` INTEGER NOT NULL,
    `nombre_instalacion` VARCHAR(100) NOT NULL,
    `codigo_instalacion` VARCHAR(40) NULL,
    `fecha_instalacion` DATE NOT NULL,
    `estado_operativo` ENUM('activo', 'inactivo') NOT NULL,
    `descripcion` VARCHAR(200) NOT NULL,
    `tipo_uso` ENUM('acuicultura', 'tratamiento', 'otros') NOT NULL,
    `ubicacion` VARCHAR(255) NULL,
    `latitud` DECIMAL(10, 7) NULL,
    `longitud` DECIMAL(10, 7) NULL,
    `capacidad_maxima` DECIMAL(12, 2) NULL,
    `capacidad_actual` DECIMAL(12, 2) NULL,
    `volumen_agua_m3` DECIMAL(12, 2) NULL,
    `profundidad_m` DECIMAL(6, 2) NULL,
    `fecha_ultima_inspeccion` DATE NULL,
    `responsable_operativo` VARCHAR(120) NULL,
    `contacto_emergencia` VARCHAR(40) NULL,
    `id_proceso` INTEGER NOT NULL,

    INDEX `idx_ins_orgsuc`(`id_organizacion_sucursal`),
    INDEX `id_proceso`(`id_proceso`),
    PRIMARY KEY (`id_instalacion`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `catalogo_sensores` (
    `id_sensor` INTEGER NOT NULL AUTO_INCREMENT,
    `sensor` VARCHAR(45) NOT NULL,
    `descripcion` VARCHAR(500) NOT NULL,
    `modelo` VARCHAR(45) NULL,
    `marca` VARCHAR(45) NULL,
    `rango_medicion` VARCHAR(45) NULL,
    `unidad_medida` VARCHAR(45) NULL,

    PRIMARY KEY (`id_sensor`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sensor_instalado` (
    `id_sensor_instalado` INTEGER NOT NULL AUTO_INCREMENT,
    `id_instalacion` INTEGER NULL,
    `id_sensor` INTEGER NOT NULL,
    `fecha_instalada` DATE NOT NULL,
    `descripcion` VARCHAR(50) NOT NULL,
    `estado_operativo` ENUM('activo', 'inactivo', 'mantenimiento') NOT NULL DEFAULT 'activo',
    `fecha_mantenimiento` DATETIME(0) NULL,
    `id_lectura` INTEGER NULL,

    INDEX `id_instalacion`(`id_instalacion`),
    INDEX `id_sensor`(`id_sensor`),
    INDEX `id_lectura`(`id_lectura`),
    PRIMARY KEY (`id_sensor_instalado`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `asignacion_usuario` (
    `id_asignacion` INTEGER NOT NULL AUTO_INCREMENT,
    `id_usuario` INTEGER NOT NULL,
    `id_organizacion_sucursal` INTEGER NULL,
    `id_instalacion` INTEGER NULL,
    `fecha_asignacion` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `fk_au_instalacion`(`id_instalacion`),
    INDEX `fk_au_sucursal`(`id_organizacion_sucursal`),
    UNIQUE INDEX `uq_usuario_emp_inst`(`id_usuario`, `id_organizacion_sucursal`, `id_instalacion`),
    PRIMARY KEY (`id_asignacion`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `alertas` (
    `id_alertas` INTEGER NOT NULL AUTO_INCREMENT,
    `id_instalacion` INTEGER NOT NULL,
    `id_sensor_instalado` INTEGER NOT NULL,
    `descripcion` VARCHAR(100) NOT NULL,
    `dato_puntual` DECIMAL(10, 2) NOT NULL,
    `leida` BOOLEAN NOT NULL DEFAULT false,
    `fecha_lectura` DATETIME(0) NULL,
    `fecha_alerta` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `id_instalacion`(`id_instalacion`),
    INDEX `id_sensor_instalado`(`id_sensor_instalado`),
    PRIMARY KEY (`id_alertas`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `parametros` (
    `id_parametro` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre_parametro` VARCHAR(100) NULL,
    `unidad_medida` VARCHAR(100) NULL,

    PRIMARY KEY (`id_parametro`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `especies` (
    `id_especie` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre` VARCHAR(100) NOT NULL,
    `nombre_cientifico` VARCHAR(150) NULL,
    `descripcion` TEXT NULL,
    `temperatura_optima_min` DECIMAL(6, 2) NULL,
    `temperatura_optima_max` DECIMAL(6, 2) NULL,
    `ph_optimo_min` DECIMAL(4, 2) NULL,
    `ph_optimo_max` DECIMAL(4, 2) NULL,
    `oxigeno_optimo_min` DECIMAL(6, 2) NULL,
    `oxigeno_optimo_max` DECIMAL(6, 2) NULL,
    `salinidad_optima_min` DECIMAL(6, 2) NULL,
    `salinidad_optima_max` DECIMAL(6, 2) NULL,
    `estado` ENUM('activa', 'inactiva') NOT NULL DEFAULT 'activa',

    PRIMARY KEY (`id_especie`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `especie_parametro` (
    `id_especie_parametro` INTEGER NOT NULL AUTO_INCREMENT,
    `id_especie` INTEGER NOT NULL,
    `id_parametro` INTEGER NOT NULL,
    `Rmax` FLOAT NOT NULL,
    `Rmin` FLOAT NOT NULL,

    INDEX `id_especie`(`id_especie`),
    INDEX `id_parametro`(`id_parametro`),
    PRIMARY KEY (`id_especie_parametro`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `procesos` (
    `id_proceso` INTEGER NOT NULL AUTO_INCREMENT,
    `id_especie` INTEGER NOT NULL,
    `nombre_proceso` VARCHAR(150) NULL,
    `descripcion` TEXT NULL,
    `objetivos` TEXT NULL,
    `estado` ENUM('planificado', 'en_progreso', 'pausado', 'completado', 'cancelado') NOT NULL DEFAULT 'planificado',
    `porcentaje_avance` DECIMAL(5, 2) NULL,
    `fecha_inicio` DATE NOT NULL,
    `fecha_final` DATE NOT NULL,
    `fecha_fin_real` DATE NULL,
    `motivo_cierre` TEXT NULL,

    INDEX `id_especie`(`id_especie`),
    PRIMARY KEY (`id_proceso`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `lectura` (
    `id_lectura` INTEGER NOT NULL AUTO_INCREMENT,
    `id_sensor_instalado` INTEGER NOT NULL,
    `valor` DECIMAL(10, 2) NOT NULL,
    `fecha` DATE NOT NULL,
    `hora` TIME(0) NOT NULL,

    INDEX `idx_lectura_sensor_fecha`(`id_sensor_instalado`, `fecha`),
    INDEX `idx_lectura_sensor_fecha_hora`(`id_sensor_instalado`, `fecha`, `hora`),
    INDEX `idx_lectura_fecha`(`fecha`),
    INDEX `idx_lectura_id_sensor_instalado`(`id_sensor_instalado`),
    PRIMARY KEY (`id_lectura`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `promedio` (
    `pk_promedio` INTEGER NOT NULL AUTO_INCREMENT,
    `id_sensor_instalado` INTEGER NOT NULL,
    `fecha` DATE NOT NULL,
    `hora` TIME(0) NOT NULL,
    `promedio` DECIMAL(10, 2) NOT NULL,

    UNIQUE INDEX `uq_sensor_fecha_hora`(`id_sensor_instalado`, `fecha`, `hora`),
    PRIMARY KEY (`pk_promedio`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `resumen_lectura_horaria` (
    `id_resumen` INTEGER NOT NULL AUTO_INCREMENT,
    `id_sensor_instalado` INTEGER NOT NULL,
    `fecha` DATE NOT NULL,
    `hora` TIME(0) NOT NULL,
    `promedio` DECIMAL(10, 2) NOT NULL,
    `registros` INTEGER NOT NULL DEFAULT 0,

    UNIQUE INDEX `uq_sensor_fecha_hora`(`id_sensor_instalado`, `fecha`, `hora`),
    PRIMARY KEY (`id_resumen`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `municipios` ADD CONSTRAINT `fk_mun_estado` FOREIGN KEY (`id_estado`) REFERENCES `estados`(`id_estado`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `codigos_postales` ADD CONSTRAINT `fk_cp_municipio` FOREIGN KEY (`id_municipio`) REFERENCES `municipios`(`id_municipio`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `colonias` ADD CONSTRAINT `fk_col_cp` FOREIGN KEY (`id_cp`) REFERENCES `codigos_postales`(`id_cp`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `organizacion` ADD CONSTRAINT `organizacion_id_estado_fkey` FOREIGN KEY (`id_estado`) REFERENCES `estados`(`id_estado`) ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `organizacion` ADD CONSTRAINT `organizacion_id_municipio_fkey` FOREIGN KEY (`id_municipio`) REFERENCES `municipios`(`id_municipio`) ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `organizacion_sucursal` ADD CONSTRAINT `organizacion_sucursal_id_estado_fkey` FOREIGN KEY (`id_estado`) REFERENCES `estados`(`id_estado`) ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `organizacion_sucursal` ADD CONSTRAINT `organizacion_sucursal_id_municipio_fkey` FOREIGN KEY (`id_municipio`) REFERENCES `municipios`(`id_municipio`) ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `organizacion_sucursal` ADD CONSTRAINT `organizacion_sucursal_id_organizacion_fkey` FOREIGN KEY (`id_organizacion`) REFERENCES `organizacion`(`id_organizacion`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `usuario` ADD CONSTRAINT `fk_usuario_rol` FOREIGN KEY (`id_rol`) REFERENCES `tipo_rol`(`id_rol`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `telegram_suscripcion` ADD CONSTRAINT `fk_telegram_usuario` FOREIGN KEY (`id_usuario`) REFERENCES `usuario`(`id_usuario`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `token_recuperacion` ADD CONSTRAINT `fk_tok_usuario` FOREIGN KEY (`id_usuario`) REFERENCES `usuario`(`id_usuario`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `instalacion` ADD CONSTRAINT `fk_ins_orgsuc` FOREIGN KEY (`id_organizacion_sucursal`) REFERENCES `organizacion_sucursal`(`id_organizacion_sucursal`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `instalacion` ADD CONSTRAINT `instalacion_ibfk_2` FOREIGN KEY (`id_proceso`) REFERENCES `procesos`(`id_proceso`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `sensor_instalado` ADD CONSTRAINT `fk_si_instalacion` FOREIGN KEY (`id_instalacion`) REFERENCES `instalacion`(`id_instalacion`) ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `sensor_instalado` ADD CONSTRAINT `fk_si_sensor` FOREIGN KEY (`id_sensor`) REFERENCES `catalogo_sensores`(`id_sensor`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `sensor_instalado` ADD CONSTRAINT `sensor_instalado_ibfk_3` FOREIGN KEY (`id_lectura`) REFERENCES `lectura`(`id_lectura`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `asignacion_usuario` ADD CONSTRAINT `fk_asig_instalacion` FOREIGN KEY (`id_instalacion`) REFERENCES `instalacion`(`id_instalacion`) ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `asignacion_usuario` ADD CONSTRAINT `fk_asig_orgsuc` FOREIGN KEY (`id_organizacion_sucursal`) REFERENCES `organizacion_sucursal`(`id_organizacion_sucursal`) ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `asignacion_usuario` ADD CONSTRAINT `fk_asig_usuario` FOREIGN KEY (`id_usuario`) REFERENCES `usuario`(`id_usuario`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `alertas` ADD CONSTRAINT `alertas_ibfk_2` FOREIGN KEY (`id_sensor_instalado`) REFERENCES `sensor_instalado`(`id_sensor_instalado`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `alertas` ADD CONSTRAINT `fk_alerta_instalacion` FOREIGN KEY (`id_instalacion`) REFERENCES `instalacion`(`id_instalacion`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `especie_parametro` ADD CONSTRAINT `fk_esparam_especie` FOREIGN KEY (`id_especie`) REFERENCES `especies`(`id_especie`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `especie_parametro` ADD CONSTRAINT `fk_esparam_param` FOREIGN KEY (`id_parametro`) REFERENCES `parametros`(`id_parametro`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `procesos` ADD CONSTRAINT `fk_proc_especie` FOREIGN KEY (`id_especie`) REFERENCES `especies`(`id_especie`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `lectura` ADD CONSTRAINT `fk_lectura_sensor_instalado` FOREIGN KEY (`id_sensor_instalado`) REFERENCES `sensor_instalado`(`id_sensor_instalado`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `promedio` ADD CONSTRAINT `promedio_ibfk_1` FOREIGN KEY (`id_sensor_instalado`) REFERENCES `sensor_instalado`(`id_sensor_instalado`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `resumen_lectura_horaria` ADD CONSTRAINT `resumen_lectura_horaria_ibfk_1` FOREIGN KEY (`id_sensor_instalado`) REFERENCES `sensor_instalado`(`id_sensor_instalado`) ON DELETE RESTRICT ON UPDATE RESTRICT;
