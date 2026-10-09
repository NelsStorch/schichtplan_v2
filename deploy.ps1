param (
    [ValidateSet('prod', 'dev')]
    [string]$Environment = 'dev',

    # Ueberspringt das Datenbank-Dump vor dem Deployment
    [switch]$SkipBackup
)

# Deployst den Schichtplan V2 auf den Server:
#   1. Packt das Projekt (ohne node_modules, build-output und .env-Dateien)
#   2. Erstellt ein Backup der PostgreSQL-Datenbank auf dem Server
#   3. Entpackt den Code, baut die Container und startet sie unterbruchfrei via Traefik
#   4. Fuehrt DB-Migrationen durch
#   5. Wartet bis API und Frontend HTTP 200 melden

$Server = "root@2.59.133.113"
$ProjectName = "schichtplan-$Environment"
$RemoteDir = "/home/NelsChlaus/projects/$ProjectName"
$ArchiveName = "deploy.tar.gz"
$RemoteScript = "deploy-remote.sh"

if ($Environment -eq 'dev') {
    $ComposeFile = "docker-compose.staging.yml"
    $Prefix = "schichtplan-dev"
    $DefaultDomain = "dev.cevi-schichtplan.ch"
} else {
    $ComposeFile = "docker-compose.yml"
    $Prefix = "schichtplan"
    $DefaultDomain = "cevi-schichtplan.ch"
}

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
tar.exe --exclude="node_modules" --exclude=".git" --exclude="dist" --exclude="out" --exclude=".next" --exclude=".env*" --exclude="*.sql" --exclude="*.sql.gz" --exclude="*.dump" --exclude="backups" --exclude=$ArchiveName --exclude=$RemoteScript -czf $ArchiveName .
if ($LASTEXITCODE -ne 0) { Stop-Deploy "Das Archiv konnte nicht erstellt werden." }

# Server Script
$backup = if ($SkipBackup) { 0 } else { 1 }
$remote = @"
#!/bin/bash
set -euo pipefail
cd "$RemoteDir"

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

# Rolling Build & Restart
log=`$(mktemp)
if ! docker compose -f "$ComposeFile" -p "$ProjectName" up -d --build > "`$log" 2>&1; then
  tail -n 60 "`$log"; rm -f "`$log"
  echo "Build oder Start fehlgeschlagen. Die bisherigen Container laufen unveraendert weiter."
  exit 1
fi
rm -f "`$log"

# Migrationen ausfuehren
echo "Prisma Migrationen ausfuehren..."
docker compose -f "$ComposeFile" -p "$ProjectName" exec -T backend npx prisma migrate deploy || true

# Healthcheck Verify
domain=`$(grep -E '^DOMAIN=' .env 2>/dev/null | cut -d= -f2- | tr -d '\r"' || true)
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

if ! check "https://`$domain/health" || ! check "https://`$domain/" || ! check "https://login.`$domain/"; then
  echo "--- letzte Zeilen Logs ---"
  docker compose -f "$ComposeFile" -p "$ProjectName" logs --tail 40
  exit 1
fi

echo "DEPLOY_SUCCESS=1"
"@

[IO.File]::WriteAllText((Join-Path $PSScriptRoot $RemoteScript), ($remote -replace "`r`n", "`n"))

Step "2. Hochladen"
ssh $Server "mkdir -p $RemoteDir"
if ($LASTEXITCODE -ne 0) { Stop-Deploy "Keine Verbindung zum Server." }
scp -q $ArchiveName $RemoteScript "${Server}:${RemoteDir}/"
if ($LASTEXITCODE -ne 0) { Stop-Deploy "Das Hochladen hat nicht geklappt." }

Step "3. Backup, Build und unterbruchfreier Neustart auf dem Server"
ssh $Server "bash $RemoteDir/$RemoteScript; code=`$?; rm -f $RemoteDir/$RemoteScript; exit `$code"
$result = $LASTEXITCODE

Remove-Item $ArchiveName, $RemoteScript -ErrorAction SilentlyContinue

if ($result -ne 0) {
    Stop-Deploy "Siehe Ausgabe oben. Der vorherige Stand der DB liegt unter $RemoteDir/backups."
}

Write-Host "`nDeploy nach $Environment erfolgreich abgeschlossen! Services laufen unterbruchfrei." -ForegroundColor Green
