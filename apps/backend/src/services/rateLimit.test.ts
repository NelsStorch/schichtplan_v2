import { describe, expect, it } from 'vitest';
import { createRateLimiter } from './rateLimit.js';

describe('createRateLimiter', () => {
  it('meldet erst den Versuch über dem Limit', () => {
    const limiter = createRateLimiter(1000, 3, () => 0);
    expect([limiter.hit('a'), limiter.hit('a'), limiter.hit('a'), limiter.hit('a')]).toEqual([false, false, false, true]);
    expect(limiter.hit('b')).toBe(false);
  });

  it('isBlocked zählt nicht mit', () => {
    const limiter = createRateLimiter(1000, 2, () => 0);
    expect(limiter.isBlocked('a')).toBe(false);
    limiter.hit('a');
    expect(limiter.isBlocked('a')).toBe(false);
    limiter.hit('a');
    expect(limiter.isBlocked('a')).toBe(true);
  });

  it('vergisst Versuche nach dem Zeitfenster und nach reset', () => {
    let now = 0;
    const limiter = createRateLimiter(1000, 1, () => now);
    limiter.hit('a');
    expect(limiter.isBlocked('a')).toBe(true);
    now = 1000;
    expect(limiter.isBlocked('a')).toBe(false);

    limiter.hit('b');
    limiter.reset('b');
    expect(limiter.isBlocked('b')).toBe(false);
  });

  it('verwirft älteste Schlüssel bei Erreichen von maxKeys', () => {
    // Limiter mit maximal 2 Schlüsseln
    const limiter = createRateLimiter(10_000, 1, () => 0, 2);
    limiter.hit('k1');
    limiter.hit('k2');
    expect(limiter.isBlocked('k1')).toBe(true);
    expect(limiter.isBlocked('k2')).toBe(true);

    // Dritter Schlüssel verdrängt k1 (ältesten Schlüssel)
    limiter.hit('k3');
    expect(limiter.isBlocked('k3')).toBe(true);
    expect(limiter.isBlocked('k2')).toBe(true);
    expect(limiter.isBlocked('k1')).toBe(false);
  });
});
