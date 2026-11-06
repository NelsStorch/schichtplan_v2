param (
    [ValidateSet('prod', 'dev')]
    [string]$Environment = 'prod',

    # Git-Stand (Image-Tag), auf den zurueckgesetzt wird, z. B. 5c16108 oder rollback-20261104
    [string]$Revision,

    # Zeigt nur den laufenden Stand und die verfuegbaren Image-Tags an
    [switch]$List
)

# Setzt die Dienste ohne Neubau auf einen frueheren Stand zurueck:
#   1. Prueft, dass fuer jeden Dienst ein Image mit diesem Tag auf dem Server liegt
#   2. Zeigt latest wieder auf diese Images
#   3. Tauscht die Dienste einzeln per docker rollout (unterbruchfrei, wie deploy.ps1)
#   4. Schreibt REVISION und prueft /health
#
# Die Datenbank wird NICHT angefasst: Migrationen bleiben angewendet. Das klappt, solange der
# alte Code mit dem neueren Schema laeuft (nur hinzugefuegte Spalten/Tabellen). Wurde etwas
# entfernt oder umbenannt, zuerst das Schema anpassen, siehe docs/internal/deployment.md.

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$ConfigFile = Join-Path $PSScriptRoot "deploy.config.ps1"
if (-not (Test-Path $ConfigFile)) {
    Write-Host "deploy.config.ps1 fehlt: Vorlage deploy.config.example.ps1 kopieren und ausfuellen." -ForegroundColor Red
    exit 1
}
. $ConfigFile

$ProjectName = "schichtplan-$Environment"
$RemoteDir = "$RemoteBase/$ProjectName"
$RemoteScript = "rollback-remote.sh"
if ($Environment -eq 'dev') {
    $ComposeFile = "docker-compose.staging.yml"
    $DefaultDomain = "dev.cevi-schichtplan.ch"
} else {
    $ComposeFile = "docker-compose.yml"
    $DefaultDomain = "cevi-schichtplan.ch"
}

if (-not $List -and -not $Revision) {
    Write-Host "Revision fehlt. Verfuegbare Staende anzeigen: ./rollback.ps1 -Environment $Environment -List" -ForegroundColor Red
    exit 1
}
if ($Revision -and $Revision -notmatch '^[A-Za-z0-9_.-]{1,128}$') {
    Write-Host "Ungueltiger Tag: $Revision" -ForegroundColor Red
    exit 1
}

$mode = if ($List) { "list" } else { "rollback" }
$remote = @"
#!/bin/bash
set -euo pipefail
cd "$RemoteDir"
services="backend web landing login admin hilfe"

echo "Laufender Stand ($Environment):"
if [ -f REVISION ]; then sed 's/^/  /' REVISION; else echo "  unbekannt (keine REVISION-Datei)"; fi

if [ "$mode" = "list" ]; then
  echo ""
  echo "Verfuegbare Staende (Tags des Backend-Images, neuste zuerst):"
  docker images "$ProjectName-backend" --format '{{.Tag}}  {{.CreatedAt}}' | grep -v '^latest ' | sed 's/^/  /' || true
  exit 0
fi

for service in `$services; do
  if ! docker image inspect "$ProjectName-`$service:$Revision" > /dev/null 2>&1; then
    echo "Kein Image $ProjectName-`$service:$Revision vorhanden. Nichts wurde veraendert."
    exit 1
  fi
done

# Erst alle Tags umsetzen, dann tauschen: so laufen am Ende alle Dienste auf demselben Stand
for service in `$services; do
  docker tag "$ProjectName-`$service:$Revision" "$ProjectName-`$service:latest"
done

log=`$(mktemp)
for service in `$services; do
  echo "Rollout `$service..."
  if ! docker rollout -f "$ComposeFile" -p "$ProjectName" "`$service" > "`$log" 2>&1; then
    tail -n 60 "`$log"; rm -f "`$log"
    echo "Rollout von `$service fehlgeschlagen. Bereits getauschte Dienste laufen auf $Revision."
    exit 1
  fi
done
rm -f "`$log"

{ echo "$Revision"; echo "(Rollback)"; date -Iseconds; echo "rollback"; } > REVISION

domain=`$(grep -E '^(DOMAIN|DOMAIN_DEV)=' .env 2>/dev/null | head -n1 | cut -d= -f2- | tr -d '\r"' || true)
domain=`${domain:-$DefaultDomain}
for i in `$(seq 1 30); do
  body=`$(curl -s -m 5 "https://`$domain/health" || true)
  if echo "`$body" | grep -q '"status":"ok"'; then
    echo "OK   https://`$domain/health"
    echo "`$body"
    echo "ROLLBACK_SUCCESS=1"
    exit 0
  fi
  sleep 3
done
echo "FEHLER https://`$domain/health antwortet nicht mit ok"
exit 1
"@

Set-Location $PSScriptRoot
[IO.File]::WriteAllText((Join-Path $PSScriptRoot $RemoteScript), ($remote -replace "`r`n", "`n"))
scp -q $RemoteScript "${Server}:${RemoteDir}/"
if ($LASTEXITCODE -ne 0) {
    Remove-Item $RemoteScript -ErrorAction SilentlyContinue
    Write-Host "Hochladen fehlgeschlagen." -ForegroundColor Red
    exit 1
}
ssh -n $Server "bash $RemoteDir/$RemoteScript; code=`$?; rm -f $RemoteDir/$RemoteScript; exit `$code"
$result = $LASTEXITCODE
Remove-Item $RemoteScript -ErrorAction SilentlyContinue

if ($result -ne 0) {
    Write-Host "`nROLLBACK FEHLGESCHLAGEN (siehe Ausgabe oben)." -ForegroundColor Red
    exit 1
}
if (-not $List) {
    Write-Host "`nRollback von $Environment auf $Revision abgeschlossen." -ForegroundColor Green
}
