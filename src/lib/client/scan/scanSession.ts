/**
 * Live scan session: cooldown dedup + tray of locks (ManaBox / TCG Live style).
 */

export type SessionLockKind = "barcode" | "card";

export type SessionLock = {
  id: string;
  kind: SessionLockKind;
  /** Barcode raw value or card printKey. */
  key: string;
  /** Display label — catalogue title when known, else the key. */
  label: string;
  faceUrl?: string | null;
  /** Card copy language from identify (`fr` / `en`…), not a barcode field. */
  language?: string | null;
  lockedAt: number;
};

export type ScanSessionOptions = {
  /** Suppress re-lock of the same key for this many ms (default 30s). */
  cooldownMs?: number;
};

export class ScanSession {
  private locks: SessionLock[] = [];
  private cooldownUntil = new Map<string, number>();
  private readonly cooldownMs: number;

  constructor(options: ScanSessionOptions = {}) {
    this.cooldownMs = options.cooldownMs ?? 30_000;
  }

  list(): readonly SessionLock[] {
    return this.locks;
  }

  count(): number {
    return this.locks.length;
  }

  /** True if this key is still in cooldown and should be ignored. */
  isCoolingDown(kind: SessionLockKind, key: string, now = Date.now()): boolean {
    const until = this.cooldownUntil.get(`${kind}:${key}`);
    return until !== undefined && until > now;
  }

  /**
   * Record a lock. Returns the entry, or null if still cooling down
   * (same key within cooldown — guards auto re-locks of the same frame).
   * Pass `force` for an explicit user confirm: always appends another copy
   * (ManaBox-style quantity) and refreshes the auto cooldown.
   */
  tryLock(
    kind: SessionLockKind,
    key: string,
    label: string,
    faceUrl?: string | null,
    now = Date.now(),
    opts?: { force?: boolean; language?: string | null },
  ): SessionLock | null {
    if (!opts?.force && this.isCoolingDown(kind, key, now)) return null;
    const language = opts?.language?.trim().toLowerCase() || null;
    const entry: SessionLock = {
      id: `${kind}:${key}:${now}`,
      kind,
      key,
      label,
      faceUrl: faceUrl ?? null,
      ...(language ? { language } : {}),
      lockedAt: now,
    };
    this.locks = [entry, ...this.locks].slice(0, 40);
    this.cooldownUntil.set(`${kind}:${key}`, now + this.cooldownMs);
    return entry;
  }

  /** Remove one tray entry (undo). Clears its cooldown so it can be re-scanned. */
  remove(id: string): SessionLock | null {
    const idx = this.locks.findIndex((row) => row.id === id);
    if (idx < 0) return null;
    const [removed] = this.locks.splice(idx, 1);
    if (!removed) return null;
    this.cooldownUntil.delete(`${removed.kind}:${removed.key}`);
    this.locks = [...this.locks];
    return removed;
  }

  clear(): void {
    this.locks = [];
    this.cooldownUntil.clear();
  }
}
