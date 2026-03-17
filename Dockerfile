FROM node:20-bookworm-slim AS base

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

ENV HOST=0.0.0.0
ENV PORT=3100

FROM base AS builder

COPY package*.json ./
COPY prisma ./prisma

RUN npm ci

COPY tsconfig.json ./
COPY src ./src
COPY scripts ./scripts

RUN npm run build

FROM base AS runtime

ENV NODE_ENV=production

COPY package*.json ./
COPY prisma ./prisma
COPY --from=builder /app/node_modules ./node_modules

RUN npm prune --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist

EXPOSE 3100

CMD ["node", "dist/index.js"]
