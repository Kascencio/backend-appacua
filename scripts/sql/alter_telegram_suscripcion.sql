-- Vinculo de chats Telegram con usuarios de la plataforma
CREATE TABLE IF NOT EXISTS telegram_suscripcion (
  id_telegram_suscripcion INT AUTO_INCREMENT PRIMARY KEY,
  id_usuario INT NOT NULL,
  chat_id VARCHAR(64) NOT NULL,
  username VARCHAR(100) NULL,
  first_name VARCHAR(120) NULL,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ultima_verificacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_telegram_chat_id (chat_id),
  KEY idx_telegram_usuario (id_usuario),
  KEY idx_telegram_activo (activo),
  CONSTRAINT fk_telegram_usuario
    FOREIGN KEY (id_usuario)
    REFERENCES usuario (id_usuario)
    ON DELETE CASCADE
    ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
