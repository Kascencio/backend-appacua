-- CreateTable
CREATE TABLE `telegram_conversacion_estado` (
    `chat_id` VARCHAR(64) NOT NULL,
    `estado` VARCHAR(50) NOT NULL DEFAULT 'inicio',
    `fecha_creacion` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `ultima_interaccion` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`chat_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
