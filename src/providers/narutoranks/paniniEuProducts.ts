/**
 * Scellés de l'édition européenne Panini (2007) — distincte de l'édition US
 * Inkworks (102 cartes, NS/GS EU-only, 5 cartes/pochette contre 9).
 *
 * Ledger curé `sources/panini-eu-products.json`, packshots sous
 * `curated/products/{slug}/fr/`. Le conditionnement est pan-européen
 * multilingue ; `lang: "fr"` car vendu par Panini France avec étiquette
 * prix FR (1,50 € la pochette, 2,6 € l'album).
 *
 * L'index scellé du pack est une écriture unique : `ingestNinjaRanksSealedProducts`
 * regroupe les SKU Inkworks US et Panini EU dans le même `writeLocalSealedProducts`,
 * chaque SKU portant la source de son packshot (`art.paninimania.jpg`, …).
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import {
  writeLocalSealedProducts,
  type LocalSealedWrite,
} from "@/providers/shared/sealedProducts/localWrite";
import type { SealedKind } from "@/providers/shared/sealedProducts/kinds";

import { inkworksSealedSpecs } from "./inkworksOfficial";
import { NARUTO_RANKS_PACK_ID, narutoRanksCuratedDir } from "./pack";

const LEDGER_FILE = "panini-eu-products.json";

export type PaniniEuSku = {
  slug: string;
  kind: SealedKind;
  category: string;
  name: string;
  art: string;
  back?: string;
  declaredCardCount: number | null;
  packsContained?: number | null;
  priceCents: number | null;
};

export type PaniniEuProductsLedger = {
  sourceId: string;
  lang: string;
  released: string;
  setCode: string;
  skus: PaniniEuSku[];
};

export function paniniEuProductsPath(): string {
  return path.join(narutoRanksCuratedDir(), "sources", LEDGER_FILE);
}

export function readPaniniEuProductsLedger(): PaniniEuProductsLedger {
  return JSON.parse(
    readFileSync(paniniEuProductsPath(), "utf8"),
  ) as PaniniEuProductsLedger;
}

/** Hôte du packshot (`art.paninimania.jpg` → `paninimania`), pour le nom stocké. */
function artHost(file: string): string {
  const match = /^(?:art|back)\.([^.]+)\./.exec(file);
  return match?.[1] ?? "panini-eu";
}

export function paniniEuSealedSpecs(
  opts: { curatedProductsDir?: string } = {},
): LocalSealedWrite[] {
  const ledger = readPaniniEuProductsLedger();
  const curated =
    opts.curatedProductsDir ?? path.join(narutoRanksCuratedDir(), "products");
  const lang = ledger.lang?.trim().toLowerCase();
  return ledger.skus.flatMap((sku) => {
    const artPath = path.join(curated, sku.slug, lang, sku.art);
    if (!existsSync(artPath)) return [];
    const backPath = sku.back
      ? path.join(curated, sku.slug, lang, sku.back)
      : null;
    return [
      {
        slug: sku.slug,
        kind: sku.kind,
        category: sku.category,
        name: sku.name,
        source: artHost(sku.art),
        setCode: ledger.setCode,
        catalogueSetId: ledger.setCode,
        lang: ledger.lang,
        releaseDate: ledger.released,
        declaredCardCount: sku.declaredCardCount,
        packsContained: sku.packsContained ?? null,
        priceCents: sku.priceCents,
        artPath,
        imageBackPath: backPath && existsSync(backPath) ? backPath : null,
      },
    ];
  });
}

/**
 * Tout le scellé du pack en une seule écriture d'index : Inkworks US (en)
 * + Panini EU (fr). Les SKU EN gardent la source de leur lot, les SKU EU
 * portent chacun l'hôte de leur packshot.
 */
export function ingestNinjaRanksSealedProducts(
  opts: {
    stagingDir?: string;
    curatedProductsDir?: string;
  } = {},
): {
  written: number;
  skipped: number;
  file: string;
} {
  const inkworks = inkworksSealedSpecs(opts);
  const eu = paniniEuSealedSpecs(opts);
  return writeLocalSealedProducts({
    packId: NARUTO_RANKS_PACK_ID,
    source: inkworks.source,
    products: [...inkworks.products, ...eu],
  });
}
