/**
 * Einfache Versuchsbremse im Speicher (gleitendes Zeitfenster pro Schlüssel). Ein Backend-Prozess
 * reicht dafür; nach einem Neustart beginnt sie von vorn, das ist in Ordnung.
 */
export interface RateLimiter {
  /** Zählt einen Versuch und meldet, ob damit das Limit überschritten ist */
  hit(key: string): boolean;
  /** Ist das Limit schon erreicht (ohne zu zählen)? */
  isBlocked(key: string): boolean;
  /** Versuche eines Schlüssels vergessen (z. B. nach erfolgreichem Login) */
  reset(key: string): void;
}

export function createRateLimiter(
  windowMs: number,
  max: number,
  now: () => number = Date.now
): RateLimiter {
  const attempts = new Map<string, number[]>();
  let lastCleanup = now();

  function recent(key: string, t: number): number[] {
    if (t - lastCleanup > windowMs) {
      for (const [k, times] of attempts) {
        if (times.every((time) => t - time >= windowMs)) attempts.delete(k);
      }
      lastCleanup = t;
    }
    return (attempts.get(key) ?? []).filter((time) => t - time < windowMs);
  }

  return {
    hit(key) {
      const t = now();
      const times = recent(key, t);
      times.push(t);
      attempts.set(key, times);
      return times.length > max;
    },
    isBlocked(key) {
      return recent(key, now()).length >= max;
    },
    reset(key) {
      attempts.delete(key);
    },
  };
}
