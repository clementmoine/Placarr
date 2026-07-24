/**
 * Durable ProviderEvidence — typed scrape yield keyed by (providerId, url).
 * Bridges Next scan and worker refresh (unlike in-job ALS FetchStores).
 * Callers pass registry provider ids; core never hardcodes them.
 */
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";

export const PROVIDER_EVIDENCE_DETAIL_KIND = "detail";
export const PROVIDER_EVIDENCE_SEARCH_KIND = "search";

/** Align with used-game price cache freshness (24h). */
export const PROVIDER_EVIDENCE_DETAIL_TTL_MS = 24 * 60 * 60 * 1000;

/** SearchYield TTL — shorter than detail (queries churn; listings stale faster). */
export const PROVIDER_EVIDENCE_SEARCH_TTL_MS = 30 * 60 * 1000;

export type ProviderEvidenceRecord = {
  providerId: string;
  url: string;
  kind: string;
  yieldJson: unknown;
  fetchedAt: Date;
  expiresAt: Date;
};

/** Tracking / analytics params always dropped from evidence keys. */
const EVIDENCE_DROP_PARAM_PREFIXES = ["utm_", "fbclid", "gclid", "mc_"];
const EVIDENCE_DROP_PARAMS = new Set([
  "fbclid",
  "gclid",
  "mc_cid",
  "mc_eid",
  "ref",
  "referrer",
]);

/**
 * Search / list identity params — when present, kept (sorted) so distinct
 * queries do not collide. Fiche URLs without these still strip all search.
 */
const EVIDENCE_SEARCH_IDENTITY_PARAMS = ["q", "search", "type", "keywords"] as const;

function shouldDropSearchParam(key: string): boolean {
  const lower = key.toLowerCase();
  if (EVIDENCE_DROP_PARAMS.has(lower)) return true;
  return EVIDENCE_DROP_PARAM_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

/**
 * Stable cache key for a provider fiche or search URL.
 * Fiche: strips hash + query (after dropping trackers).
 * Search: keeps identity params (`q` / `search` / `type` / …), strips UTM.
 */
export function normalizeProviderEvidenceUrl(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    parsed.hash = "";

    for (const key of [...parsed.searchParams.keys()]) {
      if (shouldDropSearchParam(key)) {
        parsed.searchParams.delete(key);
      }
    }

    const hasIdentity = EVIDENCE_SEARCH_IDENTITY_PARAMS.some((param) => {
      const value = parsed.searchParams.get(param);
      return Boolean(value?.trim());
    });

    if (!hasIdentity) {
      parsed.search = "";
    } else {
      const kept = new URLSearchParams();
      for (const param of EVIDENCE_SEARCH_IDENTITY_PARAMS) {
        const raw = parsed.searchParams.get(param);
        if (!raw?.trim()) continue;
        const normalized = decodeURIComponent(raw)
          .trim()
          .toLowerCase()
          .replace(/\s+/g, " ");
        if (normalized) kept.set(param, normalized);
      }
      parsed.search = kept.toString() ? `?${kept.toString()}` : "";
    }

    return parsed.toString().replace(/\/$/, "").toLowerCase() || null;
  } catch {
    return null;
  }
}

export function providerEvidenceIsFresh(
  expiresAt: Date,
  now = Date.now(),
): boolean {
  return expiresAt.getTime() > now;
}

export async function getFreshProviderEvidence(
  providerId: string,
  url: string,
  now = new Date(),
): Promise<ProviderEvidenceRecord | null> {
  const normalized = normalizeProviderEvidenceUrl(url);
  if (!normalized) return null;

  const row = await prisma.providerEvidence.findUnique({
    where: {
      providerId_url: { providerId, url: normalized },
    },
  });
  if (!row) return null;
  if (!providerEvidenceIsFresh(row.expiresAt, now.getTime())) return null;

  return {
    providerId: row.providerId,
    url: row.url,
    kind: row.kind,
    yieldJson: row.yieldJson,
    fetchedAt: row.fetchedAt,
    expiresAt: row.expiresAt,
  };
}

export async function putProviderEvidence(input: {
  providerId: string;
  url: string;
  kind: string;
  yieldJson: unknown;
  ttlMs?: number;
  fetchedAt?: Date;
}): Promise<void> {
  const normalized = normalizeProviderEvidenceUrl(input.url);
  if (!normalized) return;

  const fetchedAt = input.fetchedAt ?? new Date();
  const ttlMs =
    input.ttlMs ??
    (input.kind === PROVIDER_EVIDENCE_SEARCH_KIND
      ? PROVIDER_EVIDENCE_SEARCH_TTL_MS
      : PROVIDER_EVIDENCE_DETAIL_TTL_MS);
  const expiresAt = new Date(fetchedAt.getTime() + ttlMs);
  const yieldJson = input.yieldJson as Prisma.InputJsonValue;

  await prisma.providerEvidence.upsert({
    where: {
      providerId_url: { providerId: input.providerId, url: normalized },
    },
    create: {
      providerId: input.providerId,
      url: normalized,
      kind: input.kind,
      yieldJson,
      fetchedAt,
      expiresAt,
    },
    update: {
      kind: input.kind,
      yieldJson,
      fetchedAt,
      expiresAt,
    },
  });
}
