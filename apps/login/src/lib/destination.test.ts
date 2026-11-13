import { afterEach, describe, expect, it, vi } from 'vitest';
import { afterLogin, cleanReturnTo, departmentSlugFromReturnTo, finalDestination, withReturnTo } from './destination';

function onHost(hostname: string) {
  vi.stubGlobal('window', { location: { hostname } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('cleanReturnTo (kein offener Redirect nach dem Login)', () => {
  it('lässt Ziele auf der eigenen Domain und ihren Subdomains zu', () => {
    onHost('login.cevi-schichtplan.ch');
    expect(cleanReturnTo('https://illnau.cevi-schichtplan.ch/anlass')).toBe('https://illnau.cevi-schichtplan.ch/anlass');
    expect(cleanReturnTo('https://cevi-schichtplan.ch/profil')).toBe('https://cevi-schichtplan.ch/profil');
  });

  it('verwirft fremde Domains und ähnlich aussehende Hosts', () => {
    onHost('login.cevi-schichtplan.ch');
    expect(cleanReturnTo('https://evil.example/')).toBeNull();
    expect(cleanReturnTo('https://cevi-schichtplan.ch.evil.example/')).toBeNull();
    expect(cleanReturnTo('https://evilcevi-schichtplan.ch/')).toBeNull();
    expect(cleanReturnTo('//evil.example/')).toBeNull();
  });

  it('verwirft andere Schemata und Klartext-http auf der eigenen Domain', () => {
    onHost('login.cevi-schichtplan.ch');
    expect(cleanReturnTo('javascript:alert(1)')).toBeNull();
    expect(cleanReturnTo('http://illnau.cevi-schichtplan.ch/')).toBeNull();
  });

  it('erlaubt localhost nur auf localhost', () => {
    onHost('localhost');
    expect(cleanReturnTo('http://illnau.localhost:3000/')).toBe('http://illnau.localhost:3000/');
    onHost('login.cevi-schichtplan.ch');
    expect(cleanReturnTo('http://illnau.localhost:3000/')).toBeNull();
  });

  it('gibt null zurück, wenn nichts angegeben ist oder das Ziel die Login-Seite selbst wäre', () => {
    onHost('login.cevi-schichtplan.ch');
    expect(cleanReturnTo(null)).toBeNull();
    expect(cleanReturnTo('')).toBeNull();
    expect(cleanReturnTo('/')).toBeNull();
  });
});

describe('departmentSlugFromReturnTo', () => {
  it('liefert die Abteilung einer Subdomain', () => {
    onHost('login.cevi-schichtplan.ch');
    expect(departmentSlugFromReturnTo('https://illnau.cevi-schichtplan.ch/')).toBe('illnau');
  });

  it('liefert null für die Hauptdomain, fremde Hosts, tiefere Subdomains und ungültige Eingaben', () => {
    onHost('login.cevi-schichtplan.ch');
    expect(departmentSlugFromReturnTo('https://cevi-schichtplan.ch/')).toBeNull();
    expect(departmentSlugFromReturnTo('https://illnau.evil.example/')).toBeNull();
    expect(departmentSlugFromReturnTo('https://a.b.cevi-schichtplan.ch/')).toBeNull();
    expect(departmentSlugFromReturnTo(null)).toBeNull();
    expect(departmentSlugFromReturnTo('kein url')).toBeNull();
  });
});

describe('Ziel nach dem Login', () => {
  it('nimmt ein angegebenes Ziel unverändert', () => {
    expect(finalDestination('https://illnau.cevi-schichtplan.ch/x')).toBe('https://illnau.cevi-schichtplan.ch/x');
  });

  it('schickt Personen ohne Abteilungsangabe nur mit Abteilungs-Kontext oder Einladung auf /abteilung', () => {
    onHost('login.cevi-schichtplan.ch');
    expect(afterLogin({ needsDepartmentSetup: true }, null)).toBe(finalDestination(null));
    expect(afterLogin({ needsDepartmentSetup: true }, 'https://a.cevi-schichtplan.ch/')).toBe(
      `/abteilung?return_to=${encodeURIComponent('https://a.cevi-schichtplan.ch/')}`
    );
    expect(afterLogin({ needsDepartmentSetup: false }, null, undefined, 'inv-123')).toBe('/abteilung?invite=inv-123');
  });

  it('hängt return_to korrekt an Pfade an', () => {
    expect(withReturnTo('/zwei-faktor', null)).toBe('/zwei-faktor');
    expect(withReturnTo('/zwei-faktor', 'https://a.b/')).toBe(`/zwei-faktor?return_to=${encodeURIComponent('https://a.b/')}`);
    expect(withReturnTo('/x?y=1', 'z')).toBe('/x?y=1&return_to=z');
  });
});
