param (
    [ValidateSet('prod', 'dev')]
    [string]$Environment = 'prod',

    # Ueberspringt das Datenbank-Dump vor dem Deployment
    [switch]$SkipBackup,

    # Nur fuer Notfaelle: Prod auch ohne gepushten Stand und gruene CI deployen
    [switch]$Force
)

# Zeichensatz auf UTF-8 festlegen fuer saubere Konsolen- und Webhook-Ausgaben
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

# Sonderzeichen per Codepoint statt als Literal: PowerShell 5.1 liest Skripte ohne BOM als ANSI
# und wuerde Emojis/Mittelpunkt sonst im Discord-Webhook als Zeichensalat ausgeben.
$IconRocket = [char]::ConvertFromUtf32(0x1F680)
$IconCross  = [char]::ConvertFromUtf32(0x274C)
$Dot        = [char]0x00B7

# Deployst den Schichtplan V2 auf den Server:
#   1. Packt das Projekt (ohne node_modules, build-output und .env-Dateien)
#   2. Erstellt ein Backup der PostgreSQL-Datenbank auf dem Server
#   3. Entpackt den Code und baut die Images (die laufenden Container bleiben unberuehrt)
#   4. Fuehrt DB-Migrationen durch: schlagen sie fehl, bricht der Deploy ab, bevor neuer Code startet
#   5. Tauscht die Dienste einzeln per docker rollout (Plugin auf dem Server, siehe docs/internal/deployment.md)
#   6. Wartet bis API und Frontend HTTP 200 melden
# Jedes Image bekommt zusaetzlich den Git-Stand als Tag (Rollback ohne Neubau: rollback.ps1),
# der laufende Stand steht in REVISION auf dem Server und unter /health im Feld revision.

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
# Eigenes Proxy-Netz pro Umgebung (nur Traefik + diese Umgebung), siehe docs/internal/infrastructure.md Abschnitt 3
$ProxyNetwork = "schichtplan_${Environment}_proxy"
$StartTime = Get-Date

function Step($text) {
    $script:CurrentStep = $text
    Write-Host "`n$text" -ForegroundColor Cyan
}

$IconHourglass = [char]::ConvertFromUtf32(0x23F3)

# Discord-Grenzen: Feldwert 1024, Beschreibung 4096 Zeichen
function Limit-Text([string]$text, [int]$max) {
    if ($text.Length -le $max) { return $text }
    return $text.Substring(0, $max - 3) + "..."
}

# Webhook-Meldung. $fields: Liste von @{ name = ...; value = ...; inline = $true/$false } (leere Werte fallen weg)
function Send-DiscordNotification($title, $description, $color = 14753096, $fields = @(), $url = $null) {
    $webhook = if ($DiscordWebhookUrl) { $DiscordWebhookUrl } else { $env:DISCORD_WEBHOOK_URL }
    if (-not $webhook) { return }

    $embed = @{
        title = $title
        description = (Limit-Text $description 4000)
        color = $color
        timestamp = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
        footer = @{
            text = "Cevi Schichtplan V2 $Dot $Environment"
        }
    }
    if ($url) { $embed.url = $url }
    $cleanFields = @($fields | Where-Object { $_ -and $_.value } | ForEach-Object {
        @{ name = $_.name; value = (Limit-Text ([string]$_.value) 1000); inline = [bool]$_.inline }
    })
    if ($cleanFields.Count -gt 0) { $embed.fields = $cleanFields }

    $payload = @{
        username = "Cevi Schichtplan Deploy"
        avatar_url = "https://status.cevi-schichtplan.ch/upload/logo.png"
        embeds = @($embed)
    } | ConvertTo-Json -Depth 6

    try {
        $bodyBytes = [System.Text.Encoding]::UTF8.GetBytes($payload)
        Invoke-RestMethod -Uri $webhook -Method Post -Body $bodyBytes -ContentType "application/json; charset=utf-8" -UserAgent "CeviSchichtplanDeploy/1.0" -TimeoutSec 5 | Out-Null
    } catch {
        # Ein Discord-Fehler soll den Deploy niemals abbrechen
    }
}

# Aktueller Schritt (fuer die Fehlermeldung) und die Ausgabe des Server-Skripts (fuer Auswertung und Fehlerdetails)
$script:CurrentStep = "Vorbereitung"
$script:RemoteOutput = @()

# Kurzinfos fuer die Meldungen: Repo-Link, wer deployt
$RepoUrl = (git remote get-url origin 2>$null) -replace '\.git$', '' -replace '^git@github\.com:', 'https://github.com/'
$DeployedBy = git config user.name 2>$null
if (-not $DeployedBy) { $DeployedBy = $env:USERNAME }

function Get-CommitLink($rev) {
    if ($RepoUrl -and $rev -match '^[0-9a-f]{7,40}$') { return "[``$rev``]($RepoUrl/commit/$rev)" }
    return "``$rev``"
}

function Stop-Deploy($text) {
    Write-Host "`nDEPLOY FEHLGESCHLAGEN: $text" -ForegroundColor Red
    # Keine Server-Adresse in der Meldung (Discord ist kein geschuetzter Ort)
    $info = "**Grund:** $text`n**Schritt:** $($script:CurrentStep)"
    if ($commit) { $info += "`n**Stand:** $commit" }
    $fields = @()
    $backupLine = $script:RemoteOutput | Where-Object { $_ -match '^Backup: ' } | Select-Object -First 1
    if ($backupLine) { $fields += @{ name = "Sicherung"; value = "``$($backupLine -replace '^Backup: ', '')``" } }
    $tail = @($script:RemoteOutput | Where-Object { $_ -and $_.Trim() } | Select-Object -Last 12) -join "`n"
    if ($tail) { $fields += @{ name = "Letzte Ausgabe"; value = "```````n$(Limit-Text $tail 950)`n``````" } }
    $fields += @{ name = "Was jetzt?"; value = "Bereits getauschte Dienste laufen auf dem neuen Stand, die uebrigen auf dem alten. Zuruecksetzen: ``.\rollback.ps1 $Environment``" }
    Send-DiscordNotification -title "$IconCross Deployment fehlgeschlagen ($Environment)" -description $info -color 15158332 -fields $fields
    Remove-Item $ArchiveName, $RemoteScript -ErrorAction SilentlyContinue
    exit 1
}

Set-Location $PSScriptRoot
Write-Host "Deploy nach $Environment ($RemoteDir auf $Server)" -ForegroundColor Cyan

# Pruefe uncommitted Dateien
$commit = git log --oneline -1 2>$null
$dirty = @(git status --porcelain 2>$null)
if ($commit) { Write-Host "Stand: $commit" }
# Git-Stand fuer Image-Tags, REVISION und /health. Mit uncommitteten Dateien eindeutig markiert.
$revision = git rev-parse --short HEAD 2>$null
if (-not $revision) { $revision = "unknown" }
$revisionFull = git rev-parse HEAD 2>$null
if (-not $revisionFull) { $revisionFull = "unknown" }
if ($dirty.Count -gt 0) { $revision = "$revision-dirty-$(Get-Date -Format yyyyMMddHHmmss)" }
Write-Host "Revision: $revision"
if ($dirty.Count -gt 0) {
    Write-Host "Achtung: $($dirty.Count) Datei(en) sind nicht committet und gehen trotzdem mit:" -ForegroundColor Yellow
    $dirty | Select-Object -First 8 | ForEach-Object { Write-Host "  $_" -ForegroundColor Yellow }
}

# Prod nur mit einem Stand, den die CI geprueft hat (Lint, Typen, Tests inkl. Datenbank, Builds):
# alles committet, auf main, gepusht, der CI-Lauf fuer genau diesen Commit ist gruen und er lief schon auf Dev.
# Dev bleibt frei zum Ausprobieren. Notfall: -Force (wird in Discord vermerkt).
function Test-ProdReady {
    if ($dirty.Count -gt 0) { return "Es gibt nicht committete Dateien." }
    $branch = git rev-parse --abbrev-ref HEAD 2>$null
    if ($branch -ne 'main') { return "Prod wird nur von main deployt (aktuell: $branch)." }
    git fetch --quiet origin main 2>$null
    if ($LASTEXITCODE -ne 0) { return "git fetch origin main ist fehlgeschlagen." }
    $remote = git rev-parse origin/main 2>$null
    if ($remote -ne $revisionFull) { return "Der Stand ist nicht gepusht oder nicht aktuell (origin/main: $($remote.Substring(0, [Math]::Min(7, "$remote".Length))))." }
    if (-not (Get-Command gh -ErrorAction SilentlyContinue)) { return "GitHub CLI (gh) fehlt, die CI laesst sich nicht pruefen." }
    $runsJson = gh run list --workflow CI --commit $revisionFull --event push --json status,conclusion,url --limit 5 2>$null
    if ($LASTEXITCODE -ne 0 -or -not $runsJson) { return "Die CI-Laeufe konnten nicht abgefragt werden (gh auth status?)." }
    $runs = @($runsJson | ConvertFrom-Json)
    if ($runs.Count -eq 0) { return "Fuer diesen Commit gibt es keinen CI-Lauf." }
    $run = $runs[0]
    if ($run.status -ne 'completed') { return "Die CI laeuft noch ($($run.url)). Bitte warten, bis sie gruen ist." }
    if ($run.conclusion -ne 'success') { return "Die CI ist nicht gruen ($($run.conclusion), $($run.url))." }
    Write-Host "CI gruen fuer $revision ($($run.url))" -ForegroundColor Green

    # Genau dieser Stand muss vorher auf Dev deployt worden sein (dort als Kurz-Hash in .revisions vermerkt)
    $devRevisions = @(ssh -n $Server "cat $RemoteBase/schichtplan-dev/.revisions 2>/dev/null")
    if ($LASTEXITCODE -ne 0) { return "Die Dev-Staende auf dem Server konnten nicht gelesen werden." }
    if ($devRevisions -notcontains $revision) {
        return "Dieser Stand ($revision) lief noch nie auf Dev. Zuerst .\deploy.ps1 dev und dort pruefen."
    }
    $devCurrent = "$(ssh -n $Server "head -n 1 $RemoteBase/schichtplan-dev/REVISION 2>/dev/null")".Trim()
    if ($devCurrent -ne $revision) {
        Write-Host "Hinweis: Auf Dev laeuft gerade $devCurrent, $revision war dort aber schon deployt." -ForegroundColor Yellow
    }
    Write-Host "Auf Dev deployt: $revision" -ForegroundColor Green
    return $null
}

if ($Environment -eq 'prod') {
    $problem = Test-ProdReady
    if ($problem) {
        if ($Force) {
            Write-Host "ACHTUNG -Force: $problem Deploy laeuft trotzdem." -ForegroundColor Yellow
            Send-DiscordNotification -title "Prod-Deploy mit -Force" -description "**Grund fuer die Sperre:** $problem`n**Stand:** $commit" -color 15105570
        } else {
            Write-Host "`nProd-Deploy gestoppt: $problem" -ForegroundColor Red
            Write-Host "Erst pushen, die CI abwarten und auf Dev deployen. Nur im Notfall: .\deploy.ps1 prod -Force" -ForegroundColor Red
            exit 1
        }
    }
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
  echo "Docker-Netz $ProxyNetwork fehlt. Anlegen: docker network create $ProxyNetwork (und Traefik damit verbinden, siehe docs/internal/infrastructure.md)"
  exit 1
fi
if ! docker network inspect "$ProxyNetwork" --format '{{range .Containers}}{{.Name}}{{println}}{{end}}' | grep -qx traefik; then
  echo "Traefik ist nicht mit $ProxyNetwork verbunden: docker network connect $ProxyNetwork traefik (und im Proxy-Compose eintragen)"
  exit 1
fi
if ! docker rollout --version > /dev/null 2>&1; then
  echo "Das Docker-Plugin rollout fehlt auf dem Server (siehe docs/internal/deployment.md)"
  exit 1
fi

compose() { docker compose -f "$ComposeFile" -p "$ProjectName" "`$@"; }
services="backend web landing login admin hilfe"
# Landet als Build-Argument im Backend-Image (/health) und als Tag auf allen Images
export APP_REVISION="$revision"

if [ "$backup" = "1" ]; then
  if docker ps --format '{{.Names}}' | grep -qx "$Prefix-db"; then
    mkdir -p backups
    file="backups/pre-deploy-`$(date +%Y%m%d-%H%M%S).sql.gz"
    docker exec "$Prefix-db" sh -c 'pg_dump -U "`$POSTGRES_USER" "`$POSTGRES_DB"' | gzip > "`$file"
    [ -s "`$file" ] || { echo "Backup ist leer"; exit 1; }
    echo "Backup: `$file (`$(du -h "`$file" | cut -f1))"
    ls -1t backups/pre-deploy-*.sql.gz | tail -n +11 | xargs -r rm --
    # Hoechstens 40 Tage aufbewahren (Datenschutzerklaerung): geloeschte Konten nicht unbegrenzt in alten Dumps
    find backups -maxdepth 1 -name 'pre-deploy-*.sql.gz' -mtime +40 -delete
  else
    echo "Keine laufende Datenbank gefunden, kein Backup (erster Deploy?)"
  fi
else
  echo "Backup uebersprungen"
fi

rm -rf apps packages hilfe
tar --warning=no-unknown-keyword -xzf "$ArchiveName"
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

# Bauen: die laufenden Container bleiben dabei unberuehrt
echo "Docker Images werden gebaut (das kann 1-2 Minuten dauern)..."
log=`$(mktemp)
if ! compose build > "`$log" 2>&1; then
  tail -n 60 "`$log"; rm -f "`$log"
  echo "Build fehlgeschlagen. Die bisherigen Container laufen unveraendert weiter."
  exit 1
fi
rm -f "`$log"

# Jeden Stand zusaetzlich unter seinem Git-Stand ablegen: rollback.ps1 setzt ihn ohne Neubau wieder ein
for service in `$services; do
  docker tag "$ProjectName-`$service:latest" "$ProjectName-`$service:$revision"
done
echo "Images getaggt: $revision"

# Die DB startet nur neu, wenn sich ihre Konfiguration geaendert hat
compose up -d --no-build --wait db

# Migrationen vor dem Tausch, im neuen Image: neuer Code findet sein Schema immer schon vor.
# Darum muessen Migrationen auch mit dem alten Code laufen, der noch bis zum Rollout aktiv ist.
# Das Label haelt den Einmal-Container von Traefik fern (run uebernimmt die Labels des Dienstes).
echo "Prisma Migrationen ausfuehren..."
if ! compose run --rm --no-deps -T --label traefik.enable=false backend npx prisma migrate deploy; then
  echo "Migration fehlgeschlagen, neuer Code wurde nicht gestartet. Die bisherigen Container laufen weiter."
  exit 1
fi
# Kein Seed auf dem Server: Demo-Daten (npm run db:seed) sind nur fuer die lokale Entwicklung

# Dienste einzeln tauschen: der neue Container uebernimmt, sobald er gesund ist, erst dann geht der alte.
# Wird er nicht gesund, bleibt der alte stehen und der Deploy bricht hier ab.
for service in `$services; do
  echo "Rollout `$service..."
  if ! docker rollout -f "$ComposeFile" -p "$ProjectName" "`$service" > "`$log" 2>&1; then
    tail -n 60 "`$log"; rm -f "`$log"
    echo "Rollout von `$service fehlgeschlagen. `$service laeuft weiter auf dem alten Stand, bereits getauschte Dienste auf dem neuen."
    exit 1
  fi
  rm -f "`$log"
done

# Laufenden Stand festhalten (Zeile 1 Kurz-Hash/Tag, Zeile 2 voller Hash, Zeile 3 Zeitpunkt, Zeile 4 Art)
{ echo "$revision"; echo "$revisionFull"; date -Iseconds; echo "deploy"; } > REVISION

# Die 7 zuletzt deployten Staende behalten. Die Reihenfolge steht in .revisions (neuster zuletzt), nicht im
# Erstellungsdatum der Images: unveraenderte Dienste teilen sich ein Image, dort ist die Docker-Sortierung zufaellig.
# Von Hand gesetzte Tags (z. B. rollback-*) passen nicht auf das Muster und bleiben unberuehrt.
{ grep -vxF "$revision" .revisions 2>/dev/null || true; echo "$revision"; } | tail -n 7 > .revisions.tmp
mv .revisions.tmp .revisions
for service in `$services; do
  docker images "$ProjectName-`$service" --format '{{.Tag}}' \
    | grep -E '^[0-9a-f]{7,40}(-dirty-[0-9]{14})?$' | grep -vxF -f .revisions \
    | xargs -r -I{} docker rmi "$ProjectName-`$service:{}" > /dev/null 2>&1 || true
done

# Altes Netz (vor der Segmentierung) aufraeumen, sobald es leer ist
docker network rm "$LegacyNetwork" > /dev/null 2>&1 || true

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

# Admin-Portal und Hilfe: kein harter Fehler, damit ein fehlender DNS-Eintrag den restlichen Deploy nicht kippt
check "https://admin.`$domain/" || echo "WARNUNG: admin.`$domain nicht erreichbar (DNS oder Zertifikat noch in Arbeit?)"
check "https://hilfe.`$domain/" || echo "WARNUNG: hilfe.`$domain nicht erreichbar (DNS oder Zertifikat noch in Arbeit?)"

echo "DEPLOY_SUCCESS=1"
"@

[IO.File]::WriteAllText((Join-Path $PSScriptRoot $RemoteScript), ($remote -replace "`r`n", "`n"))

Step "2. Hochladen"
ssh -n $Server "mkdir -p $RemoteDir"
if ($LASTEXITCODE -ne 0) { Stop-Deploy "Keine Verbindung zum Server." }
# Bisher laufender Stand (fuer die Liste der Aenderungen und den Rollback-Hinweis)
$previousRevision = "$(ssh -n $Server "head -n 1 $RemoteDir/REVISION 2>/dev/null")".Trim()
scp -q $ArchiveName $RemoteScript "${Server}:${RemoteDir}/"
if ($LASTEXITCODE -ne 0) { Stop-Deploy "Das Hochladen hat nicht geklappt." }

# Aenderungen seit dem bisherigen Stand (nur wenn er ein bekannter Commit ist)
$changes = @()
$previousCommit = $previousRevision -replace '-dirty-\d+$', ''
if ($previousCommit -match '^[0-9a-f]{7,40}$') {
    git cat-file -e "$previousCommit^{commit}" 2>$null
    if ($LASTEXITCODE -eq 0) {
        $changes = @(git log --format="%h %s" "$previousCommit..HEAD" 2>$null)
    }
}
$compareUrl = if ($RepoUrl -and $previousCommit -match '^[0-9a-f]{7,40}$' -and $previousCommit -ne $revision) {
    "$RepoUrl/compare/$previousCommit...$($revisionFull)"
} else { $null }

if ($Environment -eq 'prod') {
    # Vorab melden, damit niemand gleichzeitig deployt
    $startInfo = "**Von** $(Get-CommitLink $previousCommit) **auf** $(Get-CommitLink ($revision -replace '-dirty-\d+$', ''))`n**Durch:** $DeployedBy $Dot $($changes.Count) Commit(s)"
    Send-DiscordNotification -title "$IconHourglass Deployment gestartet ($Environment)" -description $startInfo -color 3447003 -url $compareUrl
}

Step "3. Backup, Build und unterbruchfreier Neustart auf dem Server"
# Ausgabe anzeigen und zugleich festhalten (fuer Migrationen, Sicherung, Warnungen und Fehlerdetails)
ssh -n $Server "bash $RemoteDir/$RemoteScript; code=`$?; rm -f $RemoteDir/$RemoteScript; exit `$code" | Tee-Object -Variable remoteLines | Out-Host
$result = $LASTEXITCODE
$script:RemoteOutput = @($remoteLines | ForEach-Object { "$_" })

Remove-Item $ArchiveName, $RemoteScript -ErrorAction SilentlyContinue

if ($result -ne 0) {
    $reason = $script:RemoteOutput | Where-Object { $_ -match 'fehlgeschlagen|FEHLER' } | Select-Object -Last 1
    if (-not $reason) { $reason = "Das Skript auf dem Server ist mit Code $result abgebrochen." }
    Stop-Deploy $reason
}

$duration = [Math]::Round(((Get-Date) - $StartTime).TotalSeconds)
Write-Host "`nDeploy nach $Environment erfolgreich abgeschlossen! Services laufen unterbruchfrei." -ForegroundColor Green

$durationText = if ($duration -ge 60) { "{0} min {1} s" -f [Math]::Floor($duration / 60), ($duration % 60) } else { "$duration s" }
$deployInfo = "**Stand:** $(Get-CommitLink ($revision -replace '-dirty-\d+$', '')) $($commit -replace '^[0-9a-f]+ ', '')"
if ($dirty.Count -gt 0) {
    $deployInfo += "`n**Achtung:** $($dirty.Count) nicht committete Datei(en) mitgeliefert (``$revision``)"
}
$deployInfo += "`nhttps://$DefaultDomain $Dot unterbruchfrei online"

$fields = @()
if ($changes.Count -gt 0) {
    # Ganze Zeilen (je hoechstens 80 Zeichen), bis das Feld voll ist; der Rest als Zahl (Discord: 1024 Zeichen)
    $list = ""
    $shownCount = 0
    foreach ($change in $changes) {
        $line = "- " + (Limit-Text $change 80)
        if (($list.Length + $line.Length + 40) -gt 1000) { break }
        $list += $(if ($list) { "`n" } else { "" }) + $line
        $shownCount++
    }
    if ($shownCount -lt $changes.Count) { $list += "`n... und $($changes.Count - $shownCount) weitere (Link oben)" }
    $fields += @{ name = "Neu seit $previousCommit ($($changes.Count))"; value = $list }
} elseif ($previousCommit -eq ($revision -replace '-dirty-\d+$', '')) {
    $fields += @{ name = "Aenderungen"; value = "Gleicher Stand wie bisher (erneut deployt)" }
}
$migrations = @($script:RemoteOutput | ForEach-Object { if ($_ -match 'Applying migration `([^`]+)`') { "- ``$($Matches[1])``" } })
$fields += @{ name = "Migrationen"; value = $(if ($migrations.Count -gt 0) { $migrations -join "`n" } else { "keine" }); inline = $true }
$backupLine = $script:RemoteOutput | Where-Object { $_ -match '^Backup: ' } | Select-Object -First 1
$fields += @{ name = "Sicherung"; value = $(if ($backupLine) { "``$($backupLine -replace '^Backup: ', '')``" } else { "uebersprungen" }); inline = $true }
$fields += @{ name = "Dauer"; value = $durationText; inline = $true }
$fields += @{ name = "Durch"; value = $DeployedBy; inline = $true }
$warnings = @($script:RemoteOutput | Where-Object { $_ -match '^WARNUNG' })
if ($warnings.Count -gt 0) { $fields += @{ name = "Warnungen"; value = ($warnings -join "`n") } }
if ($previousCommit -match '^[0-9a-f]{7,40}$' -and $previousCommit -ne ($revision -replace '-dirty-\d+$', '')) {
    $fields += @{ name = "Zurueck auf den alten Stand"; value = "``.\rollback.ps1 $Environment -Revision $previousCommit``" }
}

$color = if ($warnings.Count -gt 0) { 15105570 } else { 3066993 }
Send-DiscordNotification -title "$IconRocket Deployment erfolgreich ($Environment)" -description $deployInfo -color $color -fields $fields -url $compareUrl
