import { afterEach, describe, expect, it, vi } from 'vitest';
import { isPrivateOrInternalHost, loadRemoteLogo } from '@schichtplan/ui/og';
import { appName, openSlotsLabel, previewTitle, slugFromHost } from './og';

describe('slugFromHost', () => {
  it('extrahiert den Abteilungs-Slug aus Subdomains aller Organisationen', () => {
    expect(slugFromHost('illnau.cevi-schichtplan.ch')).toBe('illnau');
    expect(slugFromHost('wetzikon.pfadi-schichtplan.ch')).toBe('wetzikon');
    expect(slugFromHost('aarau.jubla-schichtplan.ch')).toBe('aarau');
    expect(slugFromHost('stadtverein.vereins-schichtplan.ch')).toBe('stadtverein');
  });

  it('toleriert Portangaben und Gross-/Kleinschreibung', () => {
    expect(slugFromHost('ILLNAU.cevi-schichtplan.ch:3000')).toBe('illnau');
    expect(slugFromHost('wetzikon.pfadi-schichtplan.ch:8080')).toBe('wetzikon');
  });

  it('gibt null für die Hauptdomains ohne Subdomain zurück', () => {
    expect(slugFromHost('cevi-schichtplan.ch')).toBeNull();
    expect(slugFromHost('pfadi-schichtplan.ch')).toBeNull();
    expect(slugFromHost('jubla-schichtplan.ch')).toBeNull();
    expect(slugFromHost('vereins-schichtplan.ch')).toBeNull();
  });

  it('ignoriert mehrstufige oder ungültige Subdomains', () => {
    expect(slugFromHost('sub.sub.cevi-schichtplan.ch')).toBeNull();
  });
});

describe('previewTitle', () => {
  it('nennt die Abteilung ohne doppelten Verbandsnamen', () => {
    expect(previewTitle('Jubla Greifensee-Nänikon', 'Jubla Schichtplan')).toBe('Jubla Greifensee-Nänikon – Schichtplan');
    expect(previewTitle(null, 'Cevi Schichtplan')).toBe('Cevi Schichtplan');
  });
});

describe('openSlotsLabel', () => {
  it('beschreibt freie Plätze in Einzahl und Mehrzahl', () => {
    expect(openSlotsLabel(12)).toBe('Noch 12 Plätze frei');
    expect(openSlotsLabel(1)).toBe('Noch 1 Platz frei');
    expect(openSlotsLabel(0)).toBe('Alle Schichten besetzt');
    expect(openSlotsLabel(null)).toBeNull();
  });
});

describe('appName', () => {
  it('stellt «Schichtplan» vor den Abteilungsnamen', () => {
    expect(appName('Jubla Greifensee-Nänikon')).toBe('Schichtplan – Jubla Greifensee-Nänikon');
    expect(appName(null)).toBe('Schichtplan');
  });
});

describe('isPrivateOrInternalHost', () => {
  it('blockiert private IPs, Localhost und interne Docker-Hostnamen', () => {
    expect(isPrivateOrInternalHost('localhost')).toBe(true);
    expect(isPrivateOrInternalHost('demo.localhost')).toBe(true);
    expect(isPrivateOrInternalHost('backend')).toBe(true);
    expect(isPrivateOrInternalHost('127.0.0.1')).toBe(true);
    expect(isPrivateOrInternalHost('10.0.0.5')).toBe(true);
    expect(isPrivateOrInternalHost('172.18.0.2')).toBe(true);
    expect(isPrivateOrInternalHost('192.168.1.1')).toBe(true);
    expect(isPrivateOrInternalHost('169.254.169.254')).toBe(true);
    expect(isPrivateOrInternalHost('[::1]')).toBe(true);
  });

  it('erlaubt öffentliche Domains', () => {
    expect(isPrivateOrInternalHost('cevi.ch')).toBe(false);
    expect(isPrivateOrInternalHost('cdn.example.org')).toBe(false);
  });
});

describe('loadRemoteLogo', () => {
  const originalInternalApi = process.env.INTERNAL_API_URL;

  afterEach(() => {
    process.env.INTERNAL_API_URL = originalInternalApi;
    vi.restoreAllMocks();
  });

  it('löst eigene Uploads (/api/uploads/{id}) über INTERNAL_API_URL auf', async () => {
    process.env.INTERNAL_API_URL = 'http://backend:4000';
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(Buffer.from('PNGDATA'), {
        status: 200,
        headers: { 'content-type': 'image/png' },
      })
    );

    const res = await loadRemoteLogo('/api/uploads/123e4567-e89b-12d3-a456-426614174000', 'http://demo.localhost:3000');
    expect(res).toBe(`data:image/png;base64,${Buffer.from('PNGDATA').toString('base64')}`);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0][0])).toBe('http://backend:4000/api/uploads/123e4567-e89b-12d3-a456-426614174000');
  });

  it('blockiert externe URLs auf interne/private Hosts (SSRF-Schutz)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    expect(await loadRemoteLogo('http://169.254.169.254/latest/meta-data', 'https://illnau.cevi-schichtplan.ch')).toBeNull();
    expect(await loadRemoteLogo('http://backend:4000/api/health', 'https://illnau.cevi-schichtplan.ch')).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('bricht bei Bildern über 1.5 MB anhand von Content-Length sofort ab', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(Buffer.from('small'), {
        status: 200,
        headers: { 'content-type': 'image/png', 'content-length': '2000000' },
      })
    );
    expect(await loadRemoteLogo('https://cdn.example.org/logo.png', 'https://illnau.cevi-schichtplan.ch')).toBeNull();
  });
});
