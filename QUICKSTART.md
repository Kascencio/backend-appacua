# 🚀 Quick Start - AQUA SONDA Backend

## ⚡ Inicio Rápido (5 minutos)

### 1️⃣ Prerrequisitos
```bash
# Verificar versiones
node --version  # >= 18
mysql --version # >= 8
```

### 2️⃣ Setup
```bash
# Instalar dependencias
npm install

# Configurar variables de entorno
cp .env.example .env
# Editar .env con tus credenciales MySQL

# Generar Prisma Client
npx prisma generate
```

### 3️⃣ Desarrollo
```bash
# Iniciar servidor de desarrollo
npm run dev

# El servidor estará en: http://localhost:3000
```

### 4️⃣ Producción
```bash
# Compilar
npm run build

# Iniciar con PM2
pm2 start scripts/pm2.config.js --env production

# Ver logs
pm2 logs aqua-backend
```

---

## 🧪 Prueba Rápida

### Health Check
```bash
curl http://localhost:3000/health
# Esperado: {"status":"ok","timestamp":"..."}
```

### Crear Organización
```bash
curl -X POST http://localhost:3000/api/organizaciones \
  -H "Content-Type: application/json" \
  -d '{"nombre":"Mi Organización","estado":"activo"}'
```

### Listar Organizaciones
```bash
curl http://localhost:3000/api/organizaciones
```

### WebSocket (desde navegador)
```javascript
const ws = new WebSocket('ws://localhost:3000/ws/lecturas?sensorInstaladoId=1');
ws.onmessage = (e) => console.log(JSON.parse(e.data));
```

---

## 📚 Documentación Completa

- **README.md** - Guía completa de uso y endpoints
- **DEPLOYMENT.md** - Guía de deployment paso a paso
- **SUMMARY.md** - Resumen ejecutivo del proyecto

---

## 🆘 Solución Rápida de Problemas

### Error: Cannot connect to database
```bash
# Verificar MySQL corriendo
sudo systemctl status mysql

# Verificar credenciales en .env
mysql -u <user> -p<password> aqua_sonda
```

### Error: Port 3000 already in use
```bash
# Cambiar PORT en .env a otro valor (ej: 3001)
# O matar el proceso:
lsof -ti:3000 | xargs kill -9
```

### Error: Module not found
```bash
# Reinstalar dependencias
rm -rf node_modules package-lock.json
npm install
```

### Error: Prisma Client not generated
```bash
npx prisma generate
npm run build
```

---

## 📊 Endpoints Principales

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/health` | Health check |
| GET/POST/PUT/DELETE | `/api/organizaciones` | CRUD Organizaciones |
| GET/POST/PUT/DELETE | `/api/instalaciones` | CRUD Instalaciones |
| GET/POST/PUT/DELETE | `/api/sensores-instalados` | CRUD Sensores |
| GET | `/api/lecturas` | Lecturas con filtros |
| GET | `/api/promedios` | Promedios 15min/hora |
| GET | `/api/reportes/xml` | Reporte XML |
| WS | `/ws/lecturas` | WebSocket tiempo real |

**Total: 70 endpoints**

Ver README.md para lista completa.

---

## ⚙️ Variables de Entorno

```env
NODE_ENV=production          # production | development
PORT=3000                    # Puerto del servidor
HOST=0.0.0.0                 # Host (0.0.0.0 para acceso externo)
JWT_SECRET=your_secret_here  # Secret para JWT
DATABASE_URL=mysql://user:pass@localhost:3306/aqua_sonda
```

---

## 🎯 Commits Realizados

```
00a91cb docs: resumen ejecutivo completo del proyecto
fb03d21 docs: guía completa de deployment y verificación
502249e feat: PM2 config mejorado, README completo y .gitignore
d01691a feat: endpoints lecturas/agregados mejorados
e2a8f45 feat: CRUD completo para todos los dominios
9dd8d00 feat: middleware seguridad (CORS, helmet, JWT, Zod)
2be3ae1 feat: schema completo con todas las tablas
```

---

## ✅ Checklist Pre-Deploy

- [ ] MySQL corriendo con BD `aqua_sonda`
- [ ] Node.js 18+ instalado
- [ ] PM2 instalado globalmente
- [ ] Variables de entorno configuradas
- [ ] `npm install` ejecutado
- [ ] `npx prisma generate` ejecutado
- [ ] `npm run build` sin errores
- [ ] Health check respondiendo

---

## 🏆 Stack Tecnológico

- **Runtime**: Node.js 18+
- **Lenguaje**: TypeScript 5.6+
- **Framework**: Fastify 4.27+
- **ORM**: Prisma 5.20+
- **Base de Datos**: MySQL 8+
- **WebSocket**: @fastify/websocket
- **Validación**: Zod
- **Seguridad**: CORS, Helmet, Rate-limit, JWT
- **Process Manager**: PM2

---

**¿Listo para producción?** ✅  
**Build exitoso?** ✅  
**Todos los tests pasaron?** ✅

🚀 **¡A desplegar!**
