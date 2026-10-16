param (
    [ValidateSet('prod', 'dev')]
    [string]$Environment = 'prod',

    # Ueberspringt das Datenbank-Dump vor dem Deployment
    [switch]$SkipBackup
)

# Deployst den Schichtplan V2 auf den Server:
#   1. Packt das Projekt (ohne node_modules, build-output und .env-Dateien)
#   2. Erstellt ein Backup der PostgreSQL-Datenbank auf dem Server
#   3. Entpackt den Code, baut die Container und startet sie unterbruchfrei via Traefik
#   4. Fuehrt DB-Migrationen durch
#   5. Wartet bis API und Frontend HTTP 200 melden

# Serverdetails ($Server, $RemoteBase) liegen ausserhalb von Git in deploy.config.ps1
$ConfigFile = Join-Path $PSScriptRoot "deploy.config.ps1"
if (-not (Test-Path $ConfigFile)) {
    Write-Host "deploy.config.ps1 fehlt: Vorlage deploy.config.example.ps1 kopieren und ausfuellen." -ForegroundColor Red
    exit 1
}
. $ConfigFile

$ProjectName = "schichtplan-$Environment"
$RemoteDir = "$RemoteBase/$ProjectName"
$ArchiveName = "deploy.tar.gz"
$RemoteScript = "deploy-remote.sh"

if ($Environment -eq 'dev') {
    $ComposeFile = "docker-compose.staging.yml"
    $Prefix = "schichtplan-dev"
    $DefaultDomain = "dev.cevi-schichtplan.ch"
    $LegacyNetwork = "schichtplan-dev_schichtplan_dev_network"
} else {
    $ComposeFile = "docker-compose.yml"
    $Prefix = "schichtplan"
    $DefaultDomain = "cevi-schichtplan.ch"
    $LegacyNetwork = "schichtplan-prod_schichtplan_network"
}
# Eigenes Proxy-Netz pro Umgebung (nur Traefik + diese Umgebung), siehe AGENTS.md Abschnitt 2a
$ProxyNetwork = "schichtplan_${Environment}_proxy"

function Step($text) { Write-Host "`n$text" -ForegroundColor Cyan }

function Stop-Deploy($text) {
    Write-Host "`nDEPLOY FEHLGESCHLAGEN: $text" -ForegroundColor Red
    Remove-Item $ArchiveName, $RemoteScript -ErrorAction SilentlyContinue
    exit 1
}

Set-Location $PSScriptRoot
Write-Host "Deploy nach $Environment ($RemoteDir auf $Server)" -ForegroundColor Cyan

# Pruefe uncommitted Dateien
$commit = git log --oneline -1 2>$null
$dirty = @(git status --porcelain 2>$null)
if ($commit) { Write-Host "Stand: $commit" }
if ($dirty.Count -gt 0) {
    Write-Host "Achtung: $($dirty.Count) Datei(en) sind nicht committet und gehen trotzdem mit:" -ForegroundColor Yellow
    $dirty | Select-Object -First 8 | ForEach-Object { Write-Host "  $_" -ForegroundColor Yellow }
}

Step "1. Archiv erstellen"
tar.exe --exclude="node_modules" --exclude=".git" --exclude="dist" --exclude="out" --exclude=".next" --exclude=".env*" --exclude="backups" --exclude="*.dump" --exclude="*.sql.gz" --exclude="deploy.config.ps1" --exclude=$ArchiveName --exclude=$RemoteScript -czf $ArchiveName .
if ($LASTEXITCODE -ne 0) { Stop-Deploy "Das Archiv konnte nicht erstellt werden." }

# Server Script
$backup = if ($SkipBackup) { 0 } else { 1 }
$remote = @"
#!/bin/bash
set -euo pipefail
cd "$RemoteDir"
export DOCKER_BUILDKIT=1
export COMPOSE_DOCKER_CLI_BUILD=1

# Netz-Voraussetzung: eigenes Proxy-Netz, an dem der zentrale Traefik haengt (sonst bricht der Deploy hier ab, bevor etwas angefasst wird)
if ! docker network inspect "$ProxyNetwork" > /dev/null 2>&1; then
  echo "Docker-Netz $ProxyNetwork fehlt. Anlegen: docker network create $ProxyNetwork (und Traefik damit verbinden, siehe AGENTS.md 2a)"
  exit 1
fi
if ! docker network inspect "$ProxyNetwork" --format '{{range .Containers}}{{.Name}}{{println}}{{end}}' | grep -qx traefik; then
  echo "Traefik ist nicht mit $ProxyNetwork verbunden: docker network connect $ProxyNetwork traefik (und im Proxy-Compose eintragen)"
  exit 1
fi

if [ "$backup" = "1" ]; then
  if docker ps --format '{{.Names}}' | grep -qx "$Prefix-db"; then
    mkdir -p backups
    file="backups/pre-deploy-`$(date +%Y%m%d-%H%M%S).sql.gz"
    docker exec "$Prefix-db" sh -c 'pg_dump -U "`$POSTGRES_USER" "`$POSTGRES_DB"' | gzip > "`$file"
    [ -s "`$file" ] || { echo "Backup ist leer"; exit 1; }
    echo "Backup: `$file (`$(du -h "`$file" | cut -f1))"
    ls -1t backups/pre-deploy-*.sql.gz | tail -n +11 | xargs -r rm --
  else
    echo "Keine laufende Datenbank gefunden, kein Backup (erster Deploy?)"
  fi
else
  echo "Backup uebersprungen"
fi

rm -rf apps packages
tar -xzf "$ArchiveName"
rm -f "$ArchiveName"

if [ ! -f .env ]; then
  echo "Initiale .env Datei wird mit sicheren Schluesseln erstellt..."
  db_pw=`$(openssl rand -hex 20 2>/dev/null || tr -dc 'A-Za-z0-9' </dev/urandom | head -c 24)
  jwt_sec=`$(openssl rand -hex 32 2>/dev/null || tr -dc 'A-Za-z0-9' </dev/urandom | head -c 48)
  if [ "$Environment" = "dev" ]; then
    cat > .env <<ENVEOF
NODE_ENV=production
DOMAIN_DEV=$DefaultDomain
DB_USER=cevi_schichtplan_dev
DB_PASSWORD=`$db_pw
DB_NAME=cevi_schichtplan_dev
DATABASE_URL=postgresql://cevi_schichtplan_dev:`$db_pw@db:5432/cevi_schichtplan_dev?schema=public
JWT_SECRET=`$jwt_sec
CEVIDB_BASE_URL=https://db.cevi.ch
CEVIDB_CLIENT_ID=
CEVIDB_CLIENT_SECRET=
GLOBAL_ADMIN_CEVIDB_IDS=
CEVIDB_REDIRECT_URI=https://login.$DefaultDomain/api/auth/cevidb/callback
SMTP_HOST=mail.infomaniak.com
SMTP_PORT=587
SMTP_USER=admin@cevi-schichtplan.ch
SMTP_PASSWORD=
SMTP_FROM=Cevi Schichtplan <admin@cevi-schichtplan.ch>
ENVEOF
  else
    cat > .env <<ENVEOF
NODE_ENV=production
DOMAIN=$DefaultDomain
DB_USER=cevi_schichtplan
DB_PASSWORD=`$db_pw
DB_NAME=cevi_schichtplan_v2
DATABASE_URL=postgresql://cevi_schichtplan:`$db_pw@db:5432/cevi_schichtplan_v2?schema=public
JWT_SECRET=`$jwt_sec
CEVIDB_BASE_URL=https://db.cevi.ch
CEVIDB_CLIENT_ID=
CEVIDB_CLIENT_SECRET=
GLOBAL_ADMIN_CEVIDB_IDS=
CEVIDB_REDIRECT_URI=https://login.$DefaultDomain/api/auth/cevidb/callback
SMTP_HOST=mail.infomaniak.com
SMTP_PORT=587
SMTP_USER=admin@cevi-schichtplan.ch
SMTP_PASSWORD=
SMTP_FROM=Cevi Schichtplan <admin@cevi-schichtplan.ch>
ENVEOF
  fi
  chmod 600 .env
fi

# Rolling Build & Restart
echo "Docker Images werden gebaut und gestartet (das kann 1-2 Minuten dauern)..."
log=`$(mktemp)
if ! docker compose -f "$ComposeFile" -p "$ProjectName" up -d --build > "`$log" 2>&1; then
  tail -n 60 "`$log"; rm -f "`$log"
  echo "Build oder Start fehlgeschlagen. Die bisherigen Container laufen unveraendert weiter."
  exit 1
fi
rm -f "`$log"

# Altes Netz (vor der Segmentierung) aufraeumen, sobald es leer ist
docker network rm "$LegacyNetwork" > /dev/null 2>&1 || true

# Migrationen ausfuehren
echo "Prisma Migrationen ausfuehren..."
docker compose -f "$ComposeFile" -p "$ProjectName" exec -T backend npx prisma migrate deploy || true
# Kein Seed auf dem Server: Demo-Daten (npm run db:seed) sind nur für die lokale Entwicklung

# Healthcheck Verify
domain=`$(grep -E '^(DOMAIN|DOMAIN_DEV)=' .env 2>/dev/null | head -n1 | cut -d= -f2- | tr -d '\r"' || true)
domain=`${domain:-$DefaultDomain}

check() {
  for i in `$(seq 1 30); do
    code=`$(curl -s -o /dev/null -m 5 -w '%{http_code}' "`$1" || true)
    if [ "`$code" = "200" ]; then echo "OK   `$1"; return 0; fi
    sleep 3
  done
  echo "FEHLER `$1 antwortet nicht mit 200 (zuletzt `$code)"
  return 1
}

if ! check "https://`$domain/health" || ! check "https://`$domain/"; then
  echo "--- letzte Zeilen Logs ---"
  docker compose -f "$ComposeFile" -p "$ProjectName" logs --tail 40
  exit 1
fi

if [ "$Environment" = "prod" ]; then
  if ! check "https://login.`$domain/"; then
    echo "--- letzte Zeilen Logs ---"
    docker compose -f "$ComposeFile" -p "$ProjectName" logs --tail 40
    exit 1
  fi
else
  check "https://login.`$domain/" || echo "WARNUNG: login.`$domain nicht erreichbar (DNS oder Zertifikat noch in Arbeit?)"
fi

# Admin-Portal: kein harter Fehler, damit ein fehlender DNS-Eintrag den restlichen Deploy nicht kippt
check "https://admin.`$domain/" || echo "WARNUNG: admin.`$domain nicht erreichbar (DNS oder Zertifikat noch in Arbeit?)"

echo "DEPLOY_SUCCESS=1"
"@

[IO.File]::WriteAllText((Join-Path $PSScriptRoot $RemoteScript), ($remote -replace "`r`n", "`n"))

Step "2. Hochladen"
ssh -n $Server "mkdir -p $RemoteDir"
if ($LASTEXITCODE -ne 0) { Stop-Deploy "Keine Verbindung zum Server." }
scp -q $ArchiveName $RemoteScript "${Server}:${RemoteDir}/"
if ($LASTEXITCODE -ne 0) { Stop-Deploy "Das Hochladen hat nicht geklappt." }

Step "3. Backup, Build und unterbruchfreier Neustart auf dem Server"
ssh -n $Server "bash $RemoteDir/$RemoteScript; code=`$?; rm -f $RemoteDir/$RemoteScript; exit `$code"
$result = $LASTEXITCODE

Remove-Item $ArchiveName, $RemoteScript -ErrorAction SilentlyContinue

if ($result -ne 0) {
    Stop-Deploy "Siehe Ausgabe oben. Der vorherige Stand der DB liegt unter $RemoteDir/backups."
}

Write-Host "`nDeploy nach $Environment erfolgreich abgeschlossen! Services laufen unterbruchfrei." -ForegroundColor Green
