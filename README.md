# Cevi Schichtplan V2 🏕️📋

Moderne, mandantenfähige (Multi-Tenant) und multi-eventfähige Webanwendung zur Organisation von Schichtplänen für Cevi-Abteilungen.

Basiert auf der bewährten Architektur von `laden_v2`:
* **Frontend (App):** Next.js 15 (App Router, Tailwind CSS, Lucide Icons) – läuft auf den Abteilungs-Subdomains `*.cevi-schichtplan.ch`
* **Frontend (Landing/Hauptseite):** Next.js 15 – läuft als separater Container auf `cevi-schichtplan.ch`
* **Backend:** Fastify 5 + TypeScript (stateless, hochperformant, Zod-Validierung)
* **Datenbank:** PostgreSQL 17 mit Prisma ORM
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
* Jede Abteilung erhält eine eigene Subdomain (z. B. `uster.cevi-schichtplan.ch`).
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
cd C:\Users\Nels\IT\schichtplan_v2

# 2. Lokale Container starten (Hot-Reload)
docker compose -f docker-compose.dev.yml up --build

# 3. Zugriff
# Backend API:    http://localhost:4000
# Schichtplan:    http://localhost:3000
# Hauptseite:     http://localhost:3001
# PostgreSQL:     localhost:5432
```

---

## 🚀 Deployment (Server)

```powershell
# Deploy nach Staging / Dev
.\deploy.ps1 -Environment dev

# Deploy nach Produktion (mit automatischem DB-Backup und Healthcheck)
.\deploy.ps1 -Environment prod
```
