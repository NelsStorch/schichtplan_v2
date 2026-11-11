import { describe, expect, it } from 'vitest';
import { getOrganizationSlugFromHost, helpUrl, privacyUrl, statusUrl } from '@schichtplan/shared';
import { getCeviDbRedirectUri, getLoginPortalBaseUrl, loginErrorUrl, loginPageUrl, rootDomain } from './authSession.js';

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

describe('Host-Header nur für eigene Domains', () => {
  const prod = { NODE_ENV: 'production', COOKIE_DOMAIN: '.cevi-schichtplan.ch' };
  it('ignoriert fremde Hosts in Mail-Links (kein Passwort-Reset-Poisoning)', () => {
    expect(getLoginPortalBaseUrl(prod, 'login.angreifer.example')).toBe('https://login.cevi-schichtplan.ch');
    expect(getLoginPortalBaseUrl(prod, 'cevi-schichtplan.ch.angreifer.example')).toBe('https://login.cevi-schichtplan.ch');
    expect(getLoginPortalBaseUrl(prod, 'backend:4000')).toBe('https://login.cevi-schichtplan.ch');
    expect(rootDomain('evil.example', prod)).toBe('cevi-schichtplan.ch');
  });
  it('übernimmt die Verbands-Domains', () => {
    expect(rootDomain('illnau.pfadi-schichtplan.ch', prod)).toBe('pfadi-schichtplan.ch');
    expect(rootDomain('login.dev.jubla-schichtplan.ch', prod)).toBe('dev.jubla-schichtplan.ch');
  });
});

describe('Verband aus dem Host', () => {
  it('erkennt den Verband nur am Domain-Ende', () => {
    expect(getOrganizationSlugFromHost('pfadi-schichtplan-fans.vereins-schichtplan.ch')).toBe('verein');
    expect(getOrganizationSlugFromHost('jubla-schichtplan.cevi-schichtplan.ch')).toBe('cevi');
    expect(getOrganizationSlugFromHost('illnau.dev.pfadi-schichtplan.ch:443')).toBe('pfadi');
    expect(getOrganizationSlugFromHost('https://login.jubla-schichtplan.ch/abteilung')).toBe('jubla');
    expect(getOrganizationSlugFromHost('PFADI')).toBe('pfadi');
    expect(getOrganizationSlugFromHost('backend:4000')).toBe('cevi');
  });

  it('statusUrl generiert domain-spezifische Status-Links', () => {
    expect(statusUrl('/', 'dev.vereins-schichtplan.ch')).toBe('https://status.vereins-schichtplan.ch');
    expect(statusUrl('/', 'pfadi-schichtplan.ch')).toBe('https://status.pfadi-schichtplan.ch');
    expect(statusUrl('/', 'jubla-schichtplan.ch')).toBe('https://status.jubla-schichtplan.ch');
    expect(statusUrl('/', 'cevi-schichtplan.ch')).toBe('https://status.cevi-schichtplan.ch');
    expect(statusUrl()).toBe('https://status.cevi-schichtplan.ch');
  });

  it('helpUrl generiert domain-spezifische Hilfe-Links', () => {
    expect(helpUrl('/', 'dev.pfadi-schichtplan.ch')).toBe('https://hilfe.pfadi-schichtplan.ch');
    expect(helpUrl('/start', 'jubla-schichtplan.ch')).toBe('https://hilfe.jubla-schichtplan.ch/start');
    expect(helpUrl('/ok', 'vereins-schichtplan.ch')).toBe('https://hilfe.vereins-schichtplan.ch/ok');
    expect(helpUrl('/', 'cevi-schichtplan.ch')).toBe('https://hilfe.cevi-schichtplan.ch');
    expect(helpUrl()).toBe('https://hilfe.cevi-schichtplan.ch');
  });

  it('privacyUrl generiert domain-spezifische Datenschutz-Links', () => {
    expect(privacyUrl('pfadi-schichtplan.ch')).toBe('https://pfadi-schichtplan.ch/datenschutz');
    expect(privacyUrl('jubla-schichtplan.ch')).toBe('https://jubla-schichtplan.ch/datenschutz');
    expect(privacyUrl('vereins-schichtplan.ch')).toBe('https://vereins-schichtplan.ch/datenschutz');
    expect(privacyUrl('cevi-schichtplan.ch')).toBe('https://cevi-schichtplan.ch/datenschutz');
    expect(privacyUrl()).toBe('https://cevi-schichtplan.ch/datenschutz');
  });
});
