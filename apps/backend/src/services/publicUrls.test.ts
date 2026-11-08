import { describe, expect, it } from 'vitest';
import { getCeviDbRedirectUri, getLoginPortalBaseUrl } from './authSession.js';

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
  });
});
