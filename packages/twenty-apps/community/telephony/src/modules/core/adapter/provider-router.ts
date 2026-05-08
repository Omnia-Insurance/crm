import { CircuitBreaker } from 'src/modules/core/adapter/circuit-breaker';
import { TelephonyAdapter } from 'src/modules/core/adapter/telephony-adapter';
import {
  InitiateCallArgs,
  ProviderCapabilities,
  ProviderId,
  SendSmsArgs,
} from 'src/modules/core/adapter/types';

export type RouterPolicy = 'weighted' | 'priority' | 'cost';

export interface RouterConfig {
  policy: RouterPolicy;
  weights: Partial<Record<ProviderId, number>>;
  // Cost lookup for the 'cost' policy. Static and coarse for v1; can be
  // upgraded to a per-destination matrix later.
  costPerMinuteUsd?: Partial<Record<ProviderId, number>>;
  costPerSmsUsd?: Partial<Record<ProviderId, number>>;
}

type Capability = keyof ProviderCapabilities;

interface RegisteredAdapter {
  adapter: TelephonyAdapter;
  breaker: CircuitBreaker;
}

// The router is the only thing logic functions and jobs should call when
// they need to dial out or send SMS. Outbound only — inbound webhooks are
// pinned to the provider that owns the dialed number.
export class ProviderRouter {
  private readonly adapters = new Map<ProviderId, RegisteredAdapter>();

  constructor(private readonly cfg: RouterConfig) {}

  register(adapter: TelephonyAdapter, breaker: CircuitBreaker): void {
    this.adapters.set(adapter.providerId, { adapter, breaker });
  }

  // Single outbound call. On a transient failure from the chosen provider we
  // try the next-best provider once, then give up.
  async initiateCall(
    args: InitiateCallArgs,
  ): Promise<{ provider: ProviderId; callSid: string }> {
    return this.runWithFailover('voice', async (adapter) => {
      const { callSid } = await adapter.initiateCall(args);
      return { provider: adapter.providerId, callSid };
    });
  }

  async sendSms(
    args: SendSmsArgs,
  ): Promise<{ provider: ProviderId; messageSid: string }> {
    const cap: Capability =
      args.mediaUrls && args.mediaUrls.length > 0 ? 'mms' : 'sms';
    return this.runWithFailover(cap, async (adapter) => {
      const { messageSid } = await adapter.sendSms(args);
      return { provider: adapter.providerId, messageSid };
    });
  }

  // Used by the settings page to show provider status pills, and by the
  // health-probe job to feed the breakers.
  async probeAll(): Promise<
    Array<{ providerId: ProviderId; ok: boolean; latencyMs: number }>
  > {
    const results: Array<{
      providerId: ProviderId;
      ok: boolean;
      latencyMs: number;
    }> = [];
    for (const { adapter, breaker } of this.adapters.values()) {
      try {
        const r = await adapter.probe();
        results.push({ providerId: adapter.providerId, ...r });
        if (r.ok) breaker.recordSuccess();
        else breaker.recordFailure();
      } catch {
        breaker.recordFailure();
        results.push({
          providerId: adapter.providerId,
          ok: false,
          latencyMs: -1,
        });
      }
    }
    return results;
  }

  // ── selection ────────────────────────────────────────────────────────

  private async runWithFailover<T>(
    cap: Capability,
    op: (adapter: TelephonyAdapter) => Promise<T>,
  ): Promise<T> {
    const candidates = this.candidates(cap);
    if (candidates.length === 0) {
      throw new Error(
        `No healthy telephony provider available for capability "${cap}"`,
      );
    }

    let lastErr: unknown;
    for (let i = 0; i < Math.min(candidates.length, 2); i++) {
      const choice = this.pick(candidates);
      if (!choice) break;
      const { adapter, breaker } = choice;

      if (!breaker.tryAcquire()) {
        // Should be filtered by `candidates`, but guard anyway.
        candidates.splice(candidates.indexOf(choice), 1);
        continue;
      }

      try {
        const result = await op(adapter);
        breaker.recordSuccess();
        return result;
      } catch (err) {
        lastErr = err;
        const cls = adapter.classifyError(err);
        if (cls === 'permanent' || cls === 'unauthorized') {
          breaker.recordFailure();
          throw err;
        }
        breaker.recordFailure();
        candidates.splice(candidates.indexOf(choice), 1);
      }
    }

    throw lastErr ?? new Error('Telephony provider router exhausted');
  }

  private candidates(cap: Capability): RegisteredAdapter[] {
    const out: RegisteredAdapter[] = [];
    for (const reg of this.adapters.values()) {
      if (!reg.adapter.capabilities[cap]) continue;
      if (reg.breaker.getState() === 'open') continue;
      const w = this.cfg.weights[reg.adapter.providerId] ?? 0;
      if (w <= 0 && this.cfg.policy === 'weighted') continue;
      out.push(reg);
    }
    return out;
  }

  private pick(candidates: RegisteredAdapter[]): RegisteredAdapter | undefined {
    if (candidates.length === 0) return undefined;

    if (this.cfg.policy === 'priority') {
      return [...candidates].sort(
        (a, b) =>
          (this.cfg.weights[b.adapter.providerId] ?? 0) -
          (this.cfg.weights[a.adapter.providerId] ?? 0),
      )[0];
    }

    if (this.cfg.policy === 'cost') {
      const cost = this.cfg.costPerMinuteUsd ?? {};
      return [...candidates].sort(
        (a, b) =>
          (cost[a.adapter.providerId] ?? Infinity) -
          (cost[b.adapter.providerId] ?? Infinity),
      )[0];
    }

    // weighted-random
    const total = candidates.reduce(
      (s, c) => s + (this.cfg.weights[c.adapter.providerId] ?? 0),
      0,
    );
    if (total <= 0) return candidates[0];
    let r = Math.random() * total;
    for (const c of candidates) {
      r -= this.cfg.weights[c.adapter.providerId] ?? 0;
      if (r <= 0) return c;
    }
    return candidates[candidates.length - 1];
  }
}
