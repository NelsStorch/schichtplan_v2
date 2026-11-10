import { describe, expect, it } from 'vitest';
import { getCeviDbRedirectUri, getLoginPortalBaseUrl, loginErrorUrl, loginPageUrl } from './authSession.js';

describe('Adressen nur aus der Konfiguration', () => {
  it('Login-Portal in Produktion aus COOKIE_DOMAIN bzw. DOMAIN', () => {
    expect(getLoginPortalBaseUrl({ NODE_ENV: 'production', COOKIE_DOMAIN: '.cevi-schichtplan.ch' })).toBe('https://login.cevi-schichtplan.ch');
    expect(getLoginPortalBaseUrl({ NODE_ENV: 'production', DOMAIN: 'dev.cevi-schichtplan.ch' })).toBe('https://login.dev.cevi-schichtplan.ch');
    expect(getLoginPortalBaseUrl({ NODE_ENV: 'production' })).toBe('https://login.cevi-schichtplan.ch');
  });

  it('lokal localhost:3002 oder LOGIN_PORTAL_URL', () => {
    expect(getLoginPortalBaseUrl({ NODE_ENV: 'development' })).toBe('http://localhost:3002');
    expect(getLoginPortalBaseUrl({ NODE_ENV: 'development', LOGIN_PORTAL_URL: 'http://login.localhost:3002/' })).toBe('http://login.localhost:3002');
  });

  it('Cevi.DB-Redirect: Konfiguration, sonst Callback auf dem Login-Portal', () => {
    expect(getCeviDbRedirectUri({ NODE_ENV: 'production', CEVIDB_REDIRECT_URI: 'https://x.example/cb' })).toBe('https://x.example/cb');
    expect(getCeviDbRedirectUri({ NODE_ENV: 'production', DOMAIN: 'cevi-schichtplan.ch' })).toBe(
      'https://login.cevi-schichtplan.ch/api/auth/cevidb/callback'
    );

    // Bei fremden Verbänden darf CEVIDB_REDIRECT_URI nicht die Verbandsdomain kapern
    const ceviRedirectEnv = {
      NODE_ENV: 'production',
      CEVIDB_REDIRECT_URI: 'https://login.dev.cevi-schichtplan.ch/api/auth/cevidb/callback',
    };
    expect(getCeviDbRedirectUri(ceviRedirectEnv, 'dev.cevi-schichtplan.ch')).toBe(
      'https://login.dev.cevi-schichtplan.ch/api/auth/cevidb/callback'
    );
    expect(getCeviDbRedirectUri(ceviRedirectEnv, 'dev.pfadi-schichtplan.ch')).toBe(
      'https://login.dev.pfadi-schichtplan.ch/api/auth/cevidb/callback'
    );
    expect(getCeviDbRedirectUri(ceviRedirectEnv, 'dev.vereins-schichtplan.ch')).toBe(
      'https://login.dev.vereins-schichtplan.ch/api/auth/cevidb/callback'
    );
  });

  it('Multi-Domain Login-Portal mit reqHost (Produktion & Staging)', () => {
    // Vereins-Schichtplan Dev & Prod
    expect(getLoginPortalBaseUrl({ NODE_ENV: 'production' }, 'dev.vereins-schichtplan.ch')).toBe('https://login.dev.vereins-schichtplan.ch');
    expect(getLoginPortalBaseUrl({ NODE_ENV: 'production' }, 'login.dev.vereins-schichtplan.ch')).toBe('https://login.dev.vereins-schichtplan.ch');
    expect(getLoginPortalBaseUrl({ NODE_ENV: 'production' }, 'dev.vereins-schichtplan.ch:443')).toBe('https://login.dev.vereins-schichtplan.ch');
    expect(getLoginPortalBaseUrl({ NODE_ENV: 'production' }, 'vereins-schichtplan.ch')).toBe('https://login.vereins-schichtplan.ch');
    expect(getLoginPortalBaseUrl({ NODE_ENV: 'production' }, 'login.vereins-schichtplan.ch')).toBe('https://login.vereins-schichtplan.ch');

    // Pfadi & Jubla
    expect(getLoginPortalBaseUrl({ NODE_ENV: 'production' }, 'dev.pfadi-schichtplan.ch')).toBe('https://login.dev.pfadi-schichtplan.ch');
    expect(getLoginPortalBaseUrl({ NODE_ENV: 'production' }, 'jubla-schichtplan.ch')).toBe('https://login.jubla-schichtplan.ch');

    // env.LOGIN_PORTAL_URL darf andere Verbände nicht kapern
    const envWithCeviPortal = {
      NODE_ENV: 'production',
      LOGIN_PORTAL_URL: 'https://login.dev.cevi-schichtplan.ch',
    };
    expect(getLoginPortalBaseUrl(envWithCeviPortal, 'dev.vereins-schichtplan.ch')).toBe('https://login.dev.vereins-schichtplan.ch');
    expect(getLoginPortalBaseUrl(envWithCeviPortal, 'dev.pfadi-schichtplan.ch')).toBe('https://login.dev.pfadi-schichtplan.ch');

    // Localhost bleibt lokal
    expect(getLoginPortalBaseUrl({ NODE_ENV: 'development' }, 'localhost:3000')).toBe('http://localhost:3002');
  });

  it('loginErrorUrl und loginPageUrl unterstuetzen Multi-Domain ueber reqHost', () => {
    expect(loginErrorUrl('cevidb_failed', 'https://dev.vereins-schichtplan.ch/ok', 'dev.vereins-schichtplan.ch')).toBe(
      'https://login.dev.vereins-schichtplan.ch/?error=cevidb_failed&return_to=' + encodeURIComponent('https://dev.vereins-schichtplan.ch/ok')
    );
    expect(loginPageUrl('/abteilung', 'https://dev.vereins-schichtplan.ch/ok', 'dev.vereins-schichtplan.ch')).toBe(
      'https://login.dev.vereins-schichtplan.ch/abteilung?return_to=' + encodeURIComponent('https://dev.vereins-schichtplan.ch/ok')
    );
  });
});
