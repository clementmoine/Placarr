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

/** Sets catalogue qui sont des bacs promo, pas un chapitre de série. */
function isStandalonePromoSetId(setId: string): boolean {
  const id = setId.trim().toLowerCase();
  return id === "promo" || id === "promos";
}

/**
 * Unique chapter set from guaranteed prints.
 *
 * In-set promos (`p3`) keep the chapter. Standalone promo groupings (`d23`,
 * `pd1`, …) et printKeys `…:promo-…` restent vides — sinon un duopack S28
 * avec PR fenêtre (`naruto:promo-pr0096`) votait `catalogueSetId=promo` et
 * `boutiqueCodeToCatalogueSetId` propageait `s28 → promo` à tous les scellés.
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
    if (isStandalonePromoSetId(parsed.set)) return null;
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

/** Prix / titre boutique — jumeaux locale (gift EN) vs coffret FR tarifé. */
function copyShopIdentityFields(
  donor: SealedProductEntry,
  entry: SealedProductEntry,
): boolean {
  let touched = false;
  if (
    (entry.priceCents == null || !(entry.priceCents > 0)) &&
    typeof donor.priceCents === "number" &&
    donor.priceCents > 0
  ) {
    entry.priceCents = donor.priceCents;
    touched = true;
  }
  if ((!entry.name || !entry.name.trim()) && donor.name?.trim()) {
    entry.name = donor.name.trim();
    touched = true;
  }
  return touched;
}

/**
 * Boutique `WHW` → catalogue `10` quand un seul mapping est attesté sur l'index.
 */
export function boutiqueCodeToCatalogueSetId(
  products: readonly SealedProductEntry[],
): Map<string, string> {
  const votes = new Map<string, Map<string, number>>();
  for (const entry of products) {
    const code = entry.setCode?.trim();
    const cat = entry.catalogueSetId?.trim();
    if (!code || !cat || code === cat) continue;
    // Jamais `s28 → promo` : une insert fenêtre ne redéfinit pas la série.
    if (isStandalonePromoSetId(cat) && !isStandalonePromoSetId(code)) {
      continue;
    }
    const key = code.toLowerCase();
    const byCat = votes.get(key) ?? new Map<string, number>();
    byCat.set(cat, (byCat.get(cat) ?? 0) + 1);
    votes.set(key, byCat);
  }
  const out = new Map<string, string>();
  for (const [code, byCat] of votes) {
    if (byCat.size !== 1) continue;
    out.set(code, [...byCat.keys()][0]!);
  }
  return out;
}

function remapPacksBySetKeys(
  packsBySet: Record<string, number> | null | undefined,
  codeToCat: ReadonlyMap<string, string>,
): Record<string, number> | null | undefined {
  if (!packsBySet) return packsBySet;
  let touched = false;
  const out: Record<string, number> = {};
  for (const [key, qty] of Object.entries(packsBySet)) {
    const mapped = codeToCat.get(key.trim().toLowerCase()) ?? key;
    if (mapped !== key) touched = true;
    out[mapped] = (out[mapped] ?? 0) + qty;
  }
  return touched ? out : packsBySet;
}

function remapGuaranteeSetKeys(
  guaranteeSets: string[] | null | undefined,
  codeToCat: ReadonlyMap<string, string>,
): string[] | null | undefined {
  if (!guaranteeSets?.length) return guaranteeSets;
  let touched = false;
  const out = guaranteeSets.map((row) => {
    const mapped = codeToCat.get(row.trim().toLowerCase());
    if (mapped && mapped !== row) {
      touched = true;
      return mapped;
    }
    return row;
  });
  return touched ? out : guaranteeSets;
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
    const logoDonor = group.find(
      (entry) => entry.setLogo || entry.catalogueSetId,
    );
    for (const entry of group) {
      let touched = false;
      if (logoDonor && entry !== logoDonor && copyLogoFields(logoDonor, entry)) {
        touched = true;
      }
      for (const donor of group) {
        if (donor === entry) continue;
        if (copyShopIdentityFields(donor, entry)) touched = true;
      }
      if (touched) filled += 1;
    }
  }

  /*
    Chapitre lu dans les printKeys garantis — même avec un setCode boutique
    (WHW, FAB…). Sans ça, le conseil d'achat ne joint jamais la check-list
    numérique (`10`) au SKU étiqueté `WHW`.
  */
  for (const entry of entries) {
    const chapter = uniqueChapterSetFromGuarantees(entry);
    if (!chapter) continue;
    let touched = false;
    if (!entry.catalogueSetId) {
      entry.catalogueSetId = chapter;
      touched = true;
    }
    /*
      Deck + booster inclus : les garanties comptent sur le chapitre, les
      sachets via packsBySet. Sans guaranteeSets, projectBuyProductForSet
      vide les prints dès que packsBySet est présent.
    */
    if (!entry.guaranteeSets?.length && entry.guaranteedPrints.length > 0) {
      entry.guaranteeSets = [chapter];
      touched = true;
    }
    if (touched) filled += 1;
  }

  const codeToCat = boutiqueCodeToCatalogueSetId(entries);
  if (codeToCat.size > 0) {
    for (const entry of entries) {
      const nextPacks = remapPacksBySetKeys(entry.packsBySet, codeToCat);
      const nextGuarantees = remapGuaranteeSetKeys(
        entry.guaranteeSets,
        codeToCat,
      );
      let touched = false;
      if (nextPacks !== entry.packsBySet) {
        entry.packsBySet = nextPacks;
        touched = true;
      }
      if (nextGuarantees !== entry.guaranteeSets) {
        entry.guaranteeSets = nextGuarantees;
        touched = true;
      }
      // Display WHW sans garanties : hérite du mapping attesté par un deck frère.
      if (!entry.catalogueSetId && entry.setCode?.trim()) {
        const mapped = codeToCat.get(entry.setCode.trim().toLowerCase());
        if (mapped) {
          entry.catalogueSetId = mapped;
          touched = true;
        }
      }
      if (touched) filled += 1;
    }
  }

  /*
    Index déjà pollué (duopack S28 + PR fenêtre → catalogueSetId=promo écrit
    en sqlite) : si le setCode boutique est une série, on le remet.
  */
  for (const entry of entries) {
    const cat = entry.catalogueSetId?.trim();
    const code = entry.setCode?.trim();
    if (
      cat &&
      code &&
      isStandalonePromoSetId(cat) &&
      !isStandalonePromoSetId(code)
    ) {
      entry.catalogueSetId = code;
      filled += 1;
    }
  }

  if (hasResolver) {
    for (const entry of entries) {
      if (entry.setLogo && entry.catalogueSetId) continue;
      const chapter =
        entry.catalogueSetId?.trim() ||
        uniqueChapterSetFromGuarantees(entry);
      /*
        Boutique D23 / D100 sans chapitre catalogue : ne pas inventer un
        logo de set principal. Dès qu'on a un catalogueSetId (garanties ou
        slug set-N), le wordmark du chapitre est légitime.
      */
      if (!chapter && entry.setCode?.trim()) continue;
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
