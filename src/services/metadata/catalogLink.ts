import { PROVIDER_MODULES } from "@/services/provider/registry";

import type {
  CatalogExternalLink,
  CatalogExternalLinkContext,
} from "@/types/providerModule";

export function buildCatalogExternalLink(
  ctx: CatalogExternalLinkContext,
): CatalogExternalLink | null {
  for (const module of PROVIDER_MODULES) {
    if (!module.buildCatalogExternalLink) continue;
    const link = module.buildCatalogExternalLink(ctx);
    if (link) {
      return {
        ...link,
        providerLabel: module.evidence?.label ?? module.info.label,
      };
    }
  }
  return null;
}

export function metadataAliases(
  aliases: unknown,
): string[] | undefined {
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
