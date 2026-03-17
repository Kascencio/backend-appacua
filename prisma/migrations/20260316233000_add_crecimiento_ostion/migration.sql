-- CreateTable
CREATE TABLE `crecimiento_ostion_config` (
    `id_crecimiento_ostion_config` INTEGER NOT NULL AUTO_INCREMENT,
    `id_proceso` INTEGER NOT NULL,
    `capturas_requeridas` INTEGER NOT NULL,
    `lotes_por_captura` INTEGER NOT NULL,
    `calendario_modo` ENUM('automatico', 'manual') NOT NULL DEFAULT 'automatico',
    `fecha_creacion` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `ultima_modificacion` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `uq_crecimiento_ostion_proceso`(`id_proceso`),
    PRIMARY KEY (`id_crecimiento_ostion_config`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `crecimiento_ostion_captura` (
    `id_crecimiento_ostion_captura` INTEGER NOT NULL AUTO_INCREMENT,
    `id_crecimiento_ostion_config` INTEGER NOT NULL,
    `numero_captura` INTEGER NOT NULL,
    `fecha_programada` DATE NOT NULL,
    `fecha_real` DATE NULL,
    `estado` ENUM('pendiente', 'parcial', 'completada') NOT NULL DEFAULT 'pendiente',
    `es_extra` BOOLEAN NOT NULL DEFAULT false,
    `observaciones` TEXT NULL,
    `fecha_creacion` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `ultima_modificacion` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `uq_crecimiento_ostion_numero`(`id_crecimiento_ostion_config`, `numero_captura`),
    INDEX `idx_crecimiento_ostion_captura_config`(`id_crecimiento_ostion_config`),
    PRIMARY KEY (`id_crecimiento_ostion_captura`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `crecimiento_ostion_medicion` (
    `id_crecimiento_ostion_medicion` INTEGER NOT NULL AUTO_INCREMENT,
    `id_crecimiento_ostion_captura` INTEGER NOT NULL,
    `lote_numero` INTEGER NOT NULL,
    `valor` DECIMAL(10, 2) NOT NULL,
    `unidad` ENUM('cm', 'kg') NOT NULL,
    `observaciones` TEXT NULL,
    `fecha_creacion` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `ultima_modificacion` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `uq_crecimiento_ostion_lote`(`id_crecimiento_ostion_captura`, `lote_numero`),
    INDEX `idx_crecimiento_ostion_medicion_captura`(`id_crecimiento_ostion_captura`),
    PRIMARY KEY (`id_crecimiento_ostion_medicion`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `crecimiento_ostion_config` ADD CONSTRAINT `fk_crecimiento_ostion_proceso` FOREIGN KEY (`id_proceso`) REFERENCES `procesos`(`id_proceso`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `crecimiento_ostion_captura` ADD CONSTRAINT `fk_crecimiento_ostion_captura_config` FOREIGN KEY (`id_crecimiento_ostion_config`) REFERENCES `crecimiento_ostion_config`(`id_crecimiento_ostion_config`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `crecimiento_ostion_medicion` ADD CONSTRAINT `fk_crecimiento_ostion_medicion_captura` FOREIGN KEY (`id_crecimiento_ostion_captura`) REFERENCES `crecimiento_ostion_captura`(`id_crecimiento_ostion_captura`) ON DELETE CASCADE ON UPDATE RESTRICT;
