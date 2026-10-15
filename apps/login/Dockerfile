# syntax=docker/dockerfile:1
FROM node:22-alpine AS base
WORKDIR /app
RUN apk add --no-cache libc6-compat

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

# 2. Development target (for docker-compose.dev.yml)
FROM base AS development
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY packages/shared ./packages/shared
COPY packages/ui ./packages/ui
COPY apps/login ./apps/login
WORKDIR /app/apps/login
EXPOSE 3002
CMD ["npm", "run", "dev"]

# 3. Build target
FROM base AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
COPY --from=dependencies /app/node_modules ./node_modules
COPY packages/shared ./packages/shared
COPY packages/ui ./packages/ui
COPY apps/login ./apps/login
WORKDIR /app/packages/shared
RUN npm run build
WORKDIR /app/apps/login
RUN --mount=type=cache,target=/app/apps/login/.next/cache npm run build

# 4. Production runner
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3002
ENV HOSTNAME="0.0.0.0"

COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=builder /app/apps/login/.next/standalone ./
COPY --from=builder /app/apps/login/.next/static ./.next/static
COPY --from=builder /app/apps/login/public ./public
COPY --from=builder /app/apps/login/.next/static ./apps/login/.next/static
COPY --from=builder /app/apps/login/public ./apps/login/public

EXPOSE 3002

HEALTHCHECK --interval=5s --timeout=3s --retries=5 \
  CMD node -e "fetch('http://localhost:3002/').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

CMD ["node", "apps/login/server.js"]
