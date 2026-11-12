import { describe, expect, it } from 'vitest';
import { csvCell, escapeHtml } from './exportFile';

describe('csvCell', () => {
  it('gibt leere Zeichenkette für null und undefined zurück', () => {
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
  });

  it('konvertiert Zahlen korrekt in Text', () => {
    expect(csvCell(0)).toBe('0');
    expect(csvCell(42)).toBe('42');
    expect(csvCell(3.14)).toBe('3.14');
  });

  it('belässt normalen Text unverändert', () => {
    expect(csvCell('Schichtleitung')).toBe('Schichtleitung');
    expect(csvCell('Küche & Bar')).toBe('Küche & Bar');
  });

  it('entschärft potenzielle Formelinjektionen für Excel mit vorangestelltem Hochkomma', () => {
    // Formeln und Sonderzeichen am Anfang: =, +, -, @, Tabulator
    expect(csvCell('=1+1')).toBe("'=1+1");
    expect(csvCell('=SUM(A1:A10)')).toBe("'=SUM(A1:A10)");
    expect(csvCell('+41 79 123 45 67')).toBe("'+41 79 123 45 67");
    expect(csvCell('-50')).toBe("'-50");
    expect(csvCell('@mention')).toBe("'@mention");
    expect(csvCell('\tEinrückung')).toBe("'\tEinrückung");
  });

  it('setzt Anführungszeichen bei Semikolon, Zeilenumbruch oder Anführungszeichen', () => {
    expect(csvCell('Kaffee; Kuchen')).toBe('"Kaffee; Kuchen"');
    expect(csvCell('Zeile 1\nZeile 2')).toBe('"Zeile 1\nZeile 2"');
    expect(csvCell('Zeile 1\r\nZeile 2')).toBe('"Zeile 1\r\nZeile 2"');
    expect(csvCell('Er sagte "Hallo"')).toBe('"Er sagte ""Hallo"""');
  });

  it('kombiniert Formelentschärfung und Maskierung bei Semikolon', () => {
    expect(csvCell('=A1;B1')).toBe('"\'=A1;B1"');
  });
});

describe('escapeHtml', () => {
  it('maskiert HTML-Sonderzeichen zuverlässig', () => {
    expect(escapeHtml('&')).toBe('&amp;');
    expect(escapeHtml('<')).toBe('&lt;');
    expect(escapeHtml('>')).toBe('&gt;');
    expect(escapeHtml('"')).toBe('&quot;');
    expect(escapeHtml("'")).toBe('&#39;');
  });

  it('neutralisiert XSS-Payloads', () => {
    const payload = '<script>alert("XSS & \'pwn\'")</script>';
    const escaped = escapeHtml(payload);
    expect(escaped).toBe('&lt;script&gt;alert(&quot;XSS &amp; &#39;pwn&#39;&quot;)&lt;/script&gt;');
    expect(escaped).not.toContain('<');
    expect(escaped).not.toContain('>');
  });

  it('lässt unbedenklichen Text intakt', () => {
    expect(escapeHtml('Normaler Text mit Umlauten: äöü')).toBe('Normaler Text mit Umlauten: äöü');
  });
});
