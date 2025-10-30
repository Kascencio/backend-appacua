# Backend AQUA — v2 (CRUD + WS Lecturas)

Alineado a la BD **aqua_sonda** sin `empresa_sucursal` (usa `organizacion` y `organizacion_sucursal`).
- Solo **APIs CRUD**
- **WebSocket** exclusivo para nuevos INSERTS en `lectura` (`/ws/lecturas`)
- Despliegue pensado para **PM2** (MySQL corre en Docker vía Portainer)

## Quickstart
1. Copia `.env.example` a `.env` y ajusta credenciales.
2. `npm ci`
3. `npx prisma generate`
4. `npm run build`
5. `pm2 start scripts/pm2.config.js --name aqua-backend && pm2 save`

## Endpoints
- `GET /health`
- `GET /api/lecturas?sensorInstaladoId=&from=&to=&limit=`
- `GET /api/resumen-horario?sensorInstaladoId=&from=&to=`
- `GET /api/promedios?granularity=15min|hour&sensorInstaladoId=&from=&to=`
- `GET /api/reportes/xml?sensorInstaladoId=&from=&to=`

## WebSocket
- Ruta: `/ws/lecturas?sensorInstaladoId=123&instalacionId=45`
- Evento emitido por nuevo insert: `type=lectura.created`

## Notas
- Prisma **solo generate** (no migraciones). Vistas se consultan con `$queryRaw` si aplica.
