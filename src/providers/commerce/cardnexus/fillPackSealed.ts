/**
 * Densify pack sealed indexes from CardNexus sealed search (price + image).
 *
 * Prefer-primary union: *cards.fr / official rows keep ownership; CardNexus
 * only fills empty price/image or adds SKUs missing from the pack index.
 * Never projects marketplace `externalIds` onto `barcodes` (not GTINs).
 */
import { existsSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

import { packCatalogDb } from "@/lib/packPaths";
import { slugify } from "@/lib/routing/slugs";
import { resolveContentLayers } from "@/providers/shared/sealedProducts/contentLayers";
import {
  sealedProductKey,
  type SealedProductEntry,
} from "@/providers/shared/sealedProducts/indexFormat";
import {
  refineSealedKind,
  sealedBehaviorForKind,
  sealedContentsKnown,
  type SealedKind,
} from "@/providers/shared/sealedProducts/kinds";
import {
  loadSealedProductsIndex,
  persistSealedProductsIndex,
  unionSealedProductsPreferPrimary,
} from "@/providers/shared/sealedProducts/persistProductsIndex";

import { cardnexusApiKey } from "./client";
import { cardnexusGameIdForPrintGame } from "./games";
import {
  listSealedForSetCode,
  type CardnexusSealedProduct,
} from "./sealed";

export type CardnexusPackSealedReport = {
  packId: string;
  printGame: string;
  setCodes: number;
  fetched: number;
  added: number;
  filled: number;
};

/** CardNexus `productCategory` → *cards.fr-ish category for kind refine. */
export function cardnexusCategoryToSealedCategory(
  productCategory: string | null | undefined,
): string | null {
  const raw = productCategory?.trim().toLowerCase() ?? "";
  if (!raw) return null;
  if (raw === "booster_box" || raw.includes("display")) return "displays";
  if (raw.includes("elite") || raw === "etb") return "elite-trainer";
  if (raw.includes("trove")) return "trove-packs";
  if (raw.includes("tin")) return "tins";
  if (raw.includes("deck")) return "decks";
  if (raw.includes("collector")) return "collector-boxes";
  if (raw.includes("blister")) return "boosters-blister";
  if (raw.includes("booster")) return "boosters";
  if (raw.includes("case")) return "displays";
  return null;
}

export function cardnexusSealedSlug(product: CardnexusSealedProduct): string {
  const fromName = product.nameSlug?.trim() || slugify(product.name);
  return fromName || `cn-${product.id}`;
}

export function mapCardnexusSealedToEntry(
  packId: string,
  product: CardnexusSealedProduct,
): SealedProductEntry | null {
  const slug = cardnexusSealedSlug(product);
  if (!slug) return null;

  const categoryHint = cardnexusCategoryToSealedCategory(
    product.productCategory,
  );
  const kind: SealedKind =
    refineSealedKind({
      category: categoryHint,
      slug,
      name: product.name,
    }) ?? "coffret";
  const behavior = sealedBehaviorForKind(kind);
  const contentsKnown = sealedContentsKnown({
    kind,
    containsPrintsIsPreview: true,
    printCount: 0,
  });
  const layers = resolveContentLayers({
    kind,
    behavior,
    prints: [],
    contentsKnown,
    containsPrintsIsPreview: true,
  });
  const lang = product.languages[0]?.trim().toLowerCase() || null;
  const setCode = product.expansionCode?.trim() || null;

  return {
    slug,
    path: product.sourceUrl,
    kind,
    behavior,
    category: product.productCategory?.trim() || categoryHint || kind,
    name: product.name.trim() || null,
    image: product.imageUrl?.trim() || null,
    imageBack: null,
    setLogo: null,
    setCode,
    catalogueSetId: setCode,
    lang,
    releaseDate: null,
    priceCents: product.priceCents,
    cardsPerPack: null,
    packsContained: null,
    guaranteedPrints: layers.guaranteedPrints,
    randomPoolScope: layers.randomPoolScope,
    randomPoolPrints: layers.randomPoolPrints,
    declaredCardCount: null,
    setCardCount: null,
    contentsKnown,
    containsPrintsIsPreview: true,
    prints: [],
    // No barcodes — CardNexus externalIds are Cardmarket/TCGPlayer ids.
  };
}

export function listPackPrintSetCodes(packId: string): string[] {
  const dbPath = packCatalogDb(packId);
  if (!existsSync(dbPath)) return [];
  const db = new DatabaseSync(dbPath);
  try {
    const rows = db
      .prepare(
        `SELECT DISTINCT trim(set_code) AS setCode
           FROM prints
          WHERE set_code IS NOT NULL AND trim(set_code) != ''
          ORDER BY 1`,
      )
      .all() as Array<{ setCode?: string }>;
    return rows
      .map((row) => String(row.setCode ?? "").trim())
      .filter(Boolean);
  } catch {
    return [];
  } finally {
    db.close();
  }
}

/**
 * Fetch CardNexus sealed SKUs for every set in the pack catalogue and coalesce
 * into the existing products index (prefer existing *cards.fr / official rows).
 */
export async function runCardnexusPackSealedStep(opts: {
  packId: string;
  printGame: string;
  onLog?: (line: string) => void;
  setCodes?: readonly string[];
}): Promise<CardnexusPackSealedReport | null> {
  const report: CardnexusPackSealedReport = {
    packId: opts.packId,
    printGame: opts.printGame,
    setCodes: 0,
    fetched: 0,
    added: 0,
    filled: 0,
  };

  if (!cardnexusApiKey()) {
    opts.onLog?.(
      `   cardnexus-sealed ${opts.packId}: skip (API key missing)`,
    );
    return null;
  }

  const gameId = cardnexusGameIdForPrintGame(opts.printGame);
  if (!gameId) {
    opts.onLog?.(
      `   cardnexus-sealed ${opts.packId}: skip (no CardNexus game for ${opts.printGame})`,
    );
    return null;
  }

  const setCodes = opts.setCodes?.length
    ? [...opts.setCodes]
    : listPackPrintSetCodes(opts.packId);
  report.setCodes = setCodes.length;
  if (setCodes.length === 0) {
    opts.onLog?.(
      `   cardnexus-sealed ${opts.packId}: skip (no set codes in catalog)`,
    );
    return report;
  }

  try {
    const fill: Record<string, SealedProductEntry> = {};
    for (const setCode of setCodes) {
      const sealed = await listSealedForSetCode(gameId, setCode);
      report.fetched += sealed.length;
      for (const product of sealed) {
        const entry = mapCardnexusSealedToEntry(opts.packId, product);
        if (!entry) continue;
        fill[sealedProductKey(opts.packId, entry.slug)] = entry;
      }
    }

    if (Object.keys(fill).length === 0) {
      opts.onLog?.(
        `   cardnexus-sealed ${opts.packId}: 0 sealed for ${setCodes.length} sets`,
      );
      return report;
    }

    const existing = loadSealedProductsIndex(opts.packId);
    const beforeKeys = new Set(Object.keys(existing.products));
    const merged = unionSealedProductsPreferPrimary(existing.products, fill);
    for (const [key, entry] of Object.entries(merged)) {
      if (!beforeKeys.has(key)) {
        report.added += 1;
        continue;
      }
      const prev = existing.products[key];
      if (
        prev &&
        ((prev.priceCents == null && entry.priceCents != null) ||
          (!prev.image && entry.image))
      ) {
        report.filled += 1;
      }
    }

    persistSealedProductsIndex(opts.packId, merged);
    opts.onLog?.(
      `   cardnexus-sealed ${opts.packId}: +${report.added} SKU / ${report.filled} densifiés (${report.fetched} fetch, ${setCodes.length} sets)`,
    );
    return report;
  } catch (err) {
    opts.onLog?.(
      `   cardnexus-sealed ${opts.packId}: ${err instanceof Error ? err.message : err}`,
    );
    return null;
  }
}
