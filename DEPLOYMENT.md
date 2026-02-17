# Deployment Docker - AQUA Backend

Este backend se despliega ahora con Docker (sin PM2).

## Requisitos de servidor

- Docker Engine 24+
- Docker Compose plugin (`docker compose`)
- Puerto API abierto (por defecto `3300/tcp`)

## 1) Configurar variables

```bash
cp .env.example .env
```

Edita mínimo:

- `JWT_SECRET`
- `DATABASE_URL`
- `PORT` (por defecto 3300)
- Variables de Telegram (si aplica)

Nota de `DATABASE_URL`:

- MySQL externo: usa IP/hostname real del servidor MySQL.
- MySQL en compose: usa host `mysql` (ver sección 3).

## 2) Despliegue estándar (backend + MySQL externo)

```bash
docker compose up -d --build
docker compose ps
docker compose logs -f aqua-backend
```

Comprobación:

```bash
curl http://localhost:3300/health
```

## 3) Despliegue con MySQL en contenedor

```bash
# opcional: definir en .env
# MYSQL_ROOT_PASSWORD, MYSQL_DATABASE, MYSQL_USER, MYSQL_PASSWORD

docker compose -f docker-compose.yml -f docker-compose.mysql.yml up -d --build
docker compose -f docker-compose.yml -f docker-compose.mysql.yml ps
docker compose -f docker-compose.yml -f docker-compose.mysql.yml logs -f aqua-backend
```

En este modo, `DATABASE_URL` queda resuelto automáticamente a `mysql:3306`.

## 4) Script de despliegue

```bash
# backend con base externa
./scripts/deploy-docker.sh

# backend + mysql local en compose
./scripts/deploy-docker.sh --with-mysql
```

## 5) Comandos de actualización

```bash
git pull
docker compose up -d --build
docker compose logs --tail=100 aqua-backend
```

Con MySQL local:

```bash
git pull
docker compose -f docker-compose.yml -f docker-compose.mysql.yml up -d --build
docker compose -f docker-compose.yml -f docker-compose.mysql.yml logs --tail=100 aqua-backend
```

## 6) Comandos de subida al servidor

### Opción A: usando Git en servidor

En servidor:

```bash
cd /opt/aqua-backend
git pull origin main
docker compose up -d --build
```

### Opción B: empaquetar y subir por `scp`

En tu máquina local:

```bash
cd /Users/keaf/Downloads/Universidad/Servicio
tar --exclude='backend/node_modules' --exclude='backend/dist' --exclude='backend/.git' -czf backend-deploy.tar.gz backend
scp backend-deploy.tar.gz usuario@TU_SERVIDOR:/opt/
```

En servidor:

```bash
cd /opt
rm -rf aqua-backend
mkdir -p aqua-backend
tar -xzf backend-deploy.tar.gz -C /opt
mv /opt/backend /opt/aqua-backend
cd /opt/aqua-backend
cp .env.example .env  # solo primera vez, luego conserva tu .env real
docker compose up -d --build
```

## 7) Operación diaria

```bash
docker compose ps
docker compose logs -f aqua-backend
docker compose restart aqua-backend
docker compose down
```

## 8) Troubleshooting rápido

### API no responde

```bash
docker compose logs --tail=200 aqua-backend
```

### Error conexión MySQL

Revisa `DATABASE_URL` en `.env` y conectividad de red desde contenedor.

### Puerto ocupado

Cambia `PORT` en `.env` y vuelve a levantar:

```bash
docker compose up -d --build
```
