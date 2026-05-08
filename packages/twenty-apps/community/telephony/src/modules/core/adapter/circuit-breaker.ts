// Per-provider circuit breaker. State lives in memory inside this process; a
// follow-up pass will mirror state to Redis so multiple workers agree.
//
// States:
//   closed     → calls flow normally. We tally outcomes in a rolling window.
//                If error rate over `windowSec` exceeds `errorRateThreshold`
//                we open the breaker.
//   open       → calls are rejected immediately. After `cooldownSec` we move
//                to half-open.
//   half-open  → exactly one trial call is allowed. Success → closed,
//                failure → open (cooldown restarts).

export type BreakerState = 'closed' | 'open' | 'half-open';

interface Outcome {
  ok: boolean;
  at: number; // ms epoch
}

export interface BreakerConfig {
  errorRateThreshold: number; // 0..1
  windowSec: number;
  cooldownSec: number;
  minSamples: number; // don't trip on tiny n
}

export class CircuitBreaker {
  private state: BreakerState = 'closed';
  private outcomes: Outcome[] = [];
  private openedAt: number | null = null;
  private halfOpenInFlight = false;

  constructor(
    public readonly providerId: string,
    private readonly cfg: BreakerConfig,
    private readonly now: () => number = () => Date.now(),
  ) {}

  // Returns true if a request may proceed. The caller MUST then call
  // `recordSuccess` / `recordFailure` based on the outcome.
  tryAcquire(): boolean {
    const t = this.now();

    if (this.state === 'open') {
      if (
        this.openedAt !== null &&
        t - this.openedAt >= this.cfg.cooldownSec * 1000
      ) {
        this.state = 'half-open';
        this.halfOpenInFlight = false;
      } else {
        return false;
      }
    }

    if (this.state === 'half-open') {
      if (this.halfOpenInFlight) return false;
      this.halfOpenInFlight = true;
      return true;
    }

    return true;
  }

  recordSuccess(): void {
    const t = this.now();
    this.outcomes.push({ ok: true, at: t });
    this.evictOld(t);

    if (this.state === 'half-open') {
      this.state = 'closed';
      this.outcomes = [];
      this.openedAt = null;
      this.halfOpenInFlight = false;
    }
  }

  recordFailure(): void {
    const t = this.now();
    this.outcomes.push({ ok: false, at: t });
    this.evictOld(t);

    if (this.state === 'half-open') {
      this.trip(t);
      return;
    }

    if (this.outcomes.length < this.cfg.minSamples) return;

    const failures = this.outcomes.filter((o) => !o.ok).length;
    const rate = failures / this.outcomes.length;
    if (rate >= this.cfg.errorRateThreshold) this.trip(t);
  }

  getState(): BreakerState {
    return this.state;
  }

  // For the settings-page health pill / metrics export.
  snapshot(): {
    state: BreakerState;
    samples: number;
    errorRate: number;
    openedAt: number | null;
  } {
    const samples = this.outcomes.length;
    const failures = this.outcomes.filter((o) => !o.ok).length;
    return {
      state: this.state,
      samples,
      errorRate: samples === 0 ? 0 : failures / samples,
      openedAt: this.openedAt,
    };
  }

  private trip(t: number): void {
    this.state = 'open';
    this.openedAt = t;
    this.halfOpenInFlight = false;
  }

  private evictOld(t: number): void {
    const cutoff = t - this.cfg.windowSec * 1000;
    while (this.outcomes.length > 0 && this.outcomes[0].at < cutoff) {
      this.outcomes.shift();
    }
  }
}
