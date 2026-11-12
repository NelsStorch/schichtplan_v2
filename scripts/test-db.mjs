#!/usr/bin/env node
/**
 * Automatisierter Runner für API- und Datenbank-Integrationstests (172 Tests).
 * 
 * Funktionsweise:
 * 1. Falls TEST_DATABASE_URL gesetzt ist: nutzt diese bestehende Postgres-DB.
 * 2. Falls nicht gesetzt: prüft Docker, startet bei Bedarf einen ephemeren
 *    Postgres 17 Container (schichtplan-test-db auf Port 54329), führt
 *    Prisma-Migrationen aus und startet Vitest.
 * 3. Unterstützt Flags wie --keep-db, --fresh, --watch sowie Dateifilter.
 */

import { spawnSync, spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const backendDir = path.resolve(rootDir, 'apps', 'backend');

const CONTAINER_NAME = 'schichtplan-test-db';
const DB_PORT = process.env.TEST_DB_PORT || '54329';
const DB_USER = 'test';
const DB_PASSWORD = 'test';
const DB_NAME = 'schichtplan_test';
const LOCAL_DB_URL = `postgresql://${DB_USER}:${DB_PASSWORD}@127.0.0.1:${DB_PORT}/${DB_NAME}`;

const args = process.argv.slice(2);
const keepDb = args.includes('--keep-db');
const freshDb = args.includes('--fresh');
const isWatch = args.includes('--watch') || args.includes('-w');

// Bereinige benutzerdefinierte Skript-Flags für die Übergabe an Vitest
const vitestArgs = args.filter((arg) => arg !== '--keep-db' && arg !== '--fresh');

function run(command, cmdArgs, options = {}) {
  return spawnSync(command, cmdArgs, {
    stdio: 'inherit',
    shell: true,
    ...options,
  });
}

function runCapture(command, cmdArgs, options = {}) {
  const result = spawnSync(command, cmdArgs, {
    encoding: 'utf-8',
    shell: true,
    ...options,
  });
  return {
    status: result.status,
    stdout: (result.stdout || '').trim(),
    stderr: (result.stderr || '').trim(),
  };
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log('\n========================================');
  console.log(' Cevi Schichtplan V2 – Integration Tests ');
  console.log('========================================\n');

  let dbUrl = process.env.TEST_DATABASE_URL;
  let startedContainer = false;

  if (dbUrl) {
    console.log(`[Test-DB] Bestehende TEST_DATABASE_URL erkannt:\n  -> ${dbUrl.replace(/:[^:@]+@/, ':****@')}\n`);
  } else {
    // Docker prüfen
    console.log('[Test-DB] Prüfe lokale Docker-Umgebung...');
    const dockerCheck = runCapture('docker', ['info']);
    if (dockerCheck.status !== 0) {
      console.error('\n[Fehler] Kein aktiver Docker-Daemon erreichbar.');
      console.error('Docker Desktop ist entweder nicht gestartet oder nicht installiert.\n');
      console.error('Lösungsmöglichkeiten:');
      console.error('  1. Docker Desktop starten und Befehl wiederholen:');
      console.error('     npm run test:db\n');
      console.error('  2. Oder eine eigene PostgreSQL-Datenbank via Umgebungsvariable angeben:');
      console.error('     (PowerShell) $env:TEST_DATABASE_URL="postgresql://test:test@localhost:5432/schichtplan_test"');
      console.error('     (Bash)       export TEST_DATABASE_URL="postgresql://test:test@localhost:5432/schichtplan_test"');
      console.error('     npm run test:db\n');
      process.exit(1);
    }

    dbUrl = LOCAL_DB_URL;

    // Prüfe Container-Status
    const inspect = runCapture('docker', ['ps', '-a', '--filter', `name=^/${CONTAINER_NAME}$`, '--format', '{{.Status}}']);
    const exists = inspect.stdout.length > 0;
    const isRunning = exists && inspect.stdout.startsWith('Up');

    if (freshDb && exists) {
      console.log(`[Test-DB] --fresh aktiv: Lösche bestehenden Container ${CONTAINER_NAME}...`);
      runCapture('docker', ['rm', '-f', CONTAINER_NAME]);
    }

    if (!exists || (freshDb && exists)) {
      console.log(`[Test-DB] Starte neuen PostgreSQL 17 Container (${CONTAINER_NAME}) auf Port ${DB_PORT}...`);
      const runRes = run('docker', [
        'run',
        '-d',
        '--name',
        CONTAINER_NAME,
        '-e',
        `POSTGRES_USER=${DB_USER}`,
        '-e',
        `POSTGRES_PASSWORD=${DB_PASSWORD}`,
        '-e',
        `POSTGRES_DB=${DB_NAME}`,
        '-p',
        `127.0.0.1:${DB_PORT}:5432`,
        'postgres:17-alpine',
      ]);
      if (runRes.status !== 0) {
        console.error('[Fehler] Konnte Postgres-Container nicht starten.');
        process.exit(runRes.status ?? 1);
      }
      startedContainer = true;
    } else if (!isRunning) {
      console.log(`[Test-DB] Starte gestoppten Container ${CONTAINER_NAME}...`);
      run('docker', ['start', CONTAINER_NAME]);
      startedContainer = true;
    } else {
      console.log(`[Test-DB] Wiederverwendung von laufendem Container ${CONTAINER_NAME}.`);
    }

    // Warten bis Postgres bereit ist
    console.log('[Test-DB] Warte auf Datenbank-Bereitschaft (pg_isready)...');
    let ready = false;
    for (let i = 0; i < 30; i++) {
      const readyCheck = runCapture('docker', ['exec', CONTAINER_NAME, 'pg_isready', '-U', DB_USER, '-d', DB_NAME]);
      if (readyCheck.status === 0) {
        ready = true;
        break;
      }
      await sleep(1000);
    }

    if (!ready) {
      console.error('[Fehler] PostgreSQL wurde nach 30 Sekunden nicht betriebsbereit.');
      if (startedContainer && !keepDb) {
        runCapture('docker', ['rm', '-f', CONTAINER_NAME]);
      }
      process.exit(1);
    }
  }

  // Prisma Migrationen ausführen
  console.log('[Test-DB] Führe Prisma-Migrationen aus (prisma migrate deploy)...');
  const migrateRes = run(
    'npx',
    ['prisma', 'migrate', 'deploy'],
    {
      cwd: backendDir,
      env: {
        ...process.env,
        DATABASE_URL: dbUrl,
      },
    }
  );

  if (migrateRes.status !== 0) {
    console.error('[Fehler] Prisma-Migrationen sind fehlgeschlagen.');
    if (startedContainer && !keepDb) {
      runCapture('docker', ['rm', '-f', CONTAINER_NAME]);
    }
    process.exit(migrateRes.status ?? 1);
  }

  // Vitest ausführen
  console.log('\n[Test-DB] Starte API- und Datenbank-Tests mit Vitest...');
  const defaultVitestArgs = vitestArgs.length > 0 ? vitestArgs : ['run'];
  
  const testRes = run(
    'npx',
    ['vitest', ...defaultVitestArgs],
    {
      cwd: backendDir,
      env: {
        ...process.env,
        DATABASE_URL: dbUrl,
        TEST_DATABASE_URL: dbUrl,
        NODE_ENV: 'test',
        TZ: 'UTC',
      },
    }
  );

  // Aufräumen, falls gewünscht
  if (startedContainer && !keepDb && !isWatch) {
    console.log(`\n[Test-DB] Stoppe und entferne Test-Container ${CONTAINER_NAME}...`);
    runCapture('docker', ['rm', '-f', CONTAINER_NAME]);
  } else if (startedContainer) {
    console.log(`\n[Test-DB] Test-Container ${CONTAINER_NAME} bleibt aktiv (--keep-db oder Watch-Modus).`);
  }

  process.exit(testRes.status ?? 0);
}

main().catch((err) => {
  console.error('[Unerwarteter Fehler]', err);
  process.exit(1);
});
