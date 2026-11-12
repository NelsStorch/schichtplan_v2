import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  isPwaPromptDismissed,
  dismissPwaPrompt,
  PWA_COOKIE_KEY,
  PWA_SESSION_KEY,
  PWA_STORAGE_KEY,
} from './pwaDismissal.js';

describe('pwaDismissal', () => {
  let mockLocal: Record<string, string>;
  let mockSession: Record<string, string>;
  let mockCookie: string;

  beforeEach(() => {
    mockLocal = {};
    mockSession = {};
    mockCookie = '';

    (global as any).window = {
      location: { hostname: 'zuerich11.cevi-schichtplan.ch' },
      localStorage: {
        getItem: (k: string) => mockLocal[k] ?? null,
        setItem: (k: string, v: string) => {
          mockLocal[k] = v;
        },
        removeItem: (k: string) => {
          delete mockLocal[k];
        },
      },
      sessionStorage: {
        getItem: (k: string) => mockSession[k] ?? null,
        setItem: (k: string, v: string) => {
          mockSession[k] = v;
        },
        removeItem: (k: string) => {
          delete mockSession[k];
        },
      },
    };

    (global as any).document = {
      get cookie() {
        return mockCookie;
      },
      set cookie(val: string) {
        // Simuliere einfaches Anhängen / Setzen von Cookies
        const [pair] = val.split(';');
        const [k, v] = pair.split('=');
        if (val.includes('max-age=0')) {
          mockCookie = mockCookie
            .split(';')
            .filter((c) => !c.trim().startsWith(`${k.trim()}=`))
            .join(';');
        } else {
          mockCookie = `${mockCookie ? mockCookie + '; ' : ''}${k.trim()}=${v?.trim() ?? ''}`;
        }
      },
    };
  });

  afterEach(() => {
    delete (global as any).window;
    delete (global as any).document;
  });

  it('meldet nicht weggedrückt im Ursprungszustand', () => {
    expect(isPwaPromptDismissed()).toBe(false);
  });

  it('erkennt Wegdrücken via dismissPwaPrompt()', () => {
    const now = 1710000000000;
    dismissPwaPrompt(now);

    expect(isPwaPromptDismissed(now + 1000)).toBe(true);
    expect(mockLocal[PWA_STORAGE_KEY]).toBe(String(now));
    expect(mockSession[PWA_SESSION_KEY]).toBe('1');
    expect(mockCookie).toContain(`${PWA_COOKIE_KEY}=${now}`);
  });

  it('erkennt abgelaufene 14 Tage als wieder anzuzeigen', () => {
    const dismissedAt = 1710000000000;
    mockLocal[PWA_STORAGE_KEY] = String(dismissedAt);
    mockCookie = `${PWA_COOKIE_KEY}=${dismissedAt}`;

    // 13 Tage später: noch weggedrückt
    const after13Days = dismissedAt + 13 * 24 * 60 * 60 * 1000;
    expect(isPwaPromptDismissed(after13Days)).toBe(true);

    // 15 Tage später: Frist abgelaufen
    const after15Days = dismissedAt + 15 * 24 * 60 * 60 * 1000;
    expect(isPwaPromptDismissed(after15Days)).toBe(false);
  });

  it('erkennt Wegdrücken rein aus dem Cookie über Subdomains hinweg', () => {
    const now = 1710000000000;
    // localStorage ist leer (z. B. auf anderer Subdomain)
    mockLocal = {};
    mockCookie = `${PWA_COOKIE_KEY}=${now}`;

    expect(isPwaPromptDismissed(now + 10_000)).toBe(true);
  });

  it('ignoriert ungültige oder fehlerhafte Werte sauber', () => {
    mockLocal[PWA_STORAGE_KEY] = 'invalid-timestamp';
    mockCookie = `${PWA_COOKIE_KEY}=garbage`;

    expect(isPwaPromptDismissed()).toBe(false);
  });
});
