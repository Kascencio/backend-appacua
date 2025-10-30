# AQUA SONDA Backend# Backend AQUA — v2 (CRUD + WS Lecturas)



Backend mínimo funcional con **Fastify** + **Prisma** + **MySQL** para monitoreo de sensores acuáticos.Alineado a la BD **aqua_sonda** sin `empresa_sucursal` (usa `organizacion` y `organizacion_sucursal`).

- Solo **APIs CRUD**

## 🚀 Características- **WebSocket** exclusivo para nuevos INSERTS en `lectura` (`/ws/lecturas`)

- Despliegue pensado para **PM2** (MySQL corre en Docker vía Portainer)

- ✅ **CRUD completo** para todos los dominios (organizaciones, instalaciones, usuarios, especies, procesos)

- ✅ **Endpoints de lecturas** con filtros y paginación## Quickstart

- ✅ **Agregados** (15min / hora) con granularidad configurable1. Copia `.env.example` a `.env` y ajusta credenciales.

- ✅ **WebSocket** en tiempo real (`/ws/lecturas`) con poller incremental (750ms)2. `npm ci`

- ✅ **Reporte XML** generado a demanda3. `npx prisma generate`

- ✅ **Seguridad**: CORS, Helmet, Rate-limit, JWT4. `npm run build`

- ✅ **Validaciones** con Zod5. `pm2 start scripts/pm2.config.js --name aqua-backend && pm2 save`

- ✅ **Despliegue** con PM2

## Endpoints

## 📋 Requisitos- `GET /health`

- `GET /api/lecturas?sensorInstaladoId=&from=&to=&limit=`

- Node.js 18+- `GET /api/resumen-horario?sensorInstaladoId=&from=&to=`

- MySQL 8+ (debe existir la BD `aqua_sonda`)- `GET /api/promedios?granularity=15min|hour&sensorInstaladoId=&from=&to=`

- PM2 (para producción)- `GET /api/reportes/xml?sensorInstaladoId=&from=&to=`



## 🛠️ Instalación## WebSocket

- Ruta: `/ws/lecturas?sensorInstaladoId=123&instalacionId=45`

```bash- Evento emitido por nuevo insert: `type=lectura.created`

# Instalar dependencias

npm install## Notas

- Prisma **solo generate** (no migraciones). Vistas se consultan con `$queryRaw` si aplica.

# Configurar variables de entorno
cp .env.example .env
# Editar .env con tus credenciales MySQL

# Generar cliente Prisma
npm run prisma:generate

# Build para producción
npm run build
```

## 🎯 Endpoints Principales

### CRUD
- **Organizaciones**: `/api/organizaciones`
- **Sucursales**: `/api/sucursales`
- **Instalaciones**: `/api/instalaciones`
- **Catálogo Sensores**: `/api/catalogo-sensores`
- **Sensores Instalados**: `/api/sensores-instalados`
- **Usuarios**: `/api/usuarios`
- **Tipos Rol**: `/api/tipos-rol`
- **Alertas**: `/api/alertas`
- **Parámetros**: `/api/parametros`
- **Catálogo Especies**: `/api/catalogo-especies`
- **Especies Instaladas**: `/api/especies-instaladas`
- **Especie Parámetro**: `/api/especies-parametros`
- **Procesos**: `/api/procesos`

### Lecturas & Agregados
```bash
# Lecturas (con filtros)
GET /api/lecturas?sensorInstaladoId=1&from=2024-01-01T00:00:00Z&to=2024-01-31T23:59:59Z&limit=1000

# Resumen horario
GET /api/resumen-horario?sensorInstaladoId=1&from=2024-01-01T00:00:00Z

# Promedios (15min o hour)
GET /api/promedios?granularity=15min&sensorInstaladoId=1&from=2024-01-01T00:00:00Z

# Reporte XML
GET /api/reportes/xml?sensorInstaladoId=1&from=2024-01-01T00:00:00Z&to=2024-01-31T23:59:59Z
```

### WebSocket
```javascript
// Conectar (filtrar por sensor o instalación)
ws://localhost:3000/ws/lecturas?sensorInstaladoId=1
ws://localhost:3000/ws/lecturas?instalacionId=5

// Eventos recibidos:
{
  "type": "lectura.created",
  "data": {
    "id_lectura": 12345,
    "sensor_instalado_id": 1,
    "instalacion_id": 5,
    "tipo_medida": "temperatura",
    "tomada_en": "2024-01-15T10:30:00.000Z",
    "valor": 23.5
  }
}
```

## 🏃 Ejecución

### Desarrollo
```bash
npm run dev
```

### Producción (PM2)
```bash
# Primera vez
npm run build
pm2 start scripts/pm2.config.js --env production

# Ver logs
pm2 logs aqua-backend

# Monitorear
pm2 monit

# Reiniciar
pm2 restart aqua-backend

# Detener
pm2 stop aqua-backend
```

## 📁 Estructura del Proyecto

```
backend/
├── prisma/
│   └── schema.prisma          # Schema completo (solo generate)
├── src/
│   ├── config/
│   │   └── index.ts           # Configuración (env vars)
│   ├── controllers/           # Lógica de negocio
│   ├── middlewares/           # JWT, autenticación
│   ├── repositories/
│   │   └── prisma.ts          # Cliente Prisma
│   ├── routes/                # Definición de rutas
│   ├── services/
│   │   ├── ws.lecturas.server.ts  # WebSocket server
│   │   └── lecturas.poller.ts     # Poller incremental
│   ├── utils/
│   │   ├── validators.ts      # Schemas Zod
│   │   └── xml.helper.ts      # Generador XML
│   └── index.ts               # Entry point
├── scripts/
│   └── pm2.config.js          # Configuración PM2
├── .env                       # Variables de entorno
├── package.json
└── tsconfig.json
```

## 🔒 Seguridad

- **CORS**: Configurado (ajustar en producción)
- **Helmet**: Headers de seguridad HTTP
- **Rate Limit**: 300 req/min por IP
- **JWT**: Para rutas sensibles (agregar `preHandler: [authenticateJWT]`)

## 📝 Variables de Entorno

```env
NODE_ENV=production
PORT=3000
HOST=0.0.0.0
JWT_SECRET=your_secure_secret_here
DATABASE_URL="mysql://user:password@localhost:3306/aqua_sonda"
```

## 🐳 Base de Datos

- **No hay migraciones** - Prisma solo como cliente
- MySQL debe tener la BD `aqua_sonda` ya creada
- Los triggers para agregados deben existir en MySQL

## 📊 Health Check

```bash
GET /health
```

Respuesta:
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

## 🤝 Contribuir

1. Commits atómicos y descriptivos
2. Seguir convención: `feat:`, `fix:`, `refactor:`, `docs:`
3. Validar con TypeScript antes de commit

## 📄 Licencia

Privado - Universidad
