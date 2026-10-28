# Cevi Schichtplan V2 🏕️📋

Moderne, mandantenfähige (Multi-Tenant) und multi-eventfähige Webanwendung zur Organisation von Schichtplänen für Cevi-Abteilungen.

Basiert auf der bewährten Architektur von `laden_v2`:
* **Frontend (App):** Next.js 15 (App Router, Tailwind CSS, Lucide Icons) – läuft auf den Abteilungs-Subdomains `*.cevi-schichtplan.ch`
* **Frontend (Landing/Hauptseite):** Next.js 15 – läuft als separater Container auf `cevi-schichtplan.ch`
* **Backend:** Fastify 5 + TypeScript (stateless, hochperformant, Zod-Validierung)
* **Datenbank:** PostgreSQL 17 mit Prisma ORM
* **Hilfe-Center:** Astro Starlight in `hilfe/` (statisch, nginx) auf `hilfe.cevi-schichtplan.ch`
* **Status-Portal:** Uptime Kuma auf `status.cevi-schichtplan.ch` (im Projekt `status-schichtplan`)
* **Shared Types:** `@schichtplan/shared` im Monorepo
* **Reverse Proxy:** Traefik mit automatischem Wildcard-SSL & Zero-Downtime Healthchecks

---

## 🏗️ Architektur & Mandantenfähigkeit

```
                                  [ Internet ]
                                       |
                   *.cevi-schichtplan.ch (Wildcard DNS)
                                       |
                                       v
                    +------------------------------------+
                    |        Traefik Reverse Proxy       |
                    +------------------------------------+
                      /                |               \
        Host: cevi-schichtplan.ch      |      Host: *.cevi-schichtplan.ch
                    /                  |                 \
                   v                   v                  v
         +------------------+  +---------------+  +-------------------+
         |  apps/landing    |  |  apps/backend |  |     apps/web      |
         |  (Hauptportal)   |  | (Fastify API) |  | (Schichtplan-App) |
         |   Port 3001      |  |   Port 4000   |  |    Port 3000      |
         +------------------+  +---------------+  +-------------------+
                                       |
                                       v
                               +---------------+
                               |  PostgreSQL   |
                               +---------------+
```

### 1. Eigene Subdomains pro Abteilung
* Jede Abteilung erhält eine eigene Subdomain (z. B. `<abteilung>.cevi-schichtplan.ch`).
* Traefik routet alle Subdomains an den `apps/web`-Container weiter.
* Der `apps/web`-Container und das Backend erkennen die Abteilung automatisch anhand des `Host`-Headers.

### 2. Multi-Events
* Eine Abteilung kann beliebig viele Events parallel verwalten (z. B. *Chilbi 2026*, *Sommerlager*, *Cevi-Tag*).
* Keine Code-Duplikate oder getrennte Datenbanken mehr nötig!

### 3. Unterbruchfreier Neustart (Zero-Downtime)
* Traefik prüft kontinuierlich den Healthcheck (`/health` und `/`).
* Beim Rollout startet zuerst der neue Container. Erst wenn er HTTP 200 meldet, leitet Traefik den Traffic um.

---

## 💻 Lokale Entwicklung

```bash
# 1. Repository-Root
cd schichtplan_v2

# 2. Lokale Container starten (Hot-Reload)
docker compose -f docker-compose.dev.yml up --build

# 3. Zugriff
# Backend API:    http://localhost:4000
# Schichtplan:    http://localhost:3000
# Hauptseite:     http://localhost:3001
# PostgreSQL:     localhost:5432
```

### Hilfe-Center (`hilfe/`)

Eigenes Node-Projekt ausserhalb der Workspaces (eigene `package-lock.json`), damit Astro nicht in die
Images der anderen Apps gelangt. Inhalte sind Markdown/MDX in `hilfe/src/content/docs/`, die Seitenleiste
steht in `hilfe/astro.config.mjs`.

```bash
npm --prefix hilfe install
npm run hilfe:dev       # http://localhost:3004 mit Hot-Reload (Suche nur im Build)
npm run hilfe:build     # statischer Build nach hilfe/dist, inkl. Suchindex
npm run hilfe:preview   # Build lokal ansehen, mit Suche
```

Aus den Apps verlinkt `helpUrl('/pfad/')` aus `@schichtplan/shared` auf eine Hilfeseite.

### Tests (Backend, Vitest)

Unit-Tests liegen neben dem Code (`apps/backend/src/**/*.test.ts`) und brauchen keine Datenbank.
Die API-Tests in `apps/backend/test/` laufen gegen eine eigene, leere Test-Datenbank
(`TEST_DATABASE_URL`, alle Tabellen werden vor jedem Test geleert) und werden ohne sie übersprungen.

```bash
# Einmalig: Wegwerf-Postgres nur für Tests (nicht die Entwicklungs-DB!)
docker run -d --name schichtplan-test-db -e POSTGRES_USER=test -e POSTGRES_PASSWORD=test -e POSTGRES_DB=schichtplan_test -p 127.0.0.1:54329:5432 postgres:17-alpine
(cd apps/backend && DATABASE_URL=postgresql://test:test@127.0.0.1:54329/schichtplan_test npx prisma migrate deploy)

# Tests (shared vorher bauen: npm run build --workspace=packages/shared)
TEST_DATABASE_URL=postgresql://test:test@127.0.0.1:54329/schichtplan_test npm test
```

---

## 🚀 Deployment (Server)

```powershell
# Deploy nach Staging / Dev
.\deploy.ps1 -Environment dev

# Deploy nach Produktion (mit automatischem DB-Backup und Healthcheck)
.\deploy.ps1 -Environment prod
```
