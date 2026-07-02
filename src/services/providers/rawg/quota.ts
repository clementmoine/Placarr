const RATE_LIMIT_COOLDOWN_MS = 20 * 60 * 1000;
const AUTH_FAILURE_COOLDOWN_MS = 60 * 60 * 1000;

let quotaBlockedUntil = 0;

export function markRawgQuotaHit(options?: {
  rateLimited?: boolean;
  authFailure?: boolean;
}): void {
  const cooldownMs = options?.authFailure
    ? AUTH_FAILURE_COOLDOWN_MS
    : RATE_LIMIT_COOLDOWN_MS;
  quotaBlockedUntil = Date.now() + cooldownMs;
}

export function isRawgQuotaBlocked(): boolean {
  return Date.now() < quotaBlockedUntil;
}

export function resetRawgQuotaBlockForTests(): void {
  quotaBlockedUntil = 0;
}
