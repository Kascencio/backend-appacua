# 🔧 Guía para Actualizar Dependencias en el Servidor

## Problema Detectado

El servidor está mostrando errores de incompatibilidad de versiones:
- `@fastify/jwt` espera Fastify 4.x pero tienes Fastify 5.6.1 instalado
- El `package.json` local está actualizado pero el servidor no

## Solución: Actualizar Dependencias en el Servidor

### Paso 1: Conectar al Servidor

```bash
ssh root@srv870201
# O usa tu método de conexión
```

### Paso 2: Detener el Proceso Actual

```bash
cd /root/backend-appacua
pm2 stop aqua-backend
# O si el proceso tiene otro nombre:
pm2 stop all
```

### Paso 3: Verificar el Estado

```bash
pm2 status
```

### Paso 4: Actualizar package.json en el Servidor

Tienes dos opciones:

#### Opción A: Copiar desde tu máquina local (Recomendado)

En tu máquina local:

```bash
# Desde el directorio del proyecto
scp package.json root@srv870201:/root/backend-appacua/
```

#### Opción B: Editar directamente en el servidor

```bash
cd /root/backend-appacua
nano package.json
```

Actualiza las siguientes líneas:

```json
{
  "dependencies": {
    "@fastify/cors": "^11.1.0",
    "@fastify/helmet": "^13.0.2",
    "@fastify/jwt": "^10.0.0",
    "@fastify/rate-limit": "^10.3.0",
    "@fastify/websocket": "^11.2.0",
    "fastify": "^5.6.1",
    ...
  }
}
```

### Paso 5: Eliminar node_modules y package-lock.json

```bash
cd /root/backend-appacua
rm -rf node_modules package-lock.json
```

### Paso 6: Instalar Dependencias Actualizadas

```bash
npm install
```

Esto instalará todas las versiones correctas compatibles con Fastify 5.x.

### Paso 7: Regenerar Cliente Prisma

```bash
npx prisma generate
```

### Paso 8: Recompilar el Proyecto

```bash
npm run build
```

### Paso 9: Verificar el Puerto

Antes de iniciar, verifica que el puerto esté libre o configurado correctamente:

```bash
# Verificar qué proceso usa el puerto 3300
sudo lsof -i :3300
# O
sudo netstat -tulpn | grep 3300

# Si hay un proceso, detenerlo:
# sudo kill -9 <PID>
```

### Paso 10: Iniciar el Servidor con PM2

```bash
# Si ya tienes una configuración PM2:
pm2 start scripts/pm2.config.js --env production

# O si necesitas iniciar manualmente:
pm2 start dist/index.js --name aqua-backend --env production
```

### Paso 11: Verificar que Funcione

```bash
# Ver logs
pm2 logs aqua-backend

# Verificar estado
pm2 status

# Verificar que el servidor responda
curl http://localhost:3300/health
```

### Paso 12: Guardar Configuración PM2

```bash
pm2 save
```

---

## Verificación Final

### Verificar Versiones Instaladas

```bash
cd /root/backend-appacua
npm list fastify @fastify/jwt @fastify/websocket
```

Deberías ver:
- `fastify@5.6.1`
- `@fastify/jwt@10.x.x`
- `@fastify/websocket@11.x.x`

### Verificar que el Servidor Funcione

```bash
# Health check
curl http://localhost:3300/health

# Debería responder:
# {"status":"ok","time":"2025-11-05T..."}
```

### Verificar Logs

```bash
pm2 logs aqua-backend --lines 50
```

No deberías ver errores de `FST_ERR_PLUGIN_VERSION_MISMATCH`.

---

## Problema del Puerto 3000 en Uso

Si ves el error `EADDRINUSE: address already in use 0.0.0.0:3000`:

### Solución 1: Cambiar el Puerto en .env

```bash
cd /root/backend-appacua
nano .env
```

Cambia:
```
PORT=3300
```

Luego reinicia:
```bash
pm2 restart aqua-backend
```

### Solución 2: Matar el Proceso que Usa el Puerto

```bash
# Encontrar el proceso
sudo lsof -i :3000

# Matar el proceso (reemplaza <PID> con el número real)
sudo kill -9 <PID>

# O usar fuser
sudo fuser -k 3300/tcp
```

---

## Resumen de Versiones Actualizadas

| Paquete | Versión Anterior | Versión Actual |
|---------|------------------|----------------|
| `fastify` | ^4.27.0 | ^5.6.1 |
| `@fastify/jwt` | ^8.0.1 | ^10.0.0 |
| `@fastify/websocket` | ^8.3.0 | ^11.2.0 |
| `@fastify/rate-limit` | ^10.0.0 | ^10.3.0 |

---

## Troubleshooting

### Error: "Cannot find module"

```bash
# Reinstalar dependencias
rm -rf node_modules package-lock.json
npm install
npm run build
```

### Error: "Prisma Client not generated"

```bash
npx prisma generate
npm run build
```

### Error: "Port already in use"

Ver la sección "Problema del Puerto 3000 en Uso" arriba.

### El servidor sigue sin funcionar

```bash
# Ver logs detallados
pm2 logs aqua-backend --lines 100

# Reiniciar PM2 completamente
pm2 kill
pm2 resurrect
pm2 start scripts/pm2.config.js --env production
```

---

## Notas Importantes

1. **Backup**: Antes de actualizar, haz un backup de `package.json` y `node_modules`:
   ```bash
   cp package.json package.json.backup
   tar -czf node_modules_backup.tar.gz node_modules
   ```

2. **Tiempo de Inactividad**: El servidor estará inactivo durante la actualización. Planifica el mantenimiento en horarios de baja demanda.

3. **Verificación**: Después de actualizar, prueba todos los endpoints principales para asegurar que todo funciona correctamente.

---

## Script de Actualización Automática

Puedes crear un script `update-dependencies.sh`:

```bash
#!/bin/bash
set -e

echo "Deteniendo servidor..."
pm2 stop aqua-backend

echo "Eliminando dependencias antiguas..."
rm -rf node_modules package-lock.json

echo "Instalando dependencias actualizadas..."
npm install

echo "Regenerando Prisma..."
npx prisma generate

echo "Compilando proyecto..."
npm run build

echo "Iniciando servidor..."
pm2 start scripts/pm2.config.js --env production

echo "Guardando configuración PM2..."
pm2 save

echo "Verificando estado..."
pm2 status
curl http://localhost:3300/health

echo "✅ Actualización completada!"
```

Dar permisos de ejecución:
```bash
chmod +x update-dependencies.sh
./update-dependencies.sh
```

---

**Última actualización:** 2025-11-05

