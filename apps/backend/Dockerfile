# syntax=docker/dockerfile:1
FROM node:26-bookworm-slim AS base
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*

# 1. Install dependencies (Workspaces cached via Lockfile)
FROM base AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/ui/package.json ./packages/ui/
COPY apps/backend/package.json ./apps/backend/
COPY apps/landing/package.json ./apps/landing/
COPY apps/login/package.json ./apps/login/
COPY apps/web/package.json ./apps/web/
COPY apps/admin/package.json ./apps/admin/
RUN --mount=type=cache,target=/root/.npm npm ci
# Ordner immer anlegen: npm legt ihn nur an, wenn eine Abhängigkeit nicht ins Root hochgezogen wird
# (sonst scheitern die COPY-Zeilen unten, sobald alles gehoistet ist)
RUN mkdir -p apps/backend/node_modules

# 2. Development target (for docker-compose.dev.yml)
FROM base AS development
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
# Backend-eigene Abhängigkeiten, die npm nicht hochzieht (z. B. dotenv 18, weil Prisma intern dotenv 17 nutzt)
COPY --from=dependencies /app/apps/backend/node_modules ./apps/backend/node_modules
COPY packages/shared ./packages/shared
COPY apps/backend ./apps/backend
WORKDIR /app/apps/backend
RUN npx prisma generate
EXPOSE 4000
CMD ["npm", "run", "dev"]

# 3. Build target
FROM base AS builder
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
# Backend-eigene Abhängigkeiten, die npm nicht hochzieht (z. B. dotenv 18, weil Prisma intern dotenv 17 nutzt)
COPY --from=dependencies /app/apps/backend/node_modules ./apps/backend/node_modules
COPY packages/shared ./packages/shared
COPY apps/backend ./apps/backend
WORKDIR /app/packages/shared
RUN npm run build
WORKDIR /app/apps/backend
RUN npx prisma generate
RUN npm run build

# 4. Production runner (minimal & fast)
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/backend/node_modules ./apps/backend/node_modules
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=builder /app/apps/backend/dist ./apps/backend/dist
COPY --from=builder /app/apps/backend/package.json ./apps/backend/package.json
COPY --from=builder /app/apps/backend/prisma ./apps/backend/prisma
# Prisma 7: CLI-Konfiguration (DATABASE_URL, Migrationen) für `npx prisma migrate deploy` im Deploy
COPY --from=builder /app/apps/backend/prisma.config.ts ./apps/backend/prisma.config.ts

WORKDIR /app/apps/backend
EXPOSE 4000

HEALTHCHECK --interval=10s --timeout=3s --retries=5 \
  CMD node -e "fetch('http://localhost:4000/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

# Deployter Git-Stand (von deploy.ps1 als Build-Argument), erscheint in /health.
# Steht bewusst am Ende, damit ein neuer Stand nur diese Schicht neu baut.
ARG APP_REVISION=unknown
ENV APP_REVISION=$APP_REVISION

# Node direkt (nicht über npm), damit SIGTERM beim Deploy beim Server ankommt
CMD ["node", "dist/server.js"]
