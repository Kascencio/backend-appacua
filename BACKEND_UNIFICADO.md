# Backend - Documentacion Operativa Ampliada

## 1) Objetivo del servicio
Backend `Fastify + Prisma` para la plataforma AQUA con:
- autenticacion y autorizacion por roles/asignaciones,
- CRUD completo de entidades de negocio,
- lecturas y agregados de sensores,
- canales WebSocket para datos en tiempo real y notificaciones.

Este documento concentra lo necesario para operar, mantener y desplegar.

## 2) Alcance funcional
- Auth/login (`/api/login`) y manejo de token JWT.
- Usuarios, roles y asignaciones por sucursal/instalacion.
- Organizaciones, sucursales, instalaciones.
- Catalogo de sensores y sensores instalados.
- Especies, parametros, procesos.
- Alertas, lecturas, promedios y reportes.
- WS de lecturas y notificaciones.

## 3) Stack tecnico
- Node.js + TypeScript
- Fastify 5
- Prisma 5
- MySQL
- `@fastify/websocket`
- `zod` (validacion de payloads)

## 4) Arquitectura de codigo (resumen)
- `src/index.ts`: bootstrap del servidor y registro de rutas.
- `src/routes/*.routes.ts`: definicion de endpoints por dominio.
- `src/controllers/*.controller.ts`: logica de negocio por endpoint.
- `src/utils/access-control.ts`: resolucion de scope y permisos.
- `src/services/`: telegram, pollers, websocket broadcast.
- `prisma/schema.prisma`: modelo de datos.

## 5) Variables de entorno
Minimas en `.env`:
```env
NODE_ENV=production
PORT=3200
HOST=0.0.0.0

DATABASE_URL=mysql://USER:PASS@HOST:3306/DB_NAME
JWT_SECRET=REPLACE_WITH_SECURE_VALUE
JWT_EXPIRES_IN=24h
```

Opcionales recomendadas:
```env
TELEGRAM_ENABLED=true
TELEGRAM_BOT_TOKEN=<TOKEN>
TELEGRAM_CHAT_ID=<CHAT_ID>

DOCKER_IMAGE=aqua-backend:latest
DOCKER_NETWORK=aqua-backend-network
```

Reglas:
- `DATABASE_URL` debe iniciar con `mysql://`.
- evitar comillas/espacios extra en variables sensibles.

## 6) Instalacion y ejecucion
Instalacion:
```bash
npm ci
```

Desarrollo:
```bash
npm run dev
```

Compilacion y ejecucion:
```bash
npm run build
npm start
```

Seed:
```bash
npm run seed
```

## 7) Build y despliegue Docker
Build local:
```bash
docker build -t aqua-backend:latest .
```

Run local:
```bash
docker run -d --name aqua-backend \
  -p 3200:3200 \
  --env-file .env \
  aqua-backend:latest
```

Publicar a Docker Hub:
```bash
docker tag aqua-backend:latest <DOCKERHUB_USER>/aqua-backend:latest
docker push <DOCKERHUB_USER>/aqua-backend:latest
```

Portainer (recomendado):
1. Subir imagen a Docker Hub/GHCR (`<DOCKERHUB_USER>/aqua-backend:latest`).
2. En Portainer > Stacks, usar `portainer-stack.yml`.
3. Cargar variables desde `portainer.env.example` en el formulario de Environment variables.
4. Deployar el stack y validar `GET /health`.

## 8) Endpoints principales
### 8.1 Salud
- `GET /health`

### 8.2 Auth
- `POST /api/login`

### 8.3 Dominios CRUD
- `/api/usuarios`
- `/api/roles` (alias de tipos de rol)
- `/api/asignacion-usuario`
- `/api/organizaciones`
- `/api/sucursales`
- `/api/instalaciones`
- `/api/catalogo-sensores`
- `/api/sensores-instalados`
- `/api/catalogo-especies`
- `/api/especie-parametros`
- `/api/procesos`
- `/api/alertas`
- `/api/parametros`

### 8.4 Datos de sensores
- `GET /api/lecturas`
- `GET /api/promedios`
- `GET /api/resumen-horario`

### 8.5 Funcionamiento de las APIs (flujo real)
#### 8.5.1 Flujo de autenticacion
1. El cliente hace `POST /api/login` con `correo` (o `email`) y `password`.
2. Si credenciales son validas y el usuario esta activo, el backend responde:
```json
{
  "token": "JWT_TOKEN",
  "usuario": {
    "id_usuario": 1,
    "correo": "admin@example.com",
    "id_rol": 1,
    "role": "admin",
    "branchAccess": [1, 10001],
    "facilityAccess": []
  }
}
```
3. El cliente debe enviar ese token en cada request protegido:
```http
Authorization: Bearer <JWT_TOKEN>
```
4. Endpoints publicos sin token:
- `GET /health`
- `POST /api/login`

#### 8.5.2 Como valida permisos el backend
- Cada endpoint protegido usa `requireRequestScope(...)`.
- El scope se arma con:
  - rol real del usuario en BD (`superadmin`, `admin`, `standard`, `operator`, `manager`, `viewer`),
  - sucursales e instalaciones asignadas.
- Reglas operativas:
  - `superadmin`: acceso total.
  - `admin`: solo recursos en su alcance (sucursales/instalaciones asignadas).
  - `operator/viewer/standard/manager`: acceso de solo lectura o limitado por instalacion/asignaciones.

#### 8.5.3 Convenciones de requests
- `Content-Type: application/json`.
- IDs por path param (`/api/usuarios/:id`) o query (`sensorInstaladoId`).
- El backend acepta alias para compatibilidad frontend legacy, por ejemplo:
  - `correo` o `email`,
  - `sensorInstaladoId` o `id_sensor_instalado`,
  - `id_organizacion_sucursal`, `id_empresa_sucursal` o `id_organizacion`.
- Fechas/rangos: usar ISO-8601 (`2026-02-26T12:00:00Z`).

#### 8.5.4 Convenciones de responses
- Exito:
  - `200`: lecturas/consultas/actualizaciones.
  - `201`: creacion.
  - `204`: borrado sin body (ejemplo: `DELETE /api/usuarios/:id`).
- Error (formato uniforme):
```json
{ "error": "Mensaje de error" }
```
- Codigos mas comunes:
  - `400`: payload invalido, parametros faltantes o formato incorrecto.
  - `401`: token faltante/invalido/expirado o credenciales invalidas.
  - `403`: usuario inactivo o fuera de permisos de alcance.
  - `404`: recurso no encontrado.
  - `409`: conflicto de negocio (duplicados/asignaciones ya existentes).
  - `500`: error interno inesperado.

#### 8.5.5 Ejemplos rapidos (cURL)
Login:
```bash
curl -X POST http://localhost:3200/api/login \
  -H "Content-Type: application/json" \
  -d '{"correo":"admin@example.com","password":"TU_PASSWORD"}'
```

Listar usuarios (requiere token):
```bash
curl http://localhost:3200/api/usuarios \
  -H "Authorization: Bearer TU_JWT"
```

Lecturas de sensor instalado:
```bash
curl "http://localhost:3200/api/lecturas?sensorInstaladoId=1&from=2026-02-20T00:00:00Z&to=2026-02-26T23:59:59Z&limit=500" \
  -H "Authorization: Bearer TU_JWT"
```

Promedios por bucket (analitica):
```bash
curl "http://localhost:3200/api/promedios?sensorInstaladoId=1&bucketMinutes=15&from=2026-02-20T00:00:00Z&to=2026-02-26T23:59:59Z" \
  -H "Authorization: Bearer TU_JWT"
```

#### 8.5.6 Flujo end-to-end con frontend
- Si usas frontend Next.js, normalmente consume rutas proxy tipo `/external-api/*`.
- Ese proxy termina llamando al backend real en `/api/*`.
- Si en frontend ves `401 Token invalido` en `/external-api/...`, casi siempre el problema es:
  - token no enviado en `Authorization`,
  - token expirado,
  - `JWT_SECRET` diferente entre procesos/entornos.

## 9) WebSocket
Canales:
- Lecturas:
  - `ws://HOST:3200/ws/lecturas?sensorInstaladoId=<id>`
  - `ws://HOST:3200/ws/lecturas?instalacionId=<id>`
- Notificaciones:
  - `ws://HOST:3200/ws/notificaciones`

Payload tipico:
```json
{
  "type": "lectura.created",
  "data": {
    "id_lectura": 123,
    "sensor_instalado_id": 1,
    "instalacion_id": 5,
    "tipo_medida": "temperatura",
    "tomada_en": "2026-01-01T12:00:00.000Z",
    "valor": 23.5
  }
}
```

## 10) Roles y control de acceso
- `superadmin`:
  - acceso total de plataforma.
- `admin`:
  - gestion dentro de sucursales/instalaciones asignadas.
- `standard/operator/viewer/manager`:
  - acceso limitado al alcance asignado.

Implementacion:
- `requireRequestScope` resuelve usuario, rol y alcance.
- utilidades de autorizacion filtran por sucursal/instalacion.

## 11) Notificaciones (email/telegram)
Recuperacion de password:
- prioridad por email cuando SMTP esta configurado,
- fallback a Telegram si email no esta disponible.

Alertas operativas:
- al crear alerta se intenta envio a Telegram.
- si falla, se registra warning en logs sin romper la respuesta API.

## 12) Consideraciones de datos y consistencia
- Eliminacion de usuario:
  - primero elimina dependencias (`token_recuperacion`, `asignacion_usuario`),
  - luego elimina `usuario`.
- Esto evita errores por llaves foraneas y asegura consistencia.

## 13) Seguridad minima recomendada
- Cambiar `JWT_SECRET` por valor robusto en produccion.
- Restringir CORS a dominios autorizados.
- Usar HTTPS en produccion.
- No exponer `.env` en imagenes/public repos.
- Rotar credenciales de DB/Telegram periodicamente.

## 14) Observabilidad y logs
- Ver logs del contenedor:
```bash
docker logs -f aqua-backend
```
- En deploy, monitorear:
  - errores 401/403,
  - latencia de endpoints de lecturas/promedios,
  - reconexiones WS,
  - fallas de Telegram.

## 15) Troubleshooting detallado
### Error Prisma: URL invalida
- verificar `DATABASE_URL` y formato mysql.

### Error OpenSSL/libssl en contenedor
- usar imagen base compatible con binario Prisma.
- reconstruir imagen despues de actualizar dependencias.

### Telegram: `chat not found`
- validar `CHAT_ID` real.
- iniciar chat con el bot o agregar bot al grupo/canal.

### Telegram: `bots can't send messages to bots`
- el destino no puede ser un bot.
- usar usuario real, grupo o canal.

### 401 en login o APIs protegidas
- validar `JWT_SECRET` consistente.
- revisar expiracion de token.
- confirmar que usuario este activo.

## 16) Checklist de release
1. `npm run build`
2. Validar `.env` de produccion
3. Build imagen Docker
4. Push imagen (si aplica)
5. Deploy en Portainer
6. Verificar:
   - `GET /health`
   - `POST /api/login`
   - CRUD usuarios y permisos
   - WS lecturas/notificaciones
   - flujos de recuperacion email/telegram

## 17) Runbook de operacion diaria
1. Confirmar estado del contenedor.
2. Revisar logs de errores criticos.
3. Validar conectividad DB.
4. Verificar endpoints de salud y login.
5. Revisar entrega de alertas/notificaciones.
