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
});
