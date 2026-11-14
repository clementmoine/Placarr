/**
 * Live scan session: cooldown dedup + tray of locks (ManaBox / TCG Live style).
 */

export type SessionLockKind = "barcode" | "card" | "sealed" | "manual";

export type SessionLock = {
  id: string;
  kind: SessionLockKind;
  /** Barcode raw value, card printKey, sealed skuKey, or manual placeholder. */
  key: string;
  /** Display label — catalogue title when known, else the key. */
  label: string;
  faceUrl?: string | null;
  /** Card copy language from identify (`fr` / `en`…), not a barcode field. */
  language?: string | null;
  /** Catalogue pack id from visual identify (`naruto/ninja-ranks`…). */
  packId?: string | null;
  /** Optional note from the unrecognized / manual sheet. */
  note?: string | null;
  lockedAt: number;
};

export type ScanSessionOptions = {
  /** Suppress re-lock of the same key for this many ms (default 30s). */
  cooldownMs?: number;
};

export type SessionLockOpts = {
  force?: boolean;
  language?: string | null;
  packId?: string | null;
  note?: string | null;
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

  /** Suppress re-lock without appending a tray entry (e.g. EAN after sealed sure). */
  armCooldown(kind: SessionLockKind, key: string, now = Date.now()): void {
    this.cooldownUntil.set(`${kind}:${key}`, now + this.cooldownMs);
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
    opts?: SessionLockOpts,
  ): SessionLock | null {
    if (!opts?.force && this.isCoolingDown(kind, key, now)) return null;
    const language = opts?.language?.trim().toLowerCase() || null;
    const packId = opts?.packId?.trim() || null;
    const note = opts?.note?.trim() || null;
    const entry: SessionLock = {
      id: `${kind}:${key}:${now}`,
      kind,
      key,
      label,
      faceUrl: faceUrl ?? null,
      ...(language ? { language } : {}),
      ...(packId ? { packId } : {}),
      ...(note ? { note } : {}),
      lockedAt: now,
    };
    this.locks = [entry, ...this.locks].slice(0, 40);
    this.cooldownUntil.set(`${kind}:${key}`, now + this.cooldownMs);
    return entry;
  }

  /** Patch display fields after async hydrate (title / face). */
  patch(
    id: string,
    patch: Partial<Pick<SessionLock, "label" | "faceUrl" | "language" | "packId">>,
  ): SessionLock | null {
    const idx = this.locks.findIndex((row) => row.id === id);
    if (idx < 0) return null;
    const current = this.locks[idx]!;
    const next: SessionLock = {
      ...current,
      ...patch,
      faceUrl: patch.faceUrl !== undefined ? patch.faceUrl : current.faceUrl,
    };
    this.locks = [
      ...this.locks.slice(0, idx),
      next,
      ...this.locks.slice(idx + 1),
    ];
    return next;
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
