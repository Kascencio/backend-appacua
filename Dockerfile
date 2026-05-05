# ─────────────────────────────────────────────────────
# Backend Dockerfile – Producción (multi-stage, Alpine)
# ─────────────────────────────────────────────────────

# ── Base ─────────────────────────────────────────────
FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache openssl

# ── Dependencias ─────────────────────────────────────
FROM base AS deps
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

# ── Build ────────────────────────────────────────────
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json tsconfig.json ./
COPY prisma ./prisma
COPY src ./src
COPY scripts ./scripts
RUN npm run build

# ── Runtime ──────────────────────────────────────────
FROM base AS runtime

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3100

# Copiar dependencias y podar devDependencies
COPY package.json package-lock.json ./
COPY --from=deps /app/node_modules ./node_modules
RUN npm prune --omit=dev && npm cache clean --force

# Copiar Prisma (schema + migraciones) y build
COPY prisma ./prisma
COPY --from=builder /app/dist ./dist

# Regenerar Prisma Client para la plataforma correcta (linux-musl)
RUN npx prisma generate

# Usuario no root
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 --ingroup nodejs backend

USER backend

EXPOSE 3100

# Ejecutar migraciones y arrancar
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
