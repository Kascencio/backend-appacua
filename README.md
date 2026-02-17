# AQUA Backend (Fastify + Prisma)

Backend API para monitoreo acuícola con Fastify, Prisma y MySQL.

## Stack

- Fastify 5
- Prisma 5 + MySQL
- WebSocket (`/ws/lecturas`) con poller incremental
- Validaciones con Zod

## Requisitos

- Node.js 18+
- MySQL 8+
- Base de datos existente (`aqua_sonda`)

## Configuración

```bash
cp .env.example .env
# editar variables
npm ci
npm run prisma:generate
```

Variables esperadas:

```env
NODE_ENV=production
PORT=3300
HOST=0.0.0.0
JWT_SECRET=change_me
DATABASE_URL="mysql://user:password@localhost:3306/aqua_sonda"
```

## Ejecución

Desarrollo:

```bash
npm run dev
```

Producción local:

```bash
npm run build
npm start
```

Producción con Docker (recomendado):

```bash
cp .env.example .env
# editar DATABASE_URL, JWT_SECRET y demás variables

docker compose up -d --build

# verificar
docker compose ps
docker compose logs -f aqua-backend
```

Producción con Docker + MySQL en contenedores:

```bash
cp .env.example .env
# opcional: setear MYSQL_ROOT_PASSWORD, MYSQL_DATABASE, MYSQL_USER, MYSQL_PASSWORD

docker compose -f docker-compose.yml -f docker-compose.mysql.yml up -d --build
docker compose -f docker-compose.yml -f docker-compose.mysql.yml ps
```

Script de despliegue:

```bash
# solo backend (MySQL externo)
./scripts/deploy-docker.sh

# backend + mysql
./scripts/deploy-docker.sh --with-mysql
```

## Endpoints principales

Salud:

- `GET /health`

Lecturas:

- `GET /api/lecturas?sensorInstaladoId=&from=&to=&limit=`
- `GET /api/resumen-horario?sensorInstaladoId=&from=&to=`
- `GET /api/promedios?granularity=15min|hour&sensorInstaladoId=&from=&to=`
- `GET /api/reportes/xml?sensorInstaladoId=&from=&to=`

CRUD:

- `organizaciones`: `/api/organizaciones`
- `sucursales`: `/api/sucursales`
- `instalaciones`: `/api/instalaciones`
- `catalogo-sensores`: `/api/catalogo-sensores`
- `sensores-instalados`: `/api/sensores-instalados`
- `usuarios`: `/api/usuarios`
- `tipos-rol`: `/api/tipos-rol`
- `roles` (alias frontend): `/api/roles`
- `alertas`: `/api/alertas`
- `parametros`: `/api/parametros`
- `catalogo-especies`: `/api/catalogo-especies`
- `especies-parametros`: `/api/especies-parametros`
- `especie-parametros` (alias frontend): `/api/especie-parametros`
- `procesos`: `/api/procesos`
- `asignacion-usuario`: `/api/asignacion-usuario`

WebSocket:

- `ws://<host>:3300/ws/lecturas?sensorInstaladoId=1`
- `ws://<host>:3300/ws/lecturas?instalacionId=5`
- `ws://<host>:3300/ws/notificaciones`

Evento emitido:

```json
{
  "type": "lectura.created",
  "data": {
    "id_lectura": 123,
    "sensor_instalado_id": 1,
    "instalacion_id": 5,
    "tipo_medida": "temperatura",
    "tomada_en": "2026-02-11T18:00:00.000Z",
    "valor": 23.5
  }
}
```
