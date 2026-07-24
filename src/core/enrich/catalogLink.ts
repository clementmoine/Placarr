import { PROVIDER_MODULES } from "@/core/catalog/catalog";
import { canonicalProviderIdForSource } from "@/core/catalog/sourceTraits";

import type {
  CatalogExternalLink,
  CatalogExternalLinkContext,
} from "@/types/providerModule";

export function buildCatalogExternalLink(
  ctx: CatalogExternalLinkContext,
): CatalogExternalLink | null {
  for (const providerModule of PROVIDER_MODULES) {
    if (!providerModule.buildCatalogExternalLink) continue;
    const link = providerModule.buildCatalogExternalLink(ctx);
    if (link) {
      return {
        ...link,
        providerLabel:
          providerModule.evidence?.label ?? providerModule.info.label,
      };
    }
  }
  return null;
}

/**
 * Prefer a scraped, provider-verified product URL over the heuristic search link.
 */
export function resolveCatalogExternalLink(
  ctx: CatalogExternalLinkContext,
  facts?: unknown,
): CatalogExternalLink | null {
  const verified = verifiedCatalogProductLinkFromFacts(facts);
  if (verified) return verified;
  return buildCatalogExternalLink(ctx);
}

export function verifiedCatalogProductLinkFromFacts(
  facts: unknown,
): CatalogExternalLink | null {
  const list = normalizeFactList(facts);
  let fallback: CatalogExternalLink | null = null;

  for (const fact of list) {
    if (fact.kind !== "external-link") continue;
    const url = typeof fact.url === "string" ? fact.url.trim() : "";
    if (!url) continue;
    const cleaned = url.split(/[?#]/)[0] ?? url;
    const sourceId =
      canonicalProviderIdForSource(String(fact.source ?? "")) ??
      canonicalProviderIdForSource(String(fact.label ?? "")) ??
      canonicalProviderIdForSource(String(fact.providerLabel ?? ""));

    for (const providerModule of PROVIDER_MODULES) {
      if (!providerModule.isVerifiedCatalogProductUrl?.(cleaned)) continue;
      const link: CatalogExternalLink = {
        url: cleaned,
        isDirect: true,
        providerLabel:
          providerModule.evidence?.label ?? providerModule.info.label,
      };
      if (!sourceId || sourceId === providerModule.info.id) return link;
      fallback ??= link;
    }
  }

  return fallback;
}

/** @deprecated Prefer {@link verifiedCatalogProductLinkFromFacts}. */
export function priceChartingGameUrlFromFacts(facts: unknown): string | null {
  return verifiedCatalogProductLinkFromFacts(facts)?.url ?? null;
}

function normalizeFactList(facts: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(facts)) {
    return facts.filter(
      (fact): fact is Record<string, unknown> =>
        !!fact && typeof fact === "object",
    );
  }
  if (typeof facts === "string" && facts.trim()) {
    try {
      return normalizeFactList(JSON.parse(facts));
    } catch {
      return [];
    }
  }
  return [];
}

export { metadataAliases } from "@/core/enrich/aliases";
