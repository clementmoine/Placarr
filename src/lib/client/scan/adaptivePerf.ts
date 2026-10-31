/**
 * Device-adaptive scan pacing (OpenRift-inspired).
 * Self-bench → tap-to-scan when frames are too slow; idle backoff when aimless.
 * Recovers to continuous when the rolling mean cools down (vision overlays
 * temporarily inflate identify cost — don't latch forever).
 */

export type AdaptivePerfProfile = {
  /** Prefer manual tap instead of continuous identify. */
  tapToScan: boolean;
  /** Extra pause between identify ticks when nothing is framed. */
  idleBackoffMs: number;
  /** Measured mean identify cost in ms (0 until bench). */
  meanIdentifyMs: number;
};

export type AdaptivePerfOptions = {
  /** Above this mean identify ms → tap-to-scan (default 2800). */
  slowThresholdMs?: number;
  /**
   * Mean must fall below this to leave tap-to-scan (default 60% of slow).
   * Hysteresis avoids flapping.
   */
  recoverThresholdMs?: number;
  /** Idle frames without a quality pass before backoff (default 5). */
  idleFramesBeforeBackoff?: number;
  idleBackoffMs?: number;
  /** Rolling window size for mean identify cost. */
  benchWindow?: number;
};

const DEFAULTS = {
  // Phone + live vision (edge detect / OCR) often lands 1.5–2.5s; 1800 was
  // latching tap mode after a few samples and never recovering.
  slowThresholdMs: 2800,
  recoverThresholdMs: 0, // computed from slow if unset
  idleFramesBeforeBackoff: 5,
  idleBackoffMs: 300,
  benchWindow: 8,
};

export class AdaptivePerf {
  private readonly opts: typeof DEFAULTS & { recoverThresholdMs: number };
  private costs: number[] = [];
  private idleFailStreak = 0;
  private tapToScan = false;

  constructor(options: AdaptivePerfOptions = {}) {
    const slow = options.slowThresholdMs ?? DEFAULTS.slowThresholdMs;
    this.opts = {
      ...DEFAULTS,
      ...options,
      slowThresholdMs: slow,
      recoverThresholdMs:
        options.recoverThresholdMs ?? Math.round(slow * 0.6),
    };
  }

  /** Record one identify round-trip duration. */
  recordIdentifyMs(ms: number): void {
    if (!Number.isFinite(ms) || ms < 0) return;
    this.costs.push(ms);
    if (this.costs.length > this.opts.benchWindow) {
      this.costs.shift();
    }
    const mean = this.meanIdentifyMs();
    if (mean >= this.opts.slowThresholdMs) {
      this.tapToScan = true;
    } else if (
      this.tapToScan &&
      this.costs.length >= Math.min(4, this.opts.benchWindow) &&
      mean <= this.opts.recoverThresholdMs
    ) {
      this.tapToScan = false;
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
    const idle =
      this.idleFailStreak >= this.opts.idleFramesBeforeBackoff;
    return {
      tapToScan: this.tapToScan,
      idleBackoffMs: idle ? this.opts.idleBackoffMs : 0,
      meanIdentifyMs: this.meanIdentifyMs(),
    };
  }

  /** Force tap mode (tests / UI). */
  setTapToScan(on: boolean): void {
    this.tapToScan = on;
  }

  reset(): void {
    this.costs = [];
    this.idleFailStreak = 0;
    this.tapToScan = false;
  }
}
