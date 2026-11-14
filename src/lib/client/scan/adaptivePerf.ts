/**
 * Device-adaptive scan pacing.
 *
 * Identify samples are serialised (one in flight), so a slow device simply
 * samples less often — there is deliberately **no** tap-to-scan mode: the
 * camera must keep working by itself whatever the phone. What adapts is the
 * idle backoff when nothing is framed, plus a rolling mean of the identify
 * cost for the HUD.
 */

export type AdaptivePerfProfile = {
  /** Extra pause between identify ticks when nothing is framed. */
  idleBackoffMs: number;
  /** Measured mean identify cost in ms (0 until bench). */
  meanIdentifyMs: number;
};

export type AdaptivePerfOptions = {
  /** Idle frames without a quality pass before backoff (default 5). */
  idleFramesBeforeBackoff?: number;
  idleBackoffMs?: number;
  /** Rolling window size for mean identify cost. */
  benchWindow?: number;
};

const DEFAULTS = {
  idleFramesBeforeBackoff: 5,
  idleBackoffMs: 300,
  benchWindow: 8,
};

export class AdaptivePerf {
  private readonly opts: typeof DEFAULTS;
  private costs: number[] = [];
  private idleFailStreak = 0;

  constructor(options: AdaptivePerfOptions = {}) {
    this.opts = { ...DEFAULTS, ...options };
  }

  /** Record one identify round-trip duration. */
  recordIdentifyMs(ms: number): void {
    if (!Number.isFinite(ms) || ms < 0) return;
    this.costs.push(ms);
    if (this.costs.length > this.opts.benchWindow) {
      this.costs.shift();
    }
  }

  /** Call each tick with whether quality gates passed / card was aimed. */
  noteAim(hasAim: boolean): void {
    if (hasAim) {
      this.idleFailStreak = 0;
    } else {
      this.idleFailStreak += 1;
    }
  }

  meanIdentifyMs(): number {
    if (!this.costs.length) return 0;
    return this.costs.reduce((a, b) => a + b, 0) / this.costs.length;
  }

  profile(): AdaptivePerfProfile {
    const idle = this.idleFailStreak >= this.opts.idleFramesBeforeBackoff;
    return {
      idleBackoffMs: idle ? this.opts.idleBackoffMs : 0,
      meanIdentifyMs: this.meanIdentifyMs(),
    };
  }

  reset(): void {
    this.costs = [];
    this.idleFailStreak = 0;
  }
}
