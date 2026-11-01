import { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import swagger from '@fastify/swagger';
import scalar from '@scalar/fastify-api-reference';
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod';

const docsPlugin: FastifyPluginAsync = async (app) => {
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  await app.register(swagger, {
    openapi: {
      openapi: '3.0.3',
      info: {
        title: 'Cevi Schichtplan V2 API',
        description: `## REST-API von Cevi Schichtplan V2

Echtzeit-Schnittstelle für Helfer- und Schichtverwaltung:
- **Abteilungen & Events**: Verwaltung von Abteilungen, Anlässen, Schichten und Helfer-Eintragungen
- **Authentifizierung**: Cevi.DB (Hitobito OAuth), Cevi-Name Login, JWT Session-Cookies
- **Anwesenheit & Check-in**: QR-Code-Check-in, Ersatzsuche und Schichtübernahme
- **Administration & OK**: Exportfunktionen, Helfer-Kommunikation und globale Verwaltung

### Lokale Bereitstellung
Diese API-Dokumentation wird vollständig **lokal ohne externe CDNs, Web-Fonts oder Remote-Proxies** ausgeliefert.`,
        version: '2.0.0',
        contact: {
          name: 'Cevi Schichtplan',
          url: 'https://cevi-schichtplan.ch',
        },
      },
      servers: [
        {
          url: '/api',
          description: 'Aktuelle API-Basis',
        },
      ],
      tags: [
        { name: 'Health', description: 'System-Gesundheitsprüfung und Datenbank-Verfügbarkeit' },
        { name: 'Auth', description: 'Authentifizierung (Cevi.DB OAuth, Cevi-Name, E-Mail/Passwort) und Benutzerprofil' },
        { name: 'Abteilungen', description: 'Abteilungsverwaltung, Stufen, Leitungsteam und Mitgliederlisten' },
        { name: 'Events', description: 'Anlässe erstellen, bearbeiten, verschieben und OK-Verwaltung' },
        { name: 'Schichten', description: 'Schichten, Schichtserien, Einteilung und Helfer-Eintragungen' },
        { name: 'Anwesenheit', description: 'QR-Code-Check-in und Erfassung der Helfer-Anwesenheit' },
        { name: 'Ersatz', description: '«Ersatz gesucht»-Workflow und Schicht-Übernahmen' },
        { name: 'Aufgaben', description: 'Katalog vordefinierter Tätigkeiten und Altersanforderungen' },
        { name: 'Vorlagen', description: 'Wiederverwendbare Event- und Schichtvorlagen' },
        { name: 'Nachrichten', description: 'Zielgerichtete Rundmails und Benachrichtigungen an Helfende' },
        { name: 'Push', description: 'Web Push Benachrichtigungen (VAPID) für Schichterinnerungen' },
        { name: 'Kalender', description: 'Persönliche iCal/Webcal-Kalender-Abonnements' },
        { name: 'Uploads', description: 'Upload und Auslieferung von Abteilungslogos und Eventbannern' },
        { name: 'Statistik', description: 'Anonyme UI- und Nutzungsmetriken' },
        { name: 'Administration', description: 'Globale Plattformverwaltung für Systemadministratoren' },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
            description: 'JWT-Token im Authorization-Header (`Bearer <token>`) oder als HttpOnly Session-Cookie.',
          },
          cookieAuth: {
            type: 'apiKey',
            in: 'cookie',
            name: 'token',
            description: 'HttpOnly Session-Cookie `token`',
          },
        },
      },
    },
    transform: jsonSchemaTransform,
  });

  await app.register(scalar, {
    routePrefix: '/api/docs',
    configuration: {
      theme: 'saturn',
      // 1. Keine externen Fonts über CDN laden
      withDefaultFonts: false,
      // 2. Keine externen Proxy-Aufrufe (proxy.scalar.com)
      proxyUrl: '',
      // 3. System-Schriftarten lokal nutzen (kein externes Nachladen)
      customCss: `
        :root {
          --scalar-font: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          --scalar-font-code: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
        }
      `,
    },
  });
};

export default fp(docsPlugin);
