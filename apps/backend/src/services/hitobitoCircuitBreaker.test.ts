import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HitobitoCircuitBreaker } from './hitobitoCircuitBreaker.js';

describe('HitobitoCircuitBreaker', () => {
  let breaker: HitobitoCircuitBreaker;

  beforeEach(() => {
    breaker = new HitobitoCircuitBreaker({
      failureThreshold: 3,
      cooldownMs: 1_000,
      failureWindowMs: 10_000,
    });
  });

  it('startet im Zustand CLOSED', () => {
    expect(breaker.getState('CEVI')).toBe('CLOSED');
    expect(breaker.isOpen('CEVI')).toBe(false);
  });

  it('bleibt nach dem ersten Fehler geschlossen', () => {
    breaker.recordFailure('CEVI');
    expect(breaker.getState('CEVI')).toBe('CLOSED');
    expect(breaker.isOpen('CEVI')).toBe(false);
  });

  it('löst nach Erreichen des Schwellenwerts aus (OPEN)', () => {
    breaker.recordFailure('CEVI');
    breaker.recordFailure('CEVI');
    expect(breaker.isOpen('CEVI')).toBe(false);

    breaker.recordFailure('CEVI');
    expect(breaker.getState('CEVI')).toBe('OPEN');
    expect(breaker.isOpen('CEVI')).toBe(true);
  });

  it('wechselt nach Ablauf der Abkühlzeit zu HALF_OPEN und lässt eine Probe zu', async () => {
    breaker.recordFailure('CEVI');
    breaker.recordFailure('CEVI');
    breaker.recordFailure('CEVI');
    expect(breaker.isOpen('CEVI')).toBe(true);

    // 1.1 Sekunden warten (cooldownMs ist im Test 1000ms)
    await new Promise((resolve) => setTimeout(resolve, 1100));

    expect(breaker.getState('CEVI')).toBe('HALF_OPEN');
    expect(breaker.isOpen('CEVI')).toBe(false); // Lässt Probe-Request durch

    // Scheitert die Probe, schlägt er sofort wieder auf OPEN um
    breaker.recordFailure('CEVI');
    expect(breaker.getState('CEVI')).toBe('OPEN');
    expect(breaker.isOpen('CEVI')).toBe(true);
  });

  it('schliesst nach erfolgreicher Probe wieder vollständig (CLOSED)', async () => {
    breaker.recordFailure('CEVI');
    breaker.recordFailure('CEVI');
    breaker.recordFailure('CEVI');

    await new Promise((resolve) => setTimeout(resolve, 1100));
    expect(breaker.getState('CEVI')).toBe('HALF_OPEN');

    breaker.recordSuccess('CEVI');
    expect(breaker.getState('CEVI')).toBe('CLOSED');
    expect(breaker.isOpen('CEVI')).toBe(false);
  });

  it('löst mit den Standardwerten nach 2 Fehlern aus und bleibt 5 Minuten offen', () => {
    vi.useFakeTimers();
    try {
      const b = new HitobitoCircuitBreaker();
      b.recordFailure('CEVI');
      expect(b.isOpen('CEVI')).toBe(false);
      b.recordFailure('CEVI');
      expect(b.isOpen('CEVI')).toBe(true);

      vi.advanceTimersByTime(299_000);
      expect(b.isOpen('CEVI')).toBe(true);
      vi.advanceTimersByTime(2_000);
      expect(b.getState('CEVI')).toBe('HALF_OPEN');
    } finally {
      vi.useRealTimers();
    }
  });

  it('trennt Provider unabhängig voneinander', () => {
    breaker.recordFailure('CEVI');
    breaker.recordFailure('CEVI');
    breaker.recordFailure('CEVI');

    expect(breaker.isOpen('CEVI')).toBe(true);
    expect(breaker.isOpen('PFADI')).toBe(false);
    expect(breaker.getState('PFADI')).toBe('CLOSED');
  });
});
