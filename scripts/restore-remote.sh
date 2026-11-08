#!/bin/bash
# Serverteil von restore.ps1 (wird hochgeladen, ausgefuehrt und wieder geloescht).
#
#   restore-remote.sh <projektordner> <projektname> <db-container> <domain> list
#   restore-remote.sh <projektordner> <projektname> <db-container> <domain> restore <sicherung>
#
# restore: prueft die Sicherung, sichert den aktuellen Stand, spielt die Sicherung zuerst in eine
# Wegwerf-DB ein (Probelauf), haelt die Dienste an, leert das Schema, spielt ein, startet die Dienste
# und prueft /health. Schlaegt das Einspielen fehl, wird automatisch der gesicherte Stand zurueckgespielt.
# Zeilen mit festem Praefix (SAFETY:, PROBE:, RESTORED:, ...) wertet restore.ps1 fuer die Meldungen aus.
set -euo pipefail

dir="$1"; project="$2"; db="$3"; domain="$4"; mode="$5"; backup="${6:-}"
cd "$dir"

# Hinweise wie «existiert nicht, uebersprungen» unterdruecken (PowerShell zeigt sie sonst als Fehler)
psql_db() { docker exec -i -e PGOPTIONS="-c client_min_messages=warning" "$db" sh -c "psql -U \"\$POSTGRES_USER\" -d \"$1\" -v ON_ERROR_STOP=1 -tAq"; }
dbname=$(docker exec "$db" sh -c 'echo "$POSTGRES_DB"')

if [ "$mode" = "list" ]; then
  # name|groesse|zeitstempel (neueste zuerst)
  ls -1t backups/*.sql.gz 2>/dev/null | while read -r f; do
    echo "$(basename "$f")|$(du -h "$f" | cut -f1)|$(stat -c %Y "$f")"
  done
  exit 0
fi

[ "$mode" = "restore" ] || { echo "FEHLER: unbekannter Modus $mode"; exit 2; }
case "$backup" in
  */* | "" ) echo "FEHLER: ungueltiger Name der Sicherung"; exit 2 ;;
esac
file="backups/$backup"
[ -f "$file" ] || { echo "FEHLER: $file gibt es nicht"; exit 2; }

echo "== 1. Sicherung pruefen"
gunzip -t "$file" 2>/dev/null || { echo "FEHLER: $backup ist beschaedigt"; exit 1; }
grep -q "PostgreSQL database dump complete" <(gunzip -c "$file" | tail -n 5) || { echo "FEHLER: $backup ist unvollstaendig (Endmarke fehlt)"; exit 1; }
echo "OK: $backup ($(du -h "$file" | cut -f1))"

echo "== 2. Aktuellen Stand sichern"
ts=$(date +%Y%m%d-%H%M%S)
safety="backups/pre-restore-$ts.sql.gz"
docker exec "$db" sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' | gzip > "$safety"
[ -s "$safety" ] || { echo "FEHLER: Sicherung des aktuellen Stands ist leer"; exit 1; }
echo "SAFETY: $safety ($(du -h "$safety" | cut -f1))"
# Hoechstens 40 Tage aufbewahren (Datenschutzerklaerung), wie die Pre-Deploy-Sicherungen
find backups -maxdepth 1 -name 'pre-restore-*.sql.gz' -mtime +40 -delete

echo "== 3. Probelauf in einer Wegwerf-DB"
psql_db postgres <<< "DROP DATABASE IF EXISTS restore_probe; CREATE DATABASE restore_probe;"
if ! gunzip -c "$file" | psql_db restore_probe > /dev/null; then
  psql_db postgres <<< "DROP DATABASE IF EXISTS restore_probe;" || true
  echo "FEHLER: Probelauf fehlgeschlagen, nichts wurde veraendert"
  exit 1
fi
probe_mig=$(psql_db restore_probe <<< "SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL;")
probe_users=$(psql_db restore_probe <<< "SELECT count(*) FROM users;")
psql_db postgres <<< "DROP DATABASE restore_probe;"
echo "PROBE: migrations=$probe_mig users=$probe_users"
live_mig=$(psql_db "$dbname" <<< "SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL;" || echo "?")
live_users=$(psql_db "$dbname" <<< "SELECT count(*) FROM users;" || echo "?")
echo "LIVE: migrations=$live_mig users=$live_users"

echo "== 4. Dienste anhalten, einspielen, starten"
services=$(docker ps --format '{{.Names}}' | grep -E "^$project-(backend|web|landing|login|admin)-[0-9]+$" | tr '\n' ' ')
t0=$(date +%s)
docker stop $services > /dev/null
echo "Angehalten: $services"
restore_into() {
  psql_db "$dbname" <<< "DROP SCHEMA public CASCADE; CREATE SCHEMA public;" > /dev/null 2>&1
  gunzip -c "$1" | psql_db "$dbname" > /dev/null
}
if ! restore_into "$file"; then
  echo "FEHLER: Einspielen fehlgeschlagen, spiele den gesicherten Stand zurueck"
  if restore_into "$safety"; then echo "RECOVERED: $safety"; else echo "FEHLER: auch der gesicherte Stand liess sich nicht einspielen"; fi
  docker start $services > /dev/null
  exit 1
fi
docker start $services > /dev/null
echo "DOWNTIME: $(( $(date +%s) - t0 ))"

echo "== 5. Kontrolle"
restored_mig=$(psql_db "$dbname" <<< "SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL;")
restored_users=$(psql_db "$dbname" <<< "SELECT count(*) FROM users;")
echo "RESTORED: migrations=$restored_mig users=$restored_users"
# Genau dieser Stand muss antworten (nicht irgendein Dienst, der die Adresse gerade uebernimmt)
expected=$(head -n 1 REVISION 2>/dev/null || true)
for i in $(seq 1 40); do
  body=$(curl -s -m 5 "https://$domain/health" || true)
  if echo "$body" | grep -q '"status":"ok"' && { [ -z "$expected" ] || echo "$body" | grep -q "\"revision\":\"$expected\""; }; then
    echo "HEALTH: $body"
    echo "RESTORE_OK"
    exit 0
  fi
  sleep 3
done
echo "FEHLER: https://$domain/health meldet nicht ok mit Stand $expected (Daten sind eingespielt)"
exit 1
