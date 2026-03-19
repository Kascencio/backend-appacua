#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

STACK_FILE="${STACK_FILE:-portainer-stack.yml}"
STACK_NAME="${STACK_NAME:-aqua-backend}"
IMAGE_NAME="${DOCKER_IMAGE:-keaf13/aqua-backend:latest}"

SWARM_STATE="$(docker info --format '{{.Swarm.LocalNodeState}}' 2>/dev/null || true)"
if [[ "$SWARM_STATE" != "active" ]]; then
  echo "Docker Swarm is not active on this node."
  echo "Run 'docker swarm init' before deploying the stack."
  exit 1
fi

if [[ ! -f "$STACK_FILE" ]]; then
  echo "Stack file not found: $STACK_FILE"
  exit 1
fi

echo "[1/4] Validating stack file: ${STACK_FILE}"
docker stack config -c "$STACK_FILE" >/dev/null

echo "[2/4] Deploying stack ${STACK_NAME} with image ${IMAGE_NAME}"
docker stack deploy -c "$STACK_FILE" "$STACK_NAME"

echo "[3/4] Stack services:"
docker stack services "$STACK_NAME"

echo "[4/4] Stack tasks:"
docker stack ps "$STACK_NAME"

echo "Swarm deployment submitted."
