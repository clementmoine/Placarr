/**
 * CardNexus Public API client (`https://public-api.cardnexus.com/v1`).
 * Auth = bearer API key from {@link CARDNEXUS_API_KEY_ENV}.
 */

import { httpGet, httpPost } from "@/lib/http/httpClient";

export const CARDNEXUS_API_KEY_ENV = "CARDNEXUS_API_KEY";
export const CARDNEXUS_BASE_URL = "https://public-api.cardnexus.com/v1";

/** Account default is 60 req/min — stay under with a 1 s floor. */
export const CARDNEXUS_MIN_INTERVAL_MS = 1_000;

export function cardnexusApiKey(): string | null {
  const key = process.env[CARDNEXUS_API_KEY_ENV]?.trim();
  return key || null;
}

function authHeaders(key: string): Record<string, string> {
  return {
    Authorization: `Bearer ${key}`,
    Accept: "application/json",
  };
}

export async function cardnexusGet<T>(
  path: string,
  opts?: { signal?: AbortSignal },
): Promise<T | null> {
  const key = cardnexusApiKey();
  if (!key) return null;
  const url = `${CARDNEXUS_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
  try {
    const res = await httpGet<T>(url, {
      headers: authHeaders(key),
      signal: opts?.signal,
      minIntervalMs: CARDNEXUS_MIN_INTERVAL_MS,
      timeout: 12_000,
      validateStatus: (s) => s >= 200 && s < 300,
    });
    return res.data;
  } catch {
    return null;
  }
}

export async function cardnexusPost<T>(
  path: string,
  body: unknown,
  opts?: { signal?: AbortSignal },
): Promise<T | null> {
  const key = cardnexusApiKey();
  if (!key) return null;
  const url = `${CARDNEXUS_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
  try {
    const res = await httpPost<T>(url, body, {
      headers: {
        ...authHeaders(key),
        "Content-Type": "application/json",
      },
      signal: opts?.signal,
      minIntervalMs: CARDNEXUS_MIN_INTERVAL_MS,
      timeout: 12_000,
      validateStatus: (s) => s >= 200 && s < 300,
    });
    return res.data;
  } catch {
    return null;
  }
}
