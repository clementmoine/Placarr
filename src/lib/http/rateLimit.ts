/**
 * In-process fixed-window rate limiting.
 *
 * Placarr is a single-container self-hosted app: the Next server is one
 * process, so an in-memory counter is the whole story — no Redis to run, and
 * nothing to keep in sync. The trade-off is explicit: counters reset when the
 * process restarts, and a horizontally scaled deployment would need a shared
 * store. That is fine for slowing credential stuffing and abuse on one box; it
 * is not a defence against a distributed attacker.
 */

/** Bound the map so a flood of distinct keys cannot grow it without limit. */
const MAX_TRACKED_KEYS = 10_000;

type Window = { count: number; resetAt: number };

const windows = new Map<string, Window>();

export type RateLimitResult = {
  allowed: boolean;
  /** Seconds until the window resets — suitable for a `Retry-After` header. */
  retryAfterSeconds: number;
};

export type RateLimitOptions = {
  limit: number;
  windowMs: number;
  /** Injectable clock so tests do not depend on wall time. */
  now?: number;
};

function evictExpired(now: number): void {
  for (const [key, window] of windows) {
    if (window.resetAt <= now) windows.delete(key);
  }
}

/**
 * Count one hit against `key`. Returns whether it is allowed; the caller
 * decides what a refusal means (401, 429, silent drop…).
 */
export function consumeRateLimit(
  key: string,
  options: RateLimitOptions,
): RateLimitResult {
  const now = options.now ?? Date.now();
  const existing = windows.get(key);

  if (!existing || existing.resetAt <= now) {
    if (windows.size >= MAX_TRACKED_KEYS) {
      evictExpired(now);
      if (windows.size >= MAX_TRACKED_KEYS) {
        // Still full of live windows: drop the oldest insertion rather than
        // grow. Under that much pressure the limiter is already the least of
        // the instance's problems.
        const oldest = windows.keys().next();
        if (!oldest.done) windows.delete(oldest.value);
      }
    }
    windows.set(key, { count: 1, resetAt: now + options.windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  existing.count += 1;
  if (existing.count > options.limit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((existing.resetAt - now) / 1000),
      ),
    };
  }

  return { allowed: true, retryAfterSeconds: 0 };
}

export function resetRateLimitsForTests(): void {
  windows.clear();
}

/**
 * Best-effort client address.
 *
 * `x-forwarded-for` is only trustworthy when a reverse proxy sets it; exposed
 * directly, a client can send anything. That is why the sensitive limits are
 * keyed by account first and by address only as a second bucket — spoofing the
 * header must not let an attacker escape the per-account limit.
 */
export function clientIpFrom(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  if (first) return first;
  return headers.get("x-real-ip")?.trim() || "unknown";
}
