const MONTHLY_EXHAUSTED_COOLDOWN_MS = 12 * 60 * 60 * 1000;
const TRANSIENT_COOLDOWN_MS = 20 * 60 * 1000;

let quotaBlockedUntil = 0;

export function markTheGamesDbQuotaHit(options?: {
  monthlyExhausted?: boolean;
}): void {
  const cooldownMs = options?.monthlyExhausted
    ? MONTHLY_EXHAUSTED_COOLDOWN_MS
    : TRANSIENT_COOLDOWN_MS;
  quotaBlockedUntil = Date.now() + cooldownMs;
}

export function isTheGamesDbQuotaBlocked(): boolean {
  return Date.now() < quotaBlockedUntil;
}

export function resetTheGamesDbQuotaBlockForTests(): void {
  quotaBlockedUntil = 0;
}
