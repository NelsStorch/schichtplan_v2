import dotenv from 'dotenv';
dotenv.config({ quiet: true });

import { buildApp } from './app.js';
import { ANSWER_RETENTION_INTERVAL_MS, purgeExpiredAnswers } from './services/answerRetention.js';
import { REMINDER_INTERVAL_MS, sendDueShiftReminders } from './services/shiftReminders.js';
import { isDatabaseOverloadError, sendServerAlert } from './services/serverAlert.js';
import { STATS_MAINTENANCE_INTERVAL_MS, runStatsMaintenance } from './services/statsMaintenance.js';
import { trackUsage } from './services/usageStats.js';
import { runExclusive } from './services/jobLock.js';

const PORT = parseInt(process.env.PORT || '4000', 10);
const HOST = process.env.HOST || '0.0.0.0';

async function main() {
  const app = await buildApp();

  // Docker stoppt alte Container beim Deploy mit SIGTERM: laufende Anfragen fertig beantworten,
  // DB-Verbindungen schliessen, dann beenden (nach 10 s spätestens, Docker killt nach 10 s ohnehin)
  let closing = false;
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.once(signal, () => {
      if (closing) return;
      closing = true;
      app.log.info({ signal }, 'Backend fährt herunter');
      setTimeout(() => process.exit(1), 9_000).unref();
      app.close().then(
        () => process.exit(0),
        (err) => {
          app.log.error(err, 'Fehler beim Herunterfahren');
          process.exit(1);
        }
      );
    });
  }

  // Erinnerungs-Mails vor Schichten: nur wenn ausdrücklich eingeschaltet. Hooks müssen vor
  // listen() registriert sein (danach wirft Fastify FST_ERR_INSTANCE_ALREADY_LISTENING).
  if (process.env.SHIFT_REMINDERS_ENABLED === 'true') {
    const run = () =>
      runExclusive(app.prisma, 'shift-reminders', () => sendDueShiftReminders(app.prisma))
        .then((res) => {
          if (!res.ran) return; // läuft schon in einem anderen Backend (z. B. beim Rollout)
          const sent = res.value;
          trackUsage('JOB_RUN', { dim: 'SHIFT_REMINDERS' });
          if (sent > 0) {
            trackUsage('JOB_ITEMS', { dim: 'SHIFT_REMINDERS', n: sent });
            app.log.info({ sent }, 'Schicht-Erinnerungen verschickt');
          }
        })
        .catch((err) => {
          trackUsage('JOB_FAILED', { dim: 'SHIFT_REMINDERS' });
          app.log.error(err, 'Schicht-Erinnerungen fehlgeschlagen');
          void sendServerAlert({
            category: isDatabaseOverloadError(err) ? 'DB_OVERLOAD' : 'SERVER_ERROR',
            level: 'CRITICAL',
            title: 'Hintergrund-Job: Schicht-Erinnerungen fehlgeschlagen',
            message: 'Der periodische Versand von Schicht-Erinnerungen ist mit einem Fehler abgebrochen.',
            error: err,
          }).catch(() => {});
        });
    const timer = setInterval(run, REMINDER_INTERVAL_MS);
    timer.unref();
    const firstRun = setTimeout(run, 60 * 1000);
    firstRun.unref();
    app.addHook('onClose', async () => {
      clearInterval(timer);
      clearTimeout(firstRun);
    });
    app.log.info('Schicht-Erinnerungen eingeschaltet');
  }

  // Antworten auf eigene Fragen nach der eingestellten Frist löschen (immer an, auch vor listen())
  const purge = () =>
    runExclusive(app.prisma, 'answer-retention', () => purgeExpiredAnswers(app.prisma))
      .then((res) => {
        if (!res.ran) return;
        const deleted = res.value;
        trackUsage('JOB_RUN', { dim: 'ANSWER_RETENTION' });
        if (deleted > 0) {
          trackUsage('JOB_ITEMS', { dim: 'ANSWER_RETENTION', n: deleted });
          app.log.info({ deleted }, 'Abgelaufene Antworten gelöscht');
        }
      })
      .catch((err) => {
        trackUsage('JOB_FAILED', { dim: 'ANSWER_RETENTION' });
        app.log.error(err, 'Löschen abgelaufener Antworten fehlgeschlagen');
        if (isDatabaseOverloadError(err)) {
          void sendServerAlert({
            category: 'DB_OVERLOAD',
            level: 'CRITICAL',
            title: 'Hintergrund-Job: Datenbank überlastet beim Löschen abgelaufener Antworten',
            message: 'Die Datenbankverbindung beim Aufräumen abgelaufener Antworten ist fehlgeschlagen.',
            error: err,
          }).catch(() => {});
        }
      });
  const purgeTimer = setInterval(purge, ANSWER_RETENTION_INTERVAL_MS);
  purgeTimer.unref();
  const firstPurge = setTimeout(purge, 2 * 60 * 1000);
  firstPurge.unref();
  app.addHook('onClose', async () => {
    clearInterval(purgeTimer);
    clearTimeout(firstPurge);
  });

  // Nutzungsstatistik: Momentaufnahme des Vortags, alte Stundenwerte zusammenfassen, Altes löschen
  const maintainStats = () =>
    runExclusive(app.prisma, 'stats-maintenance', () => runStatsMaintenance(app.prisma))
      .then((res) => {
        if (!res.ran) return;
        const rolled = res.value;
        trackUsage('JOB_RUN', { dim: 'STATS_MAINTENANCE' });
        if (rolled > 0) trackUsage('JOB_ITEMS', { dim: 'STATS_MAINTENANCE', n: rolled });
      })
      .catch((err) => {
        trackUsage('JOB_FAILED', { dim: 'STATS_MAINTENANCE' });
        app.log.error(err, 'Pflege der Statistik fehlgeschlagen');
      });
  const statsTimer = setInterval(maintainStats, STATS_MAINTENANCE_INTERVAL_MS);
  statsTimer.unref();
  const firstStats = setTimeout(maintainStats, 3 * 60 * 1000);
  firstStats.unref();
  app.addHook('onClose', async () => {
    clearInterval(statsTimer);
    clearTimeout(firstStats);
  });

  try {
    await app.listen({ port: PORT, host: HOST });
    app.log.info(`Schichtplan Backend läuft auf http://${HOST}:${PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
