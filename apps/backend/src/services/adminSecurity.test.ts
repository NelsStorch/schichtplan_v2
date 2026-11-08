import { describe, expect, it } from 'vitest';
import { adminRequestProblem, adminSecurityConfig, adminSessionProblem, bootstrapAdminCeviDbIds } from './adminSecurity.js';

const prod = { rootDomain: 'cevi-schichtplan.ch', allowLocalhost: false };

describe('adminRequestProblem', () => {
  it('lässt nur das Admin-Portal zu', () => {
    expect(adminRequestProblem({ host: 'admin.cevi-schichtplan.ch' }, prod)).toBeNull();
    expect(
      adminRequestProblem(
        { host: 'admin.cevi-schichtplan.ch', origin: 'https://admin.cevi-schichtplan.ch', secFetchSite: 'same-origin' },
        prod
      )
    ).toBeNull();
    expect(adminRequestProblem({ host: 'login.cevi-schichtplan.ch', secFetchSite: 'same-origin' }, prod)).toBe('HOST');
  });

  it('sperrt Abteilungs-Subdomains, Dev und fremde Hosts', () => {
    expect(adminRequestProblem({ host: 'illnau.cevi-schichtplan.ch' }, prod)).toBe('HOST');
    expect(adminRequestProblem({ host: 'admin.dev.cevi-schichtplan.ch' }, prod)).toBe('HOST');
    expect(adminRequestProblem({ host: 'localhost:4000' }, prod)).toBe('HOST');
  });

  it('sperrt Aufrufe von einer anderen Seite', () => {
    expect(
      adminRequestProblem(
        { host: 'admin.cevi-schichtplan.ch', origin: 'https://illnau.cevi-schichtplan.ch', secFetchSite: 'same-site' },
        prod
      )
    ).toBe('CROSS_ORIGIN');
    expect(
      adminRequestProblem({ host: 'admin.cevi-schichtplan.ch', origin: 'https://x.dev.cevi-schichtplan.ch' }, prod)
    ).toBe('CROSS_ORIGIN');
    expect(adminRequestProblem({ host: 'admin.cevi-schichtplan.ch', secFetchSite: 'cross-site' }, prod)).toBe(
      'CROSS_ORIGIN'
    );
    expect(adminRequestProblem({ host: 'admin.cevi-schichtplan.ch', origin: 'null' }, prod)).toBe('CROSS_ORIGIN');
  });

  it('erlaubt lokal localhost mit anderem Port (Next-Proxy)', () => {
    const local = { rootDomain: 'cevi-schichtplan.ch', allowLocalhost: true };
    expect(adminRequestProblem({ host: 'localhost:4000', origin: 'http://localhost:3003' }, local)).toBeNull();
  });
});

describe('adminSessionProblem', () => {
  const config = { maxSessionAgeSeconds: 12 * 3600, requireCeviDbLogin: true };
  const now = 1_800_000_000;

  it('verlangt eine Cevi.DB-Anmeldung, wenn eingestellt', () => {
    expect(adminSessionProblem({ iat: now, amr: 'password' }, config, now)).toBe('NOT_CEVIDB');
    expect(adminSessionProblem({ iat: now }, config, now)).toBe('NOT_CEVIDB');
    expect(adminSessionProblem({ iat: now, amr: 'cevidb' }, config, now)).toBeNull();
  });

  it('verlangt eine frische Anmeldung', () => {
    expect(adminSessionProblem({ iat: now - 13 * 3600, amr: 'cevidb' }, config, now)).toBe('STALE');
    expect(adminSessionProblem({ amr: 'cevidb' }, config, now)).toBe('STALE');
  });
});

describe('adminSecurityConfig', () => {
  it('verlangt Cevi.DB nur in Produktion (ausser per Env überschrieben)', () => {
    expect(adminSecurityConfig({ NODE_ENV: 'production' }).requireCeviDbLogin).toBe(true);
    expect(adminSecurityConfig({ NODE_ENV: 'production', ADMIN_REQUIRE_CEVIDB_LOGIN: 'false' }).requireCeviDbLogin).toBe(
      false
    );
    expect(adminSecurityConfig({ NODE_ENV: 'development' }).requireCeviDbLogin).toBe(false);
    expect(adminSecurityConfig({ NODE_ENV: 'production' }).allowLocalhost).toBe(false);
    expect(adminSecurityConfig({ ADMIN_SESSION_MAX_HOURS: '2' }).maxSessionAgeSeconds).toBe(7200);
  });
});

describe('bootstrapAdminCeviDbIds', () => {
  it('parst IDs korrekt auch mit Anführungszeichen, Leerzeichen und ungültigen Einträgen', () => {
    const ids = bootstrapAdminCeviDbIds({ GLOBAL_ADMIN_CEVIDB_IDS: ' 12211, "3456", \'7890\', invalid, -5, 0 ' });
    expect(ids.has(12211)).toBe(true);
    expect(ids.has(3456)).toBe(true);
    expect(ids.has(7890)).toBe(true);
    expect(ids.size).toBe(3);
  });

  it('gibt leeres Set zurück wenn keine IDs definiert sind', () => {
    expect(bootstrapAdminCeviDbIds({}).size).toBe(0);
    expect(bootstrapAdminCeviDbIds({ GLOBAL_ADMIN_CEVIDB_IDS: '' }).size).toBe(0);
  });
});
