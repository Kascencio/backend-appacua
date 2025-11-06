#!/bin/bash
# Script de instalación para Debian/Ubuntu - AQUA SONDA Backend
# Este script instala todas las dependencias necesarias y configura el proyecto

set -e

echo "=========================================="
echo "AQUA SONDA Backend - Instalación Debian/Ubuntu"
echo "=========================================="

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Función para verificar si un comando existe
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Verificar que el script se ejecute como root para ciertas operaciones
check_sudo() {
    if [ "$EUID" -ne 0 ]; then 
        echo -e "${YELLOW}Algunos comandos requieren permisos de sudo${NC}"
    fi
}

# 1. Actualizar sistema
echo -e "${GREEN}[1/8] Actualizando sistema...${NC}"
sudo apt-get update -qq

# 2. Instalar Node.js 18+ (usando NodeSource)
echo -e "${GREEN}[2/8] Instalando Node.js...${NC}"
if ! command_exists node; then
    echo "Instalando Node.js desde NodeSource..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
else
    NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -lt 18 ]; then
        echo -e "${YELLOW}Node.js versión $NODE_VERSION detectada. Se requiere 18 o superior.${NC}"
        echo "Instalando Node.js 20..."
        curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
        sudo apt-get install -y nodejs
    else
        echo -e "${GREEN}Node.js $(node -v) ya está instalado${NC}"
    fi
fi

# Verificar instalación
node --version
npm --version

# 3. Instalar MySQL (si no está instalado)
echo -e "${GREEN}[3/8] Verificando MySQL...${NC}"
if ! command_exists mysql; then
    echo -e "${YELLOW}MySQL no está instalado.${NC}"
    echo "Para instalar MySQL, ejecuta:"
    echo "  sudo apt-get install -y mysql-server"
    echo "  sudo mysql_secure_installation"
    echo ""
    echo "O si usas Docker:"
    echo "  docker run --name mysql-aqua -e MYSQL_ROOT_PASSWORD=password -e MYSQL_DATABASE=aqua_sonda -p 3306:3306 -d mysql:8.0"
else
    echo -e "${GREEN}MySQL está instalado${NC}"
    mysql --version
fi

# 4. Instalar PM2 globalmente
echo -e "${GREEN}[4/8] Instalando PM2...${NC}"
if ! command_exists pm2; then
    sudo npm install -g pm2
    echo -e "${GREEN}PM2 instalado${NC}"
else
    echo -e "${GREEN}PM2 ya está instalado${NC}"
    pm2 --version
fi

# 5. Instalar dependencias del proyecto
echo -e "${GREEN}[5/8] Instalando dependencias del proyecto...${NC}"
if [ -f "package.json" ]; then
    npm ci
    echo -e "${GREEN}Dependencias instaladas${NC}"
else
    echo -e "${RED}Error: package.json no encontrado. Asegúrate de estar en el directorio del proyecto.${NC}"
    exit 1
fi

# 6. Crear directorio de logs
echo -e "${GREEN}[6/8] Creando directorio de logs...${NC}"
mkdir -p logs
chmod 755 logs

# 7. Configurar .env
echo -e "${GREEN}[7/8] Configurando variables de entorno...${NC}"
if [ ! -f ".env" ]; then
    if [ -f ".env.example" ]; then
        cp .env.example .env
        echo -e "${YELLOW}Archivo .env creado desde .env.example${NC}"
        echo -e "${YELLOW}IMPORTANTE: Edita .env con tus credenciales de MySQL${NC}"
    else
        echo -e "${YELLOW}Creando .env básico...${NC}"
        cat > .env << EOF
NODE_ENV=production
PORT=3300
HOST=0.0.0.0
JWT_SECRET=$(openssl rand -base64 32)
DATABASE_URL="mysql://usuario:password@localhost:3306/aqua_sonda"
EOF
        echo -e "${YELLOW}Archivo .env creado. EDITA LAS CREDENCIALES DE MYSQL${NC}"
    fi
else
    echo -e "${GREEN}Archivo .env ya existe${NC}"
fi

# 8. Generar cliente Prisma y compilar
echo -e "${GREEN}[8/8] Generando cliente Prisma y compilando...${NC}"
npx prisma generate
npm run build

echo ""
echo -e "${GREEN}=========================================="
echo "Instalación completada exitosamente!"
echo "==========================================${NC}"
echo ""
echo "Próximos pasos:"
echo "1. Edita el archivo .env con tus credenciales de MySQL"
echo "2. Asegúrate de que la base de datos 'aqua_sonda' existe"
echo "3. Inicia el servidor con: pm2 start scripts/pm2.config.js --env production"
echo "4. Guarda la configuración PM2: pm2 save"
echo "5. Configura auto-start: pm2 startup"
echo ""
echo "Para verificar que todo funciona:"
echo "  pm2 logs aqua-backend"
echo "  curl http://localhost:3300/health"
echo ""

