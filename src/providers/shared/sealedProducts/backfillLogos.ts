/**
 * Re-applique les résolveurs de logo / set catalogue sur un index déjà écrit.
 */
import { parsePrintKey } from "@/core/identify/printKey";
import { providerModulesForPack } from "@/providers/shared/packOwner";

import type { SealedProductEntry } from "./indexFormat";

const LOCALE_SLUG_SUFFIX = /-(en|de|it|fr|es|jp|pt|zh)$/i;

/** `foo-en` / `foo-de` → même produit retail, langues différentes. */
export function sealedProductSlugFamily(slug: string): string {
  return slug.trim().toLowerCase().replace(LOCALE_SLUG_SUFFIX, "");
}

/**
 * Signature des printKeys garantis — deux SKU avec la même liste non vide
 * sont le même retail (alias locale lorcards ↔ site officiel).
 */
export function sealedGuaranteedPrintSignature(
  entry: SealedProductEntry,
): string | null {
  const keys = entry.guaranteedPrints
    .map((print) => print.printKey?.trim())
    .filter((key): key is string => Boolean(key))
    .map((key) => key.toLowerCase())
    .sort();
  if (keys.length === 0) return null;
  return keys.join("\0");
}

/**
 * Unique chapter set from guaranteed prints.
 *
 * In-set promos (`p3`) keep the chapter. Standalone promo groupings (`d23`,
 * `pd1`, …) stay empty — their wordmark is not the main-set logo.
 */
export function uniqueChapterSetFromGuarantees(
  entry: SealedProductEntry,
): string | null {
  const keys = entry.guaranteedPrints
    .map((print) => print.printKey?.trim())
    .filter((key): key is string => Boolean(key));
  if (keys.length === 0) return null;
  const sets = new Set<string>();
  for (const key of keys) {
    const parsed = parsePrintKey(key);
    if (!parsed?.set) return null;
    const grouping = parsed.grouping?.trim().toLowerCase();
    if (grouping && !/^p\d+$/.test(grouping)) return null;
    sets.add(parsed.set);
  }
  return sets.size === 1 ? [...sets][0]! : null;
}

function copyLogoFields(
  donor: SealedProductEntry,
  entry: SealedProductEntry,
): boolean {
  let touched = false;
  if (!entry.setLogo && donor.setLogo) {
    entry.setLogo = donor.setLogo;
    touched = true;
  }
  if (!entry.catalogueSetId && donor.catalogueSetId) {
    entry.catalogueSetId = donor.catalogueSetId;
    touched = true;
  }
  return touched;
}

/**
 * Remplit `setLogo` / `catalogueSetId` encore vides via les modules du pack.
 * Utile quand le relevé de logos a grossi après le premier ingest, ou quand le
 * résolveur sait maintenant lire le slug (displays sans `setCode`).
 *
 * Plusieurs modules peuvent partager un `dataPack` — on essaie chaque hook
 * chez celui qui l'expose (ex. logos Live, tirages TCGdex).
 *
 * Ensuite : copie entre SKU clairement jumeaux (mêmes printKeys garantis, ou
 * suffixe de langue), puis set unique lu dans les garanties si pas de
 * `setCode` boutique (coffret cadeau Scrooge → set 10).
 */
export function backfillSealedProductSetLogos(
  packId: string,
  products: Record<string, SealedProductEntry>,
): number {
  const owners = providerModulesForPack(packId);
  let filled = 0;
  const entries = Object.values(products);
  const hasResolver = owners.some(
    (m) => m.resolveSetLogo || m.resolveCatalogueSetId,
  );

  if (hasResolver) {
    for (const entry of entries) {
      const hint = {
        setCode: entry.setCode,
        slug: entry.slug,
        name: entry.name,
      };
      let touched = false;
      if (!entry.setLogo) {
        for (const owner of owners) {
          const logo = owner.resolveSetLogo?.(hint);
          if (logo) {
            entry.setLogo = logo;
            touched = true;
            break;
          }
        }
      }
      if (!entry.catalogueSetId) {
        for (const owner of owners) {
          const catalogueSetId = owner.resolveCatalogueSetId?.(hint);
          if (catalogueSetId) {
            entry.catalogueSetId = catalogueSetId;
            touched = true;
            break;
          }
        }
      }
      if (touched) filled += 1;
    }
  }

  const byPrints = new Map<string, SealedProductEntry[]>();
  const byFamily = new Map<string, SealedProductEntry[]>();
  for (const entry of entries) {
    const sig = sealedGuaranteedPrintSignature(entry);
    if (sig) {
      const list = byPrints.get(sig) ?? [];
      list.push(entry);
      byPrints.set(sig, list);
    }
    const family = sealedProductSlugFamily(entry.slug);
    if (family) {
      const list = byFamily.get(family) ?? [];
      list.push(entry);
      byFamily.set(family, list);
    }
  }

  for (const group of [...byPrints.values(), ...byFamily.values()]) {
    const donor = group.find((entry) => entry.setLogo || entry.catalogueSetId);
    if (!donor) continue;
    for (const entry of group) {
      if (entry === donor) continue;
      if (copyLogoFields(donor, entry)) filled += 1;
    }
  }

  if (hasResolver) {
    for (const entry of entries) {
      if (entry.setLogo && entry.catalogueSetId) continue;
      // Boutique déjà étiquetée D23 / D100 : ne pas inventer un logo de chapitre.
      if (entry.setCode?.trim()) continue;
      const chapter = uniqueChapterSetFromGuarantees(entry);
      if (!chapter) continue;
      const hint = { setCode: chapter, slug: entry.slug, name: entry.name };
      let touched = false;
      if (!entry.setLogo) {
        for (const owner of owners) {
          const logo = owner.resolveSetLogo?.(hint);
          if (logo) {
            entry.setLogo = logo;
            touched = true;
            break;
          }
        }
      }
      if (!entry.catalogueSetId) {
        for (const owner of owners) {
          const catalogueSetId = owner.resolveCatalogueSetId?.(hint);
          if (catalogueSetId) {
            entry.catalogueSetId = catalogueSetId;
            touched = true;
            break;
          }
        }
      }
      if (touched) filled += 1;
    }
  }

  return filled;
}
