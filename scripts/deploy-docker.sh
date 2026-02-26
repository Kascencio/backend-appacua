#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

COMPOSE_FILES=(-f docker-compose.yml)
IMAGE_NAME="${DOCKER_IMAGE:-backned:latest}"
NETWORK_NAME="${DOCKER_NETWORK:-aqua-backend-network}"

if [[ "${1:-}" == "--with-mysql" ]]; then
  COMPOSE_FILES+=(-f docker-compose.mysql.yml)
fi

echo "[1/5] Ensuring network exists: ${NETWORK_NAME}"
if docker network inspect "${NETWORK_NAME}" >/dev/null 2>&1; then
  echo "Network already exists. Using ${NETWORK_NAME}."
else
  docker network create "${NETWORK_NAME}" >/dev/null
  echo "Network created: ${NETWORK_NAME}."
fi

BUILD_ARGS=()
echo "[2/5] Ensuring image exists: ${IMAGE_NAME}"
if docker image inspect "${IMAGE_NAME}" >/dev/null 2>&1; then
  echo "Image already exists. Using ${IMAGE_NAME}."
else
  echo "Image not found. Building ${IMAGE_NAME}..."
  BUILD_ARGS+=(--build)
fi

echo "[3/5] Starting containers..."
docker compose "${COMPOSE_FILES[@]}" up -d --remove-orphans "${BUILD_ARGS[@]}"

echo "[4/5] Running health check..."
sleep 3
docker compose "${COMPOSE_FILES[@]}" ps

echo "[5/5] Recent backend logs:"
docker compose "${COMPOSE_FILES[@]}" logs --tail=80 aqua-backend

echo "Deployment completed."
