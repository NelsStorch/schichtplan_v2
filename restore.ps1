param (
    # dev oder prod; ohne Angabe wird gefragt
    [ValidateSet('', 'prod', 'dev')]
    [string]$Environment = '',

    # Dateiname der Sicherung (z. B. pre-deploy-20261108-163739.sql.gz); ohne Angabe Auswahlliste
    [string]$Backup,

    # Warum wiederhergestellt wird (erscheint in Discord); ohne Angabe wird gefragt
    [string]$Reason,

    # Nur die Sicherungen anzeigen
    [switch]$List,

    # Bestaetigung ohne Rueckfrage (fuer Skripte): muss genau dem verlangten Text entsprechen
    [string]$ConfirmText
)

# Spielt eine Datenbank-Sicherung wieder ein (Daten zurueck auf den Stand der Sicherung).
# Unterschied zu rollback.ps1: Rollback setzt den CODE zurueck und laesst die Daten, Restore setzt die
# DATEN zurueck. Alles, was nach der Sicherung geschrieben wurde, ist danach weg.
#
# Ablauf (Serverteil: scripts/restore-remote.sh):
#   1. Sicherung pruefen (unbeschaedigt, vollstaendig)
#   2. Aktuellen Stand sichern (backups/pre-restore-*.sql.gz), damit man zurueck kann
#   3. Probelauf in einer Wegwerf-DB; schlaegt er fehl, wird nichts veraendert
#   4. Dienste anhalten, Schema leeren, einspielen, Dienste starten (kurzer Unterbruch)
#   5. /health pruefen; schlaegt das Einspielen fehl, wird der gesicherte Stand zurueckgespielt
# Meldungen gehen an denselben Discord-Webhook wie deploy.ps1 (Start und Ergebnis).

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$ConfigFile = Join-Path $PSScriptRoot "deploy.config.ps1"
if (-not (Test-Path $ConfigFile)) {
    Write-Host "deploy.config.ps1 fehlt: Vorlage deploy.config.example.ps1 kopieren und ausfuellen." -ForegroundColor Red
    exit 1
}
. $ConfigFile

$Dot = [char]0x00B7
$IconRestore = [char]::ConvertFromUtf32(0x1F5C4)
$IconCheck = [char]::ConvertFromUtf32(0x2705)
$IconCross = [char]::ConvertFromUtf32(0x274C)
$RestoredBy = git -C $PSScriptRoot config user.name 2>$null
if (-not $RestoredBy) { $RestoredBy = $env:USERNAME }

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

function Ask($prompt) {
    Write-Host -NoNewline "$prompt "
    return (Read-Host).Trim()
}

# --- Umgebung
if (-not $Environment) {
    Write-Host "Welche Umgebung wiederherstellen?" -ForegroundColor Cyan
    Write-Host "  1) dev"
    Write-Host "  2) prod"
    $choice = Ask "Auswahl (1/2):"
    $Environment = switch ($choice) { '1' { 'dev' } '2' { 'prod' } default { '' } }
    if (-not $Environment) { Write-Host "Abgebrochen." -ForegroundColor Yellow; exit 1 }
}

$ProjectName = "schichtplan-$Environment"
$RemoteDir = "$RemoteBase/$ProjectName"
if ($Environment -eq 'dev') {
    $DbContainer = "schichtplan-dev-db"
    $Domain = "dev.cevi-schichtplan.ch"
    $ComposeFile = "docker-compose.staging.yml"
} else {
    $DbContainer = "schichtplan-db"
    $Domain = "cevi-schichtplan.ch"
    $ComposeFile = "docker-compose.yml"
}
$RemoteScript = "restore-remote-$([guid]::NewGuid().ToString('N').Substring(0, 8)).sh"

function Invoke-Remote([string]$arguments) {
    ssh -n $Server "bash $RemoteDir/$RemoteScript $RemoteDir $ProjectName $DbContainer $Domain $arguments"
}

# Serverteil hochladen (LF-Zeilenenden, sonst bricht bash)
$localScript = Join-Path $env:TEMP $RemoteScript
[IO.File]::WriteAllText($localScript, ((Get-Content (Join-Path $PSScriptRoot "scripts/restore-remote.sh") -Raw) -replace "`r`n", "`n"))
scp -q $localScript "${Server}:${RemoteDir}/$RemoteScript"
Remove-Item $localScript -ErrorAction SilentlyContinue
if ($LASTEXITCODE -ne 0) { Write-Host "Keine Verbindung zum Server." -ForegroundColor Red; exit 1 }
function Remove-RemoteScript { ssh -n $Server "rm -f $RemoteDir/$RemoteScript" | Out-Null }

# --- Sicherung waehlen
$backups = @(Invoke-Remote "list" | Where-Object { $_ -match '\|' } | ForEach-Object {
    $p = $_ -split '\|'
    [pscustomobject]@{
        Name = $p[0]
        Size = $p[1]
        Time = [DateTimeOffset]::FromUnixTimeSeconds([long]$p[2]).ToLocalTime().DateTime
    }
})
if ($backups.Count -eq 0) { Write-Host "Keine Sicherungen auf $Environment gefunden." -ForegroundColor Red; Remove-RemoteScript; exit 1 }

if ($List -or -not $Backup) {
    Write-Host "`nSicherungen auf $Environment (neueste zuerst):" -ForegroundColor Cyan
    for ($i = 0; $i -lt $backups.Count; $i++) {
        $b = $backups[$i]
        $kind = if ($b.Name -like 'pre-restore-*') { "vor einem Restore" } elseif ($b.Name -like 'pre-deploy-*') { "vor einem Deploy" } else { "" }
        Write-Host ("  {0,2}) {1}  {2,6}  {3:dd.MM.yyyy HH:mm}  {4}" -f ($i + 1), $b.Name, $b.Size, $b.Time, $kind)
    }
    if ($List) { Remove-RemoteScript; exit 0 }
    $pick = Ask "`nWelche Sicherung einspielen? (Nummer, Enter = abbrechen):"
    $index = 0
    if (-not [int]::TryParse($pick, [ref]$index) -or $index -lt 1 -or $index -gt $backups.Count) {
        Write-Host "Abgebrochen." -ForegroundColor Yellow; Remove-RemoteScript; exit 1
    }
    $Backup = $backups[$index - 1].Name
}
$selected = $backups | Where-Object Name -eq $Backup | Select-Object -First 1
if (-not $selected) { Write-Host "Sicherung $Backup gibt es auf $Environment nicht." -ForegroundColor Red; Remove-RemoteScript; exit 1 }

# --- Grund und Bestaetigung
if (-not $Reason) { $Reason = Ask "Grund (erscheint in Discord):" }
if (-not $Reason) { $Reason = "nicht angegeben" }

$lost = "{0:dd.MM.yyyy HH:mm}" -f $selected.Time
Write-Host ""
Write-Host "ACHTUNG: Die Datenbank von $Environment wird auf den Stand vom $lost zurueckgesetzt." -ForegroundColor Yellow
Write-Host "Alles, was seither geschrieben wurde (Eintragungen, Konten, Anlaesse ...), geht verloren." -ForegroundColor Yellow
Write-Host "Der aktuelle Stand wird vorher gesichert. Die Dienste sind kurz nicht erreichbar." -ForegroundColor Yellow
# Prod: den Namen der Sicherung eintippen (wie beim Loeschen eines Anlasses), Dev: "ja"
$expected = if ($Environment -eq 'prod') { $selected.Name } else { 'ja' }
$answer = if ($ConfirmText) { $ConfirmText } else { Ask "Zum Bestaetigen '$expected' eintippen:" }
if ($answer -ne $expected) { Write-Host "Nicht bestaetigt, nichts wurde veraendert." -ForegroundColor Yellow; Remove-RemoteScript; exit 1 }

# --- Wiederherstellen
$startInfo = "**Sicherung:** ``$($selected.Name)`` ($($selected.Size), Stand $lost)`n**Durch:** $RestoredBy $Dot **Grund:** $Reason"
Send-DiscordNotification -title "$IconRestore Restore gestartet ($Environment)" -description $startInfo -color 3447003

$startTime = Get-Date
Invoke-Remote "restore $($selected.Name)" | Tee-Object -Variable lines | Out-Host
$result = $LASTEXITCODE
$out = @($lines | ForEach-Object { "$_" })
$duration = [Math]::Round(((Get-Date) - $startTime).TotalSeconds)
Remove-RemoteScript

function Get-Value($prefix) { ($out | Where-Object { $_ -like "${prefix}*" } | Select-Object -Last 1) -replace "^${prefix}\s*", '' }
$safety = Get-Value 'SAFETY:'
$live = Get-Value 'LIVE:'
$restored = Get-Value 'RESTORED:'
$downtime = Get-Value 'DOWNTIME:'

$fields = @(
    @{ name = "Sicherung"; value = "``$($selected.Name)`` (Stand $lost)" },
    @{ name = "Vorher gesichert"; value = $(if ($safety) { "``$safety``" } else { $null }) },
    @{ name = "Vorher"; value = $live; inline = $true },
    @{ name = "Nachher"; value = $restored; inline = $true },
    @{ name = "Unterbruch"; value = $(if ($downtime) { "$downtime s" } else { $null }); inline = $true },
    @{ name = "Dauer"; value = "$duration s"; inline = $true },
    @{ name = "Durch"; value = $RestoredBy; inline = $true },
    @{ name = "Grund"; value = $Reason }
)

if ($result -ne 0) {
    $reasonLine = $out | Where-Object { $_ -match '^FEHLER' } | Select-Object -Last 1
    $recovered = Get-Value 'RECOVERED:'
    $tail = @($out | Where-Object { $_.Trim() } | Select-Object -Last 10) -join "`n"
    $fields += @{ name = "Letzte Ausgabe"; value = "```````n$tail`n``````" }
    if ($recovered) { $fields += @{ name = "Zurueckgespielt"; value = "Der gesicherte Stand ``$recovered`` wurde wieder eingespielt." } }
    Write-Host "`nRESTORE FEHLGESCHLAGEN: $reasonLine" -ForegroundColor Red
    Send-DiscordNotification -title "$IconCross Restore fehlgeschlagen ($Environment)" -description "**Grund:** $reasonLine`nhttps://$Domain" -color 15158332 -fields $fields
    exit 1
}

Write-Host "`nRestore von $Environment auf $($selected.Name) abgeschlossen." -ForegroundColor Green
Send-DiscordNotification -title "$IconCheck Restore erfolgreich ($Environment)" -description "Datenbank auf den Stand vom $lost zurueckgesetzt.`nhttps://$Domain" -color 3066993 -fields $fields

# Die Sicherung ist aelter als das laufende Schema? Dann erwartet der Code Migrationen, die fehlen.
$liveMig = if ($live -match 'migrations=(\d+)') { [int]$Matches[1] } else { -1 }
$restoredMig = if ($restored -match 'migrations=(\d+)') { [int]$Matches[1] } else { -1 }
if ($liveMig -gt $restoredMig -and $restoredMig -ge 0) {
    Write-Host "`nDie Sicherung hat $restoredMig Migrationen, der laufende Code erwartet $liveMig." -ForegroundColor Yellow
    Write-Host "Entweder die fehlenden Migrationen nachziehen oder den Code mit rollback.ps1 passend zuruecksetzen." -ForegroundColor Yellow
    $run = if ($ConfirmText) { 'n' } else { Ask "Fehlende Migrationen jetzt nachziehen? (j/n):" }
    if ($run -eq 'j') {
        ssh -n $Server "cd $RemoteDir && docker compose -f $ComposeFile -p $ProjectName run --rm --no-deps -T --label traefik.enable=false backend npx prisma migrate deploy"
        if ($LASTEXITCODE -eq 0) { Write-Host "Migrationen nachgezogen." -ForegroundColor Green } else { Write-Host "Migrationen fehlgeschlagen." -ForegroundColor Red }
    }
}
