param (
    [ValidateSet('prod', 'dev')]
    [string]$Environment = 'prod',

    # Git-Stand (Image-Tag), auf den zurueckgesetzt wird, z. B. 5c16108 oder rollback-20261104
    [string]$Revision,

    # Zeigt nur den laufenden Stand und die verfuegbaren Image-Tags an
    [switch]$List,

    # Warum zurueckgesetzt wird (erscheint in der Discord-Meldung)
    [string]$Reason,

    # Auch hinter eine Migration zuruecksetzen, die Spalten oder Tabellen loescht (der alte Code bricht dann!)
    [switch]$Force
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

$Dot = [char]0x00B7
$IconRewind = [char]::ConvertFromUtf32(0x23EA)
$IconCross = [char]::ConvertFromUtf32(0x274C)
$RepoUrl = (git -C $PSScriptRoot remote get-url origin 2>$null) -replace '\.git$', '' -replace '^git@github\.com:', 'https://github.com/'
$RolledBackBy = git -C $PSScriptRoot config user.name 2>$null
if (-not $RolledBackBy) { $RolledBackBy = $env:USERNAME }

# Discord-Meldung wie in deploy.ps1 (gleiche Webhook-Einstellung); Fehler brechen nie den Rollback ab
function Send-DiscordNotification($title, $description, $color, $fields = @()) {
    $webhook = if ($DiscordWebhookUrl) { $DiscordWebhookUrl } else { $env:DISCORD_WEBHOOK_URL }
    if (-not $webhook) { return }
    $embed = @{
        title = $title
        description = $description
        color = $color
        timestamp = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
        footer = @{ text = "Cevi Schichtplan V2 $Dot $Environment" }
    }
    $clean = @($fields | Where-Object { $_ -and $_.value } | ForEach-Object {
        $v = [string]$_.value; if ($v.Length -gt 1000) { $v = $v.Substring(0, 997) + "..." }
        @{ name = $_.name; value = $v; inline = [bool]$_.inline }
    })
    if ($clean.Count -gt 0) { $embed.fields = $clean }
    $payload = @{ username = "Cevi Schichtplan Deploy"; avatar_url = "https://status.cevi-schichtplan.ch/upload/logo.png"; embeds = @($embed) } | ConvertTo-Json -Depth 6
    try {
        Invoke-RestMethod -Uri $webhook -Method Post -Body ([System.Text.Encoding]::UTF8.GetBytes($payload)) -ContentType "application/json; charset=utf-8" -UserAgent "CeviSchichtplanDeploy/1.0" -TimeoutSec 5 | Out-Null
    } catch { }
}

function Get-CommitLink($rev) {
    if ($RepoUrl -and $rev -match '^[0-9a-f]{7,40}$') { return "[``$rev``]($RepoUrl/commit/$rev)" }
    return "``$rev``"
}

# Migrationen, die Spalten oder Tabellen loeschen und im Ziel-Stand noch fehlen: Der alte Code fragt das
# Geloeschte ab (Prisma liest alle Spalten) und bricht. Gibt die Namen zurueck; leer = unbedenklich.
function Get-DestructiveMigrationsAfter($rev) {
    $dir = 'apps/backend/prisma/migrations'
    git -C $PSScriptRoot cat-file -e "$rev^{commit}" 2>$null
    if ($LASTEXITCODE -ne 0) { return $null }  # kein Git-Stand (z. B. rollback-Tag): nicht pruefbar
    $found = @()
    foreach ($m in (Get-ChildItem (Join-Path $PSScriptRoot $dir) -Directory | Sort-Object Name)) {
        $sql = Join-Path $m.FullName 'migration.sql'
        if (-not (Test-Path $sql)) { continue }
        if (-not (Select-String -Path $sql -Pattern 'DROP\s+(COLUMN|TABLE)' -Quiet)) { continue }
        git -C $PSScriptRoot cat-file -e "${rev}:$dir/$($m.Name)/migration.sql" 2>$null
        if ($LASTEXITCODE -ne 0) { $found += $m.Name }
    }
    return ,$found
}

if (-not $List) {
    $destructive = Get-DestructiveMigrationsAfter ($Revision -replace '-dirty-\d+$', '')
    if ($null -eq $destructive) {
        Write-Host "Achtung: $Revision ist kein Git-Stand, ob er zum aktuellen Datenbankschema passt, laesst sich nicht pruefen." -ForegroundColor Yellow
    } elseif ($destructive.Count -gt 0) {
        $list = $destructive -join ', '
        if ($Force) {
            Write-Host "ACHTUNG -Force: $Revision kennt die geloeschten Spalten/Tabellen aus $list noch. Der alte Code wird Fehler werfen." -ForegroundColor Yellow
        } else {
            Write-Host "Rollback gestoppt: Nach $Revision kamen Migrationen, die Spalten oder Tabellen loeschen ($list)." -ForegroundColor Red
            Write-Host "Der alte Code fragt sie noch ab und wuerde bei jeder Anfrage scheitern. Nur mit -Force, wenn das Schema vorher zurueckgebaut ist." -ForegroundColor Red
            exit 1
        }
    }
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
  echo "Verfuegbare Staende (zuletzt deployt zuerst):"
  if [ -f .revisions ]; then
    tac .revisions | while read -r tag; do
      missing=""
      for service in `$services; do
        docker image inspect "$ProjectName-`$service:`$tag" > /dev/null 2>&1 || missing="`$missing `$service"
      done
      if [ -z "`$missing" ]; then echo "  `$tag"; else echo "  `$tag  (unvollstaendig, fehlt:`$missing)"; fi
    done
  else
    echo "  (noch keine .revisions, erst nach dem naechsten Deploy)"
  fi
  others=`$(docker images "$ProjectName-backend" --format '{{.Tag}}' | grep -vE '^(latest|[0-9a-f]{7,40}(-dirty-[0-9]{14})?)$' || true)
  if [ -n "`$others" ]; then
    echo "Von Hand gesetzte Tags:"
    echo "`$others" | sed 's/^/  /'
  fi
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
$previousRevision = if ($List) { "" } else { "$(ssh -n $Server "head -n 1 $RemoteDir/REVISION 2>/dev/null")".Trim() }
$startTime = Get-Date
ssh -n $Server "bash $RemoteDir/$RemoteScript; code=`$?; rm -f $RemoteDir/$RemoteScript; exit `$code" | Tee-Object -Variable remoteLines | Out-Host
$result = $LASTEXITCODE
Remove-Item $RemoteScript -ErrorAction SilentlyContinue
if ($List) { exit $result }

$duration = [Math]::Round(((Get-Date) - $startTime).TotalSeconds)
$fields = @(
    @{ name = "Durch"; value = $RolledBackBy; inline = $true },
    @{ name = "Dauer"; value = "$duration s"; inline = $true },
    @{ name = "Grund"; value = $(if ($Reason) { $Reason } else { "nicht angegeben (-Reason)" }) },
    @{ name = "Datenbank"; value = "Unveraendert: Migrationen bleiben angewendet." }
)
$info = "**Von** $(Get-CommitLink $previousRevision) **zurueck auf** $(Get-CommitLink $Revision)`nhttps://$DefaultDomain"

if ($result -ne 0) {
    Write-Host "`nROLLBACK FEHLGESCHLAGEN (siehe Ausgabe oben)." -ForegroundColor Red
    $tail = @($remoteLines | ForEach-Object { "$_" } | Where-Object { $_.Trim() } | Select-Object -Last 12) -join "`n"
    if ($tail) { $fields += @{ name = "Letzte Ausgabe"; value = "```````n$tail`n``````" } }
    Send-DiscordNotification -title "$IconCross Rollback fehlgeschlagen ($Environment)" -description $info -color 15158332 -fields $fields
    exit 1
}
Write-Host "`nRollback von $Environment auf $Revision abgeschlossen." -ForegroundColor Green
Send-DiscordNotification -title "$IconRewind Rollback ($Environment)" -description $info -color 15105570 -fields $fields
