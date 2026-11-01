import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import docsPlugin from './docs.js';
import healthRoutes from '../routes/health.js';

describe('docsPlugin (Scalar API Reference)', () => {
  async function createTestApp() {
    const app = Fastify();
    await app.register(helmet, {
      crossOriginResourcePolicy: false,
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          fontSrc: ["'self'"],
          imgSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
        },
      },
    });
    // Mock prisma for health
    app.decorate('prisma', {
      $queryRaw: async () => [{ '?column?': 1 }],
    });
    await app.register(docsPlugin);
    await app.register(healthRoutes);
    await app.ready();
    return app;
  }

  it('liefert die OpenAPI 3.0.3 Spezifikation als JSON aus', async () => {
    const app = await createTestApp();
    const res = await app.inject({ method: 'GET', url: '/api/docs/openapi.json' });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('application/json');

    const spec = JSON.parse(res.body);
    expect(spec.openapi).toBe('3.0.3');
    expect(spec.info.title).toBe('Cevi Schichtplan V2 API');
    expect(spec.paths['/health']).toBeDefined();
    await app.close();
  });

  it('liefert die Scalar-HTML-Seite mit rein lokalen Einstellungen aus', async () => {
    const app = await createTestApp();
    const res = await app.inject({ method: 'GET', url: '/api/docs/' });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');

    const html = res.body;

    // Lokales Skript-Tag
    expect(html).toContain('<script src="js/scalar.js"></script>');

    // Keine externen CDN-Links für Skripte
    expect(html).not.toContain('https://cdn.jsdelivr.net');
    expect(html).not.toContain('https://unpkg.com');

    // Keine externen CDN-Fonts aktiviert
    expect(html).toContain('"withDefaultFonts": false');

    // Kein externer Proxy
    expect(html).toContain('"proxyUrl": ""');

    // CSP-Header verbietet externe Verbindungen und Fremd-Fonts
    const csp = res.headers['content-security-policy'];
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("font-src 'self'");
    expect(csp).toContain("connect-src 'self'");

    await app.close();
  });

  it('liefert das Scalar JavaScript-Bundle lokal über Fastify aus', async () => {
    const app = await createTestApp();
    const res = await app.inject({ method: 'GET', url: '/api/docs/js/scalar.js' });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('application/javascript');
    expect(res.body.length).toBeGreaterThan(100_000);
    await app.close();
  });

  it('leitet /api/docs ohne Trailing Slash sauber weiter', async () => {
    const app = await createTestApp();
    const res = await app.inject({ method: 'GET', url: '/api/docs' });

    expect(res.statusCode).toBe(301);
    expect(res.headers['location']).toBe('/api/docs/');
    await app.close();
  });
});
