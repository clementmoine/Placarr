/**
 * Durable ProviderEvidence — typed scrape yield keyed by (providerId, url).
 * Bridges Next scan and worker refresh (unlike in-job ALS FetchStores).
 * Callers pass registry provider ids; core never hardcodes them.
 */
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";

export const PROVIDER_EVIDENCE_DETAIL_KIND = "detail";

/** Align with used-game price cache freshness (24h). */
export const PROVIDER_EVIDENCE_DETAIL_TTL_MS = 24 * 60 * 60 * 1000;

export type ProviderEvidenceRecord = {
  providerId: string;
  url: string;
  kind: string;
  yieldJson: unknown;
  fetchedAt: Date;
  expiresAt: Date;
};

/**
 * Stable cache key for a provider fiche/search URL.
 * Strips hash + query; lowercases; drops trailing slash.
 */
export function normalizeProviderEvidenceUrl(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    parsed.hash = "";
    parsed.search = "";
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
  const ttlMs = input.ttlMs ?? PROVIDER_EVIDENCE_DETAIL_TTL_MS;
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
