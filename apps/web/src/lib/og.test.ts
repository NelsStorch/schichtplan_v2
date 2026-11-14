import { describe, expect, it } from 'vitest';
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
