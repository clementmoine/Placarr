/**
 * Re-applique les résolveurs de logo / set catalogue sur un index déjà écrit.
 */
import { providerModuleForPack } from "@/providers/shared/packOwner";

import type { SealedProductEntry } from "./indexFormat";

/**
 * Remplit `setLogo` / `catalogueSetId` encore vides via le module propriétaire
 * du pack. Utile quand le relevé de logos a grossi après le premier ingest, ou
 * quand le résolveur sait maintenant lire le slug (displays sans `setCode`).
 */
export function backfillSealedProductSetLogos(
  packId: string,
  products: Record<string, SealedProductEntry>,
): number {
  const owner = providerModuleForPack(packId);
  if (!owner?.resolveSetLogo && !owner?.resolveCatalogueSetId) return 0;
  let filled = 0;
  for (const entry of Object.values(products)) {
    const hint = {
      setCode: entry.setCode,
      slug: entry.slug,
      name: entry.name,
    };
    let touched = false;
    if (!entry.setLogo && owner.resolveSetLogo) {
      const logo = owner.resolveSetLogo(hint);
      if (logo) {
        entry.setLogo = logo;
        touched = true;
      }
    }
    if (!entry.catalogueSetId && owner.resolveCatalogueSetId) {
      const catalogueSetId = owner.resolveCatalogueSetId(hint);
      if (catalogueSetId) {
        entry.catalogueSetId = catalogueSetId;
        touched = true;
      }
    }
    if (touched) filled += 1;
  }
  return filled;
}
