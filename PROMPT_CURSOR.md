# Prompt — Backend AQUA v2 (CRUD + WS Lecturas)

Contexto:
- Backend Node.js + TypeScript con Fastify.
- BD MySQL `aqua_sonda` SIN `empresa_sucursal`; reemplazo completo por `organizacion` y `organizacion_sucursal`.
- El backend corre con PM2 en el VPS; MySQL vive en Docker vía Portainer.

Objetivos:
- Exponer CRUD por dominio (organizacion, organizacion_sucursal, instalacion, catalogo_sensores, sensor_instalado, usuario/tipo_rol, alertas, parametros, especies, especie_parametro, procesos).
- WebSocket único `/ws/lecturas` que detecte **nuevos inserts** en `lectura` y emita `lectura.created`.
- Endpoints de consulta: lecturas crudas, `resumen_lectura_horaria`, `promedio_15min` y reporte XML.

Reglas:
1) NO modificar esquema ni crear migraciones; usar Prisma únicamente para `generate`.
2) Validar payloads y queries con Zod. Autenticación con JWT en endpoints sensibles + rate-limit global.
3) WS: mantener `lastSeenId` y consultar incrementales: `SELECT ... FROM lectura WHERE id_lectura > ? ORDER BY id_lectura ASC LIMIT 1000` con JOIN a `sensor_instalado` y `catalogo_sensores`.
4) Para vistas (`lectura_v4`, `promedio_v4`, etc.) usar `prisma.$queryRaw` sólo lectura si se necesitan.

Endpoints mínimos:
- GET /health
- GET /api/lecturas
- GET /api/resumen-horario
- GET /api/promedios?granularity=15min|hour
- GET /api/reportes/xml

Pruebas mínimas:
- Conectar a `/ws/lecturas` y al insertar una fila en `lectura` emitir evento `lectura.created` (filtrar por querystring).
