# 🎯 DEPLOYMENT GUIDE - AQUA SONDA Backend

## ✅ Estado del Proyecto

**Backend completado** con todas las funcionalidades solicitadas:

- ✅ Schema Prisma completo (20+ tablas)
- ✅ 35+ endpoints CRUD REST
- ✅ Endpoints de lecturas con filtros
- ✅ Agregados 15min/hora
- ✅ WebSocket tiempo real
- ✅ Reporte XML
- ✅ Seguridad (CORS, Helmet, Rate-limit, JWT)
- ✅ Validaciones Zod
- ✅ PM2 configurado

## 📦 Commits Realizados

```bash
git log --oneline
502249e feat: PM2 config mejorado, README completo y .gitignore
d01691a feat: endpoints lecturas/agregados mejorados con validaciones y manejo de errores
e2a8f45 feat: CRUD completo para todos los dominios (org, instalaciones, usuarios, especies, procesos)
c8a1b2d feat: middleware seguridad (CORS, helmet, JWT, validators Zod)
2be3ae1 feat: schema completo con todas las tablas (usuarios, especies, procesos, ubicación)
```

## 🚀 Deployment Steps

### 1. Pre-requisitos en Servidor

```bash
# Asegurar Node.js 18+
node --version

# Instalar PM2 globalmente
npm install -g pm2

# Verificar MySQL corriendo
mysql -u root -p -e "SHOW DATABASES LIKE 'aqua_sonda';"
```

### 2. Clonar y Setup

```bash
# Clonar repositorio
git clone <tu-repo-url> aqua-backend
cd aqua-backend

# Instalar dependencias
npm ci --production

# Configurar .env
cp .env.example .env
nano .env  # Editar credenciales MySQL

# Generar cliente Prisma
npx prisma generate

# Build
npm run build
```

### 3. Iniciar con PM2

```bash
# Crear directorio de logs
mkdir -p logs

# Primera ejecución
pm2 start scripts/pm2.config.js --env production

# Guardar configuración PM2
pm2 save

# Auto-start al reiniciar servidor
pm2 startup
# Ejecutar el comando que PM2 sugiera

# Verificar
pm2 status
pm2 logs aqua-backend
```

### 4. Monitoreo

```bash
# Ver logs en tiempo real
pm2 logs aqua-backend

# Monitorear recursos
pm2 monit

# Información detallada
pm2 info aqua-backend

# Ver métricas
pm2 describe aqua-backend
```

### 5. Mantenimiento

```bash
# Reiniciar
pm2 restart aqua-backend

# Recargar sin downtime
pm2 reload aqua-backend

# Detener
pm2 stop aqua-backend

# Eliminar proceso
pm2 delete aqua-backend

# Limpiar logs
pm2 flush aqua-backend
```

## 🔍 Verificación Post-Deployment

### Health Check
```bash
curl http://localhost:3000/health
# Esperado: {"status":"ok","timestamp":"..."}
```

### Test CRUD
```bash
# Crear organización
curl -X POST http://localhost:3000/api/organizaciones \
  -H "Content-Type: application/json" \
  -d '{"nombre":"Test Org","estado":"activo"}'

# Listar organizaciones
curl http://localhost:3000/api/organizaciones
```

### Test WebSocket
```javascript
// Conectar con wscat o navegador
const ws = new WebSocket('ws://localhost:3000/ws/lecturas?sensorInstaladoId=1');
ws.onmessage = (e) => console.log(JSON.parse(e.data));
```

### Test Lecturas
```bash
# Obtener lecturas
curl "http://localhost:3000/api/lecturas?sensorInstaladoId=1&limit=10"

# Promedios 15min
curl "http://localhost:3000/api/promedios?granularity=15min&sensorInstaladoId=1"

# Reporte XML
curl "http://localhost:3000/api/reportes/xml?sensorInstaladoId=1" > reporte.xml
```

## 🛡️ Seguridad en Producción

### Variables de Entorno
```env
NODE_ENV=production
PORT=3000
HOST=0.0.0.0
JWT_SECRET=<generar-secreto-fuerte>  # openssl rand -base64 32
DATABASE_URL="mysql://user:pass@localhost:3306/aqua_sonda"
```

### CORS (src/index.ts)
```typescript
// Actualizar para producción:
await app.register(cors, {
  origin: ['https://tu-dominio.com'],  // Dominios permitidos
  credentials: true
});
```

### Rate Limit
Ya configurado: 300 req/min por IP

### JWT
Para proteger rutas, agregar en routes:
```typescript
import { authenticateJWT } from '../middlewares/auth.middleware.js';

app.post('/api/usuarios', {
  preHandler: [authenticateJWT]
}, createUsuario);
```

## 🐳 Docker (Opcional)

Si necesitas Dockerizar:

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --production

COPY prisma ./prisma
RUN npx prisma generate

COPY dist ./dist
COPY scripts ./scripts

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "dist/index.js"]
```

## 📊 Endpoints Disponibles

### CRUD (35+ endpoints)
- Organizaciones, Sucursales, Instalaciones
- Catálogo Sensores, Sensores Instalados
- Usuarios, Tipos Rol, Alertas, Parámetros
- Especies, Especies Instaladas, Especie Parámetro
- Procesos

### Lecturas & Reportes
- `GET /api/lecturas` - Lecturas con filtros
- `GET /api/resumen-horario` - Resumen por hora
- `GET /api/promedios` - Promedios 15min/hora
- `GET /api/reportes/xml` - Reporte XML

### WebSocket
- `ws://host/ws/lecturas?sensorInstaladoId=X`
- `ws://host/ws/lecturas?instalacionId=Y`

## 🔧 Troubleshooting

### Error: Cannot connect to MySQL
```bash
# Verificar MySQL corriendo
systemctl status mysql

# Verificar credenciales en .env
mysql -u <user> -p<password> -h localhost aqua_sonda

# Ver logs
pm2 logs aqua-backend
```

### Error: Port 3000 already in use
```bash
# Cambiar PORT en .env
# O matar proceso
lsof -ti:3000 | xargs kill -9
```

### Error: Prisma Client not generated
```bash
npx prisma generate
npm run build
pm2 restart aqua-backend
```

### WebSocket no conecta
```bash
# Verificar firewall
sudo ufw allow 3000

# Verificar que el puerto está escuchando
netstat -tulpn | grep 3000
```

## 📝 Notas Importantes

1. **No hay migraciones** - Prisma solo como cliente
2. MySQL debe tener BD `aqua_sonda` ya creada
3. Triggers para agregados deben existir en MySQL
4. WebSocket usa poller incremental (750ms)
5. Límite de lecturas: 5000 por query

## 📞 Soporte

Ver logs detallados:
```bash
pm2 logs aqua-backend --lines 100
```

Revisar archivo de logs:
```bash
tail -f logs/out.log
tail -f logs/err.log
```

## ✨ Siguiente Fase (Opcional)

- [ ] Autenticación completa (login, register)
- [ ] Permisos por rol
- [ ] Tests unitarios
- [ ] CI/CD pipeline
- [ ] Documentación Swagger/OpenAPI
- [ ] Métricas con Prometheus
- [ ] Dashboard de monitoreo
