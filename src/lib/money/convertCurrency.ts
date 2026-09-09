/**
 * Display / consensus currency for Placarr price summaries.
 *
 * Offers in other currencies never enter averages; they may only fill
 * {@link priceEstimated} via FX fallback (shown with ~).
 */
export const DISPLAY_CURRENCY = "EUR";

export function normalizeCurrencyCode(
  currency: string | null | undefined,
): string {
  const trimmed = currency?.trim().toUpperCase();
  return trimmed || DISPLAY_CURRENCY;
}

export function isDisplayCurrency(
  currency: string | null | undefined,
): boolean {
  return normalizeCurrencyCode(currency) === DISPLAY_CURRENCY;
}

type RateCacheEntry = {
  rate: number;
  fetchedAt: number;
};

const rateCache = new Map<string, RateCacheEntry>();
const RATE_TTL_MS = 24 * 60 * 60_000;

/** Test helper. */
export function resetCurrencyRateCache() {
  rateCache.clear();
}

/**
 * Units of `to` per 1 unit of `from` (e.g. USD→EUR ≈ 0.87).
 * Uses the ECB daily feed via Frankfurter. Cached 24h.
 */
export async function fetchCurrencyRate(
  from: string,
  to: string,
  options: { signal?: AbortSignal } = {},
): Promise<number | null> {
  const source = normalizeCurrencyCode(from);
  const target = normalizeCurrencyCode(to);
  if (source === target) return 1;

  const key = `${source}:${target}`;
  const cached = rateCache.get(key);
  if (cached && Date.now() - cached.fetchedAt < RATE_TTL_MS) {
    return cached.rate;
  }

  try {
    const url = `https://api.frankfurter.app/latest?from=${encodeURIComponent(source)}&to=${encodeURIComponent(target)}`;
    const response = await fetch(url, {
      signal: options.signal,
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return null;
    const body = (await response.json()) as {
      rates?: Record<string, number>;
    };
    const rate = body.rates?.[target];
    if (typeof rate !== "number" || !(rate > 0)) return null;
    rateCache.set(key, { rate, fetchedAt: Date.now() });
    return rate;
  } catch {
    return null;
  }
}

/** Convert minor units (cents) between currencies. */
export async function convertCents(
  cents: number,
  from: string,
  to: string = DISPLAY_CURRENCY,
  options: { signal?: AbortSignal } = {},
): Promise<number | null> {
  if (!Number.isFinite(cents) || cents <= 0) return null;
  const rate = await fetchCurrencyRate(from, to, options);
  if (rate == null) return null;
  return Math.max(1, Math.round(cents * rate));
}
