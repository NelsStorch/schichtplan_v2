# syntax=docker/dockerfile:1
# Hilfe-Center: Astro baut statisches HTML, nginx liefert es aus. Kein Node zur Laufzeit,
# kein Backend, keine DB. Build-Kontext ist das Repo-Root (wie bei den anderen Apps).

FROM node:26-alpine AS builder
WORKDIR /app/hilfe
COPY hilfe/package.json hilfe/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund
# Zugangsarten kommen direkt aus den gemeinsamen Konstanten der App
COPY packages/shared/src/constants.ts /app/packages/shared/src/constants.ts
COPY hilfe ./
RUN npm run build

FROM nginx:1.29-alpine AS runner
COPY hilfe/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/hilfe/dist /usr/share/nginx/html
EXPOSE 3004
HEALTHCHECK --interval=10s --timeout=3s --retries=5 \
  CMD wget -q -O /dev/null http://127.0.0.1:3004/api/health || exit 1
