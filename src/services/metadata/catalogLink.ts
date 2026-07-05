import { PROVIDER_MODULES } from "@/services/provider/catalog";

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

export function metadataAliases(aliases: unknown): string[] | undefined {
  if (!aliases) return undefined;
  if (Array.isArray(aliases)) return aliases;
  if (typeof aliases === "string") {
    try {
      const parsed = JSON.parse(aliases);
      return Array.isArray(parsed) ? parsed : undefined;
    } catch {
      return undefined;
    }
  }
  return undefined;
}
