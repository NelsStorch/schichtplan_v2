import { describe, expect, it } from 'vitest';
import { ImageUrlSchema, HexColorSchema, safeReturnTo } from '@schichtplan/shared';
import { isAllowedOrigin } from './app.js';
import { resolveJwtSecret } from './plugins/jwt.js';

describe('resolveJwtSecret', () => {
  it('verlangt in Produktion ein eigenes, langes Secret', () => {
    expect(() => resolveJwtSecret({ NODE_ENV: 'production' })).toThrow();
    expect(() => resolveJwtSecret({ NODE_ENV: 'production', JWT_SECRET: 'kurz' })).toThrow();
    expect(() =>
      resolveJwtSecret({ NODE_ENV: 'production', JWT_SECRET: 'super-secret-development-key-min-32-chars' })
    ).toThrow();
    const secret = 'a'.repeat(40);
    expect(resolveJwtSecret({ NODE_ENV: 'production', JWT_SECRET: secret })).toBe(secret);
  });

  it('hat lokal eine Vorgabe', () => {
    expect(resolveJwtSecret({ NODE_ENV: 'development' })).toHaveLength(41);
  });
});

describe('isAllowedOrigin', () => {
  const root = 'cevi-schichtplan.ch';
  it('erlaubt die eigene Domain mit https', () => {
    expect(isAllowedOrigin('https://cevi-schichtplan.ch', root, false)).toBe(true);
    expect(isAllowedOrigin('https://illnau.dev.cevi-schichtplan.ch', root, false)).toBe(true);
    expect(isAllowedOrigin('http://illnau.cevi-schichtplan.ch', root, false)).toBe(false);
  });

  it('lehnt fremde und ähnlich klingende Domains ab', () => {
    expect(isAllowedOrigin('https://evilcevi-schichtplan.ch', root, false)).toBe(false);
    expect(isAllowedOrigin('https://cevi-schichtplan.ch.evil.example', root, false)).toBe(false);
    expect(isAllowedOrigin('null', root, false)).toBe(false);
  });

  it('erlaubt die anderen Verbands-Domains nur in derselben Umgebung', () => {
    expect(isAllowedOrigin('https://illnau.pfadi-schichtplan.ch', root, false)).toBe(true);
    expect(isAllowedOrigin('https://login.vereins-schichtplan.ch', root, false)).toBe(true);
    const dev = 'dev.cevi-schichtplan.ch';
    expect(isAllowedOrigin('https://illnau.dev.pfadi-schichtplan.ch', dev, false)).toBe(true);
    expect(isAllowedOrigin('https://illnau.pfadi-schichtplan.ch', dev, false)).toBe(false);
    expect(isAllowedOrigin('https://cevi-schichtplan.ch', dev, false)).toBe(false);
  });

  it('erlaubt localhost nur lokal', () => {
    expect(isAllowedOrigin('http://illnau.localhost:3000', root, true)).toBe(true);
    expect(isAllowedOrigin('http://localhost:3002', root, false)).toBe(false);
  });
});

describe('safeReturnTo', () => {
  const root = 'cevi-schichtplan.ch';
  it('lässt eigene Ziele durch', () => {
    expect(safeReturnTo('/events/chilbi', root)).toBe('/events/chilbi');
    expect(safeReturnTo('https://illnau.cevi-schichtplan.ch/x', root)).toBe('https://illnau.cevi-schichtplan.ch/x');
  });

  it('lehnt offene Weiterleitungen ab', () => {
    for (const evil of [
      'https://evil.example',
      '//evil.example',
      '/\\evil.example',
      'javascript:alert(1)',
      'http://illnau.cevi-schichtplan.ch',
      'https://cevi-schichtplan.ch.evil.example',
    ]) {
      expect(safeReturnTo(evil, root)).toBe('/');
    }
  });
});

describe('ImageUrlSchema / HexColorSchema', () => {
  it('erlaubt Pfade, http(s) und leer', () => {
    for (const ok of ['', '/api/uploads/abc', '/images/banners/chilbi.svg', 'https://example.com/logo.png']) {
      expect(ImageUrlSchema.safeParse(ok).success).toBe(true);
    }
  });

  it('lehnt andere Schemata und protokoll-relative Pfade ab', () => {
    for (const bad of ['javascript:alert(1)', 'data:text/html,x', '//evil.example/x', '/\\evil.example', 'x.png']) {
      expect(ImageUrlSchema.safeParse(bad).success).toBe(false);
    }
  });

  it('nimmt nur #rrggbb als Farbe', () => {
    expect(HexColorSchema.safeParse('#e11d48').success).toBe(true);
    expect(HexColorSchema.safeParse('red').success).toBe(false);
    expect(HexColorSchema.safeParse('#fff;x').success).toBe(false);
  });
});
