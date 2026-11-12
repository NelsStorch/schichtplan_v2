import type { OrganizationType } from '@schichtplan/shared';

export interface CircuitBreakerOptions {
  /** Anzahl Fehler im Zeitfenster, bis der Schutzschalter auslöst (Standard: 2) */
  failureThreshold?: number;
  /** Wartezeit im Zustand OPEN in Millisekunden, bevor ein Probe-Versuch erlaubt wird (Standard: 300'000 ms = 5 Min.) */
  cooldownMs?: number;
  /** Zeitfenster in Millisekunden, innerhalb dessen Fehler gezählt werden (Standard: 120'000 ms = 2 Min.) */
  failureWindowMs?: number;
}

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

interface ProviderState {
  failures: number[];
  state: CircuitState;
  openedAt: number | null;
}

/**
 * Circuit Breaker für externe Hitobito-Instanzen (Cevi.DB, PBS MiData, Jubla-DB).
 * Verhindert minutenlanges Blockieren von HTTP-Verbindungen bei Ausfall der Verbandsdatenbank
 * und schützt Anfragende vor langen Timeouts.
 */
export class HitobitoCircuitBreaker {
  private readonly failureThreshold: number;
  private readonly cooldownMs: number;
  private readonly failureWindowMs: number;

  private states = new Map<OrganizationType, ProviderState>();

  constructor(options: CircuitBreakerOptions = {}) {
    this.failureThreshold = options.failureThreshold ?? 2;
    this.cooldownMs = options.cooldownMs ?? 300_000;
    this.failureWindowMs = options.failureWindowMs ?? 120_000;
  }

  private getProviderState(provider: OrganizationType): ProviderState {
    let s = this.states.get(provider);
    if (!s) {
      s = { failures: [], state: 'CLOSED', openedAt: null };
      this.states.set(provider, s);
    }
    return s;
  }

  public getState(provider: OrganizationType): CircuitState {
    const s = this.getProviderState(provider);
    const now = Date.now();

    if (s.state === 'OPEN') {
      if (s.openedAt && now - s.openedAt >= this.cooldownMs) {
        s.state = 'HALF_OPEN';
        return 'HALF_OPEN';
      }
      return 'OPEN';
    }

    return s.state;
  }

  /** Prüft, ob der Schutzschalter ausgelöst ist (Hitobito nicht anfragen) */
  public isOpen(provider: OrganizationType): boolean {
    return this.getState(provider) === 'OPEN';
  }

  /** Zeichnet einen API-Fehler oder Timeout auf */
  public recordFailure(provider: OrganizationType): void {
    const s = this.getProviderState(provider);
    const now = Date.now();
    s.failures = s.failures.filter((t) => now - t <= this.failureWindowMs);
    s.failures.push(now);

    if (s.state === 'HALF_OPEN' || s.failures.length >= this.failureThreshold) {
      s.state = 'OPEN';
      s.openedAt = now;
    }
  }

  /** Zeichnet einen erfolgreichen API-Aufruf auf und schliesst den Schutzschalter */
  public recordSuccess(provider: OrganizationType): void {
    const s = this.getProviderState(provider);
    s.failures = [];
    s.state = 'CLOSED';
    s.openedAt = null;
  }

  /** Setzt alle Zustände zurück (z. B. für Tests) */
  public reset(): void {
    this.states.clear();
  }
}

export const hitobitoCircuitBreaker = new HitobitoCircuitBreaker();
