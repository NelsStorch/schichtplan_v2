import dotenv from 'dotenv';
dotenv.config({ quiet: true });

import { buildApp } from './app.js';
import { REMINDER_INTERVAL_MS, sendDueShiftReminders } from './services/shiftReminders.js';

const PORT = parseInt(process.env.PORT || '4000', 10);
const HOST = process.env.HOST || '0.0.0.0';

async function main() {
  const app = await buildApp();

  try {
    await app.listen({ port: PORT, host: HOST });
    app.log.info(`Schichtplan Backend läuft auf http://${HOST}:${PORT}`);

    // Erinnerungs-Mails vor Schichten: nur wenn ausdrücklich eingeschaltet
    if (process.env.SHIFT_REMINDERS_ENABLED === 'true') {
      const run = () =>
        sendDueShiftReminders(app.prisma)
          .then((sent) => sent > 0 && app.log.info({ sent }, 'Schicht-Erinnerungen verschickt'))
          .catch((err) => app.log.error(err, 'Schicht-Erinnerungen fehlgeschlagen'));
      const timer = setInterval(run, REMINDER_INTERVAL_MS);
      timer.unref();
      app.addHook('onClose', async () => clearInterval(timer));
      setTimeout(run, 60 * 1000).unref();
      app.log.info('Schicht-Erinnerungen eingeschaltet');
    }
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
