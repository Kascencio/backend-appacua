#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

COMPOSE_FILES=(-f docker-compose.yml)

if [[ "${1:-}" == "--with-mysql" ]]; then
  COMPOSE_FILES+=(-f docker-compose.mysql.yml)
fi

echo "[1/3] Building and starting containers..."
docker compose "${COMPOSE_FILES[@]}" up -d --build --remove-orphans

echo "[2/3] Running health check..."
sleep 3
docker compose "${COMPOSE_FILES[@]}" ps

echo "[3/3] Recent backend logs:"
docker compose "${COMPOSE_FILES[@]}" logs --tail=80 aqua-backend

echo "Deployment completed."
