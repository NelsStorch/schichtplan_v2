# Schichtplan V2 · Cevi · Pfadi · Jubla · Vereine 🏕️📋

[![CI](https://github.com/NelsStorch/schichtplan_v2/actions/workflows/ci.yml/badge.svg)](https://github.com/NelsStorch/schichtplan_v2/actions/workflows/ci.yml)
[![Node.js](https://img.shields.io/badge/node-%3E%3D26-brightgreen.svg)](https://nodejs.org/)
[![Next.js](https://img.shields.io/badge/Next.js-16-black.svg)](https://nextjs.org/)
[![Fastify](https://img.shields.io/badge/Fastify-5.x-black.svg)](https://fastify.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x%20%2F%207.x-blue.svg)](https://www.typescriptlang.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-17-blue.svg)](https://www.postgresql.org/)
[![Prisma](https://img.shields.io/badge/Prisma-7.x-1B222D.svg)](https://www.prisma.io/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-v4-38bdf8.svg)](https://tailwindcss.com/)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPLv3-blue.svg)](LICENSE)

Moderne, mandantenfähige (Multi-Tenant) und multi-eventfähige Web-Plattform zur Organisation von Schichtplänen, Einsätzen und Helferteams für Jugendverbände und Vereine in der Schweiz. Eine Codebasis, ein Backend und eine Datenbank bedienen vier Auftritte mit eigener Domain, eigenem Erscheinungsbild und eigenem Login:

| Auftritt | Domain | Für | Login | Hilfe-Center |
|---|---|---|---|---|
| **Cevi Schichtplan** | [cevi-schichtplan.ch](https://cevi-schichtplan.ch/) | Cevi-Abteilungen | Cevi.DB (Hitobito) | [hilfe.cevi-schichtplan.ch](https://hilfe.cevi-schichtplan.ch/) |
| **Pfadi Schichtplan** | [pfadi-schichtplan.ch](https://pfadi-schichtplan.ch/) | Pfadi-Abteilungen | PBS MiData (Hitobito) | [hilfe.pfadi-schichtplan.ch](https://hilfe.pfadi-schichtplan.ch/) |
| **Jubla Schichtplan** | [jubla-schichtplan.ch](https://jubla-schichtplan.ch/) | Jubla-Scharen | Jubla-DB (Hitobito) | [hilfe.jubla-schichtplan.ch](https://hilfe.jubla-schichtplan.ch/) |
| **Vereins Schichtplan** | [vereins-schichtplan.ch](https://vereins-schichtplan.ch/) | Vereine & Festkomitees | E-Mail & Passwort | [hilfe.vereins-schichtplan.ch](https://hilfe.vereins-schichtplan.ch/) |

Helfer*innen ohne Verbandskonto tragen sich auf allen vier Auftritten mit E-Mail und Passwort oder als Gast ein.

> [!NOTE]
> **Du willst den Schichtplan für deine Abteilung, deine Schar, deinen Verein oder Anlass nutzen?** Dafür brauchst du diesen Code nicht.
> Die Plattform läuft bereits: Wähle oben den Auftritt deines Verbands, Anleitungen findest du im jeweiligen Hilfe-Center.
> Dieses Repository richtet sich an Entwickler:innen, die mithelfen oder den Aufbau verstehen möchten.

<sub>Unabhängiges Projekt: Pfadi Schichtplan wird nicht von der Pfadibewegung Schweiz (PBS) betrieben oder herausgegeben.</sub>

![Schichtplan eines Anlasses aus Sicht von Helfenden](docs/screenshots/anlass.webp)

<table>
  <tr>
    <td width="68%"><img src="docs/screenshots/ok-schichten.webp" alt="OK-Bereich: Schichten planen und Personen einteilen"></td>
    <td width="32%"><img src="docs/screenshots/mobil-meine-schichten.webp" alt="Meine Schichten auf dem Handy mit Kalender-Abo"></td>
  </tr>
  <tr>
    <td align="center"><sub>OK-Bereich: Schichten planen und einteilen</sub></td>
    <td align="center"><sub>«Meine Schichten» auf dem Handy</sub></td>
  </tr>
</table>

<sub>Screenshots mit Demo-Daten aus <code>npm run db:seed</code>.</sub>

---

## ✨ Hauptfunktionen

* 🌍 **Vier Verbände, eine Plattform:** Cevi, Pfadi, Jubla und Vereine laufen auf eigenen Domains (`cevi-`, `pfadi-`, `jubla-`, `vereins-schichtplan.ch`) mit eigenem Logo, eigenen Farben, eigenen Begriffen (Abteilung, Schar, Verein; Cevi-Name, Pfadiname, Leitername) und eigenem Mail-Absender. Die Verbands-Konfiguration liegt zentral in `packages/shared/src/organizations.ts`.
* 🏰 **Mandantenfähig via Subdomains:** Jede Abteilung, Schar oder jeder Verein erhält eine eigene Web-Präsenz (z. B. `https://<abteilung>.cevi-schichtplan.ch` oder `https://<verein>.vereins-schichtplan.ch`) mit individueller Farbgebung, eigenem Logo und eigener Stufenstruktur.
* 🔑 **Single Sign-On mit den Verbandsdatenbanken (Hitobito):** OAuth-2.0-Anbindung an Cevi.DB (`db.cevi.ch`), PBS MiData (`db.scout.ch`) und Jubla-DB (`db.jubla.ch`). Synchronisation von Cevi-, Pfadi- bzw. Leiternamen, Geburtsdatum und Stufen sowie automatische Vergabe von Leitungsrechten für Abteilungs- und Scharleitungen. Vereine melden sich mit E-Mail und Passwort an.
* ⛺ **Multi-Event-Architektur:** Parallele Verwaltung beliebig vieler Anlässe pro Abteilung oder Verein (z. B. *Chilbi*, *Sommerlager*, *Pfingstlager*, *Suppentag*, *Sponsorenlauf*, *Turnier*, *Dorffest*).
* 🛠️ **Mächtiger OK-Bereich (Verwaltung):**
  * Wiederverwendbarer Katalog an Aufgaben und Einsatzbereichen mit Jugendschutz-Regeln (Mindestalter, J+S-Leitungsanforderungen).
  * Schichten-Seriengenerator für wiederkehrende Zeitblöcke.
  * Helfer-Pool & Soll-Roster zur Überwachung der Abdeckung.
  * Granulares Rollen- und Rechtesystem für OK-Mitglieder, Abteilungs- und Scharleitungen sowie Vereinsvorstände.
  * Integriertes Nachrichtensystem für gezielte Helfer-Kommunikation per Mail.
  * PDF-Druckexport im professionellen Cevi-Design sowie CSV/Excel-Export.
* 🙋 **Intuitive Helfer*innen-Experience:**
  * Schichtanmeldung mit 1-Klick oder Gast-Eintragung.
  * **«Ersatz gesucht»:** Helfer*innen können Schichten bei Verhinderung ausschreiben und unkompliziert abgeben.
  * **PWA & Offline-Briefing:** Schichtdetails, Standorte, Notfallkontakte und Check-in-QR-Code bleiben auch bei schlechtem Mobilfunknetz auf dem Festgelände offline verfügbar.
  * **Kalender-Integration:** Webcal Live-Feed (Abonnement mit automatischer Aktualisierung) sowie 1-Klick-Export für Google Kalender und Apple iCal.
  * **QR-Check-in & Anwesenheit:** Kontaktloses Einchecken vor Ort am Stand per QR-Code oder digitales Abhaken durch das OK.
* 🔔 **Benachrichtigungen & Monitoring:**
  * E-Mail-Bestätigung, Passwort-Reset und konfigurierbare Schicht-Erinnerungen (z. B. 24h vor Schichtbeginn).
  * Web Push Benachrichtigungen für kurzfristige Änderungen.
  * Automatische Server-Alarme (DB-Pool, SMTP, 500er-Fehler) via Discord/Slack-Webhook.
* 🔒 **Datenschutz & Schweizer Recht (nDSG):**
  * Konsequenter Verzicht auf unnötige Adresserfassung.
  * Einstellbare automatische Löschfristen für anlassbezogene Zusatzfragen (z. B. T-Shirt-Grössen, Essenspräferenzen).
  * Konfigurierbare «Nur für Mitglieder»-Absicherung für interne Anlässe.
* 📚 **Integriertes Hilfe-Center:** Wissensdatenbank und Schritt-für-Schritt-Anleitungen unter `hilfe.<verband>-schichtplan.ch`, mit Begriffen und Farben des jeweiligen Verbands.

---

## 🏗️ System-Architektur

Das Monorepo besteht aus fünf Next.js-/Fastify-Diensten, einer statischen Dokumentation und gemeinsamen Bibliotheken:

```
                                      [ Internet ]
                                           |
      cevi- | pfadi- | jubla- | vereins-schichtplan.ch (je Apex + Wildcard-DNS)
                                           |
                                           v
                        +------------------------------------+
                        |        Traefik Reverse Proxy       |
                        +------------------------------------+
                          /        |         |        \       \
           <verband>     /         |         |         \       \  hilfe.<verband>
                        v          v         v          v       v
               +------------+ +--------+ +-------+ +-------+ +---------+
               |apps/landing| |apps/web| | apps/ | | apps/ | |  hilfe  |
               | (Marketing)| |(Schicht| | login | | admin | |(Starlight|
               |  Port 3001 | |  plan) | | (SSO) | |(Portal)| |  Nginx) |
               +------------+ |Port 3000| |  3002 | |  3003 | |  3004   |
                              +--------+ +-------+ +-------+ +---------+
                                  \          |         /
                           /api/*  \         |        /  /api/*
                                    v        v       v
                                +------------------------+
                                |      apps/backend      |
                                | (Fastify 5 + Prisma 7) |
                                |       Port 4000        |
                                +------------------------+
                                             |
                                             v
                                +------------------------+
                                |     PostgreSQL 17      |
                                +------------------------+
```

### Routing & Portale

`<verband>` steht für eine der vier Domains `cevi-schichtplan.ch`, `pfadi-schichtplan.ch`, `jubla-schichtplan.ch` oder `vereins-schichtplan.ch`. Welcher Verband gilt, ergibt sich allein aus dem Domain-Ende (`getOrganizationSlugFromHost` in `@schichtplan/shared`).

| Domain | Pfad / Dienst | Container-Port | Zweck |
|---|---|---|---|
| `<verband>` (`www.` leitet per 301 um) | `apps/landing` | 3001 | Öffentliche Startseite, Leistungsübersicht, Suche & Profil |
| `login.<verband>` | `apps/login` | 3002 | Zentrales SSO (Cevi.DB, PBS MiData, Jubla-DB, E-Mail/Passwort) |
| `<abteilung>.<verband>` | `apps/web` | 3000 | Mandanten-Portal: Anlässe, Schichten & OK-Bereich |
| `admin.cevi-schichtplan.ch` | `apps/admin` | 3003 | Zentrales Administrations-Portal für globale Admins (alle Verbände, mit Verbandsfilter) |
| `*.<verband>/api/*` | `apps/backend` | 4000 | Fastify REST API & Webcal/ICS-Feeds |
| `hilfe.<verband>` | `hilfe/` | 3004 | Statisches Hilfe-Center (Astro Starlight + Nginx), Branding je Domain |
| `status.cevi-schichtplan.ch` | Uptime Kuma (separater Container, nicht in diesem Repo) | – | Öffentliches Verfügbarkeits-Portal |

---

## 📁 Repository-Struktur

```
schichtplan_v2/
├── apps/
│   ├── admin/          # Admin-Portal für globale Administratoren (Next.js 16)
│   ├── backend/        # REST-API mit Fastify 5, Prisma 7 & TypeScript
│   ├── landing/        # Hauptseite & Marketing-Portal (Next.js 16)
│   ├── login/          # Zentrales Single Sign-On Portal (Next.js 16)
│   └── web/            # Mandantenfähige Schichtplan-App für Abteilungen, Scharen & Vereine (Next.js 16)
├── packages/
│   ├── shared/         # Gemeinsame Zod-Schemas, Typen, Verbands-Konfiguration & Hilfsfunktionen
│   └── ui/             # Gemeinsames Design-System (@schichtplan/ui mit Tailwind CSS v4)
├── hilfe/              # Hilfe-Center Dokumentation (Astro Starlight, unabhängig gebaut)
├── docker-compose.dev.yml      # Lokale Docker-Entwicklungsumgebung
├── docker-compose.yml          # Produktions-Deployment mit Traefik
├── docker-compose.staging.yml  # Staging-Deployment (dev.cevi-schichtplan.ch)
└── deploy.ps1                  # PowerShell Zero-Downtime Deployment-Skript
```

---

## 💻 Lokale Entwicklung

### Voraussetzungen

* **Node.js** `>= 26` (siehe `.nvmrc`) und **npm** `>= 11`
* **Docker** & **Docker Compose**

### 1. Repository klonen & Abhängigkeiten installieren

```bash
git clone https://github.com/NelsStorch/schichtplan_v2.git
cd schichtplan_v2

# Abhängigkeiten für alle Workspaces installieren
npm ci

# Gemeinsame Pakete kompilieren
npm run build --workspace=packages/shared
```

### 2. Entwicklungsumgebung mit Docker starten

Am einfachsten startet man den vollständigen Stack inklusive PostgreSQL über Docker Compose:

```bash
# Lokale Container starten (Hot-Reload aktiviert)
npm run dev:docker
# oder: docker compose -f docker-compose.dev.yml up --build
```

Nach dem Start stehen folgende Dienste lokal zur Verfügung:

| Dienst | Lokale URL |
|---|---|
| **Hauptportal (Landing):** | [http://localhost:3001](http://localhost:3001) |
| **Schichtplan-App (Web):** | [http://localhost:3000](http://localhost:3000) |
| **Login-Portal (SSO):** | [http://localhost:3002](http://localhost:3002) |
| **Admin-Portal:** | [http://localhost:3003](http://localhost:3003) |
| **Backend API:** | [http://localhost:4000](http://localhost:4000) |
| **PostgreSQL DB:** | `127.0.0.1:5432` |

> [!TIP]
> **Mandanten lokal testen:** Das Backend unterstützt den Header `x-tenant-slug: <slug>` oder Hostnamen wie `demo.localhost:3000`, um Abteilungen lokal ohne DNS-Konfiguration anzusprechen.
>
> **Verbände lokal testen:** Enthält der Hostname die Verbandskennung (`pfadi`, `jubla`, `verein`), gilt dieser Verband, z. B. `pfadi.localhost:3001` (Startseite Pfadi) oder `demo.jubla.localhost:3000` (Schar auf Jubla). Ohne Kennung gilt Cevi.

### 3. Datenbank initialisieren & Seeden

```bash
# Prisma-Migrationen anwenden
npm run db:migrate

# Neutrale Demo-Daten (Demo-Abteilung, Beispiel-Events & Schichten) einspielen
npm run db:seed

# Optional: Prisma Studio zur visuellen Datenprüfung öffnen
npm run db:studio
```

*Der Seed legt neutrale Beispieldaten an (`admin@example.com` mit generiertem oder per `SEED_PASSWORD` gesetztem Kennwort).*

---

## 🧪 Tests & Qualitätssicherung

Die Test-Suite basiert auf **Vitest** und umfasst Unit- und Integrationsprüfungen.

```bash
# 1. Typecheck über alle Apps und Packages
npm run typecheck

# 2. Backend Unit-Tests ausführen (ohne DB-Abhängigkeit)
npm run test

# 3. Vollständige API-Integrationstests gegen eine temporäre Test-Datenbank
docker run -d --name schichtplan-test-db \
  -e POSTGRES_USER=test -e POSTGRES_PASSWORD=test -e POSTGRES_DB=schichtplan_test \
  -p 127.0.0.1:54329:5432 postgres:17-alpine

(cd apps/backend && DATABASE_URL=postgresql://test:test@127.0.0.1:54329/schichtplan_test npx prisma migrate deploy)

TEST_DATABASE_URL=postgresql://test:test@127.0.0.1:54329/schichtplan_test npm test
```

---

## 📖 Hilfe-Center (`hilfe/`)

Das Hilfe-Center ist ein eigenständiges Projekt auf Basis von **Astro Starlight**. Es erzeugt statisches HTML und wird im produktiven Docker-Setup von Nginx ausgeliefert.

```bash
# Lokaler Entwicklungsmodus mit Hot-Reload
npm run hilfe:dev       # http://localhost:3004

# Statischen Produktions-Build erstellen (inkl. Pagefind-Suchindex)
npm run hilfe:build

# Statischen Build lokal vorprüfen
npm run hilfe:preview
```

---

## ⚙️ Konfiguration (`.env`)

Kopiere für eigene Umgebungen die Beispiel-Konfiguration:

```bash
cp .env.example .env
```

Wichtige Parameter:
* `DATABASE_URL`: Verbindungszeichenfolge für PostgreSQL.
* `JWT_SECRET`: Mindestens 32 Zeichen langes Secret zur Signierung der SSO-Cookies.
* `CEVIDB_CLIENT_ID` / `CEVIDB_CLIENT_SECRET`: OAuth 2.0 Zugangsdaten aus der Cevi.DB (Hitobito).
* `MIDATA_CLIENT_ID` / `MIDATA_CLIENT_SECRET`: OAuth 2.0 Zugangsdaten aus der PBS MiData (`db.scout.ch`).
* `JUBLADB_CLIENT_ID` / `JUBLADB_CLIENT_SECRET`: OAuth 2.0 Zugangsdaten aus der Jubla-DB (`db.jubla.ch`).
* `GLOBAL_ADMIN_CEVIDB_IDS`: Kommagetrennte Cevi.DB-Personen-IDs für den Zugriff auf `admin.<domain>`.
* `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`: Mail-Server für Bestätigungsmails & Erinnerungen. Pro Verband lässt sich ein eigener Absender setzen (`SMTP_USER_CEVI`, `SMTP_USER_PFADI`, `SMTP_USER_JUBLA`, `SMTP_USER_VEREIN`, Standard `admin@<verband>`).
* `ADMIN_ALERT_WEBHOOK_URL`: Discord- oder Slack-Webhook für automatische Server-Alarme.

---

## 🚀 Deployment & Betrieb

> [!IMPORTANT]
> `deploy.ps1`, `rollback.ps1` und `restore.ps1` sind auf den Betrieb der vier Schichtplan-Domains zugeschnitten (ein Linux-Server, Traefik mit Wildcard-Zertifikaten, Deploy von Windows aus).
> Für eine eigene Installation reichen in der Regel `docker-compose.yml` und eine `.env` nach Vorlage `.env.prod.example`. Vorausgesetzt werden ein laufender Traefik v3 (externes Proxy-Netzwerk und Zertifikats-Resolver, siehe Labels in `docker-compose.yml`) und je Domain ein Apex- und ein Wildcard-DNS-Eintrag für die Abteilungs-Subdomains.

Das Projekt ist für unterbruchfreies Deployment (**Zero-Downtime**) auf Linux-Servern mit **Traefik** als Reverse Proxy optimiert:

1. **Konfiguration:** `deploy.config.example.ps1` nach `deploy.config.ps1` kopieren und Serverdaten hinterlegen.
2. **Deploy ausführen:**
   ```powershell
   # Staging-System
   .\deploy.ps1 -Environment dev

   # Produktions-System (erstellt vorab automatisches DB-Backup)
   .\deploy.ps1 -Environment prod
   ```
3. **Rollout-Ablauf:**
   * Erstellt auf dem Server automatisch ein komprimiertes PostgreSQL-Backup (`pg_dump | gzip`).
   * Baut die neuen Docker-Images im Hintergrund und startet sie parallel.
   * Traefik Healthchecks (`/health` und `/`) stellen sicher, dass Traffic erst umgeleitet wird, wenn neue Container fehlerfrei laufen.
   * Führt Prisma-Migrationen unterbrechungsfrei aus.

---

## 🔒 Sicherheit & Datenschutz

* **Keine Speicherung unnötiger persönlicher Daten:** Es werden keine Wohnadressen oder sensible Daten erfasst, die für einen Helfereinsatz irrelevant sind.
* **Sichere Session-Cookies:** Wildcard-Cookie je Verbandsdomain (z. B. `Domain=.pfadi-schichtplan.ch`) mit `HttpOnly`, `SameSite=Lax` und `Secure`.
* **Schutz administrativer Schnittstellen:** `admin.<domain>` erfordert Re-Authentifizierung, Cevi.DB-Herkunftsnachweis, Herkunftsüberprüfung (`Sec-Fetch-Site`) und automatische Rate-Limits.
* Sicherheitsrelevante Schwachstellen können vertraulich gemeldet werden (siehe [SECURITY.md](SECURITY.md)).

---

## 📄 Lizenz

Dieses Projekt ist unter der **GNU Affero General Public License Version 3 (AGPLv3)** lizenziert – siehe die Datei [LICENSE](LICENSE) für Details.

Jede Modifikation und jeder Betrieb als Netzwerkdienst (SaaS) muss den vollständigen Quellcode gemäss AGPLv3 frei zugänglich machen.



