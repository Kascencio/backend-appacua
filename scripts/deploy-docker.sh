#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

COMPOSE_FILES=(-f docker-compose.yml)
IMAGE_NAME="${DOCKER_IMAGE:-aqua-backend:latest}"

if [[ "${1:-}" == "--with-mysql" ]]; then
  COMPOSE_FILES+=(-f docker-compose.mysql.yml)
fi

BUILD_ARGS=()
echo "[1/4] Ensuring image exists: ${IMAGE_NAME}"
if docker image inspect "${IMAGE_NAME}" >/dev/null 2>&1; then
  echo "Image already exists. Using ${IMAGE_NAME}."
else
  echo "Image not found. Building ${IMAGE_NAME}..."
  BUILD_ARGS+=(--build)
fi

echo "[2/4] Starting containers..."
docker compose "${COMPOSE_FILES[@]}" up -d --remove-orphans "${BUILD_ARGS[@]}"

echo "[3/4] Running health check..."
sleep 3
docker compose "${COMPOSE_FILES[@]}" ps

echo "[4/4] Recent backend logs:"
docker compose "${COMPOSE_FILES[@]}" logs --tail=80 aqua-backend

echo "Deployment completed."
