/**
 * Bank frames over a short window and keep the sharpest (IDmission pattern).
 * Used for both auto-capture and manual tap (finger shake).
 */

export type BurstFrame<T> = {
  payload: T;
  /** Laplacian variance — higher is sharper. */
  sharpness: number;
  capturedAt: number;
};

export type SharpestBurstOptions = {
  /** Window length in ms (default 300). */
  windowMs?: number;
};

export class SharpestBurst<T> {
  private frames: BurstFrame<T>[] = [];
  private readonly windowMs: number;
  private openedAt: number | null = null;

  constructor(options: SharpestBurstOptions = {}) {
    this.windowMs = options.windowMs ?? 300;
  }

  open(now = Date.now()): void {
    this.frames = [];
    this.openedAt = now;
  }

  get isOpen(): boolean {
    return this.openedAt !== null;
  }

  /** Push a candidate. Returns the winner once the window elapsed, else null. */
  push(
    payload: T,
    sharpness: number,
    now = Date.now(),
  ): BurstFrame<T> | null {
    if (this.openedAt === null) {
      this.open(now);
    }
    this.frames.push({ payload, sharpness, capturedAt: now });
    if (now - (this.openedAt ?? now) < this.windowMs) {
      return null;
    }
    return this.close();
  }

  /** Force-close and return the sharpest banked frame (or null if empty). */
  close(): BurstFrame<T> | null {
    const frames = this.frames;
    this.frames = [];
    this.openedAt = null;
    if (!frames.length) return null;
    let best = frames[0]!;
    for (let i = 1; i < frames.length; i++) {
      const f = frames[i]!;
      if (f.sharpness > best.sharpness) best = f;
    }
    return best;
  }

  clear(): void {
    this.frames = [];
    this.openedAt = null;
  }
}

/** Pick sharpest among an array (pure helper for tests). */
export function pickSharpestFrame<T>(
  frames: readonly BurstFrame<T>[],
): BurstFrame<T> | null {
  if (!frames.length) return null;
  let best = frames[0]!;
  for (let i = 1; i < frames.length; i++) {
    const f = frames[i]!;
    if (f.sharpness > best.sharpness) best = f;
  }
  return best;
}
