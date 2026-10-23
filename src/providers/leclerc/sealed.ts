/**
 * Produits scellés Leclerc — seed album / pochette / display pour chaque op,
 * overlay curated (`leclerc-<set>-sealed.json` + packshots) quand dispo.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { writeLocalSealedProducts } from "@/providers/shared/sealedProducts/localWrite";
import type { SealedKind } from "@/providers/shared/sealedProducts/kinds";
import type { PackCompositionField } from "@/providers/shared/sealedProducts/packCompositionTypes";

import { leclercCuratedDir } from "./curatedPaths";
import { leclercOpForSetCode } from "./pack";
import {
  mergeLeclercSealedSeedWithLedger,
  type LeclercSealedSkuDraft,
} from "./sealedSeed";

export type LeclercSealedSku = {
  slug: string;
  kind: SealedKind;
  category: string;
  name: string;
  /** Fichier art curated — absent = stub sans packshot. */
  art?: string | null;
  back?: string | null;
  declaredCardCount: number | null;
  cardsPerPack?: number | null;
  packsContained?: number | null;
  priceCents?: number | null;
  packComposition?: PackCompositionField;
};

export type LeclercSealedLedger = {
  sourceId: string;
  lang: string;
  setCode: string;
  products: LeclercSealedSku[];
};

export {
  LECLERC_POCHETTE_PACK_COMPOSITION,
  LECLERC_SEALED_SEED_SLUGS,
  leclercCampaignTitle,
  leclercSealedSeedProducts,
  mergeLeclercSealedSeedWithLedger,
} from "./sealedSeed";

export function leclercSealedLedgerPath(setCode: string): string {
  return path.join(
    leclercCuratedDir(),
    "sources",
    `leclerc-${setCode.trim().toLowerCase()}-sealed.json`,
  );
}

export function leclercCuratedProductsDir(setCode: string): string {
  return path.join(
    leclercCuratedDir(),
    "products",
    setCode.trim().toLowerCase(),
  );
}

export function readLeclercSealedLedger(
  setCode: string,
): LeclercSealedLedger | null {
  const file = leclercSealedLedgerPath(setCode);
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, "utf8")) as LeclercSealedLedger;
}

function curatedFile(
  root: string,
  slug: string,
  lang: string,
  filename: string | null | undefined,
): string | null {
  const name = filename?.trim();
  if (!name) return null;
  const dest = path.join(root, slug, lang, name);
  return existsSync(dest) ? dest : null;
}

/** Produits à écrire : seed ∪ ledger curated (si présent). */
export function resolveLeclercSealedSkus(
  setCode: string,
): { lang: string; source: string; products: LeclercSealedSkuDraft[] } {
  const code = setCode.trim().toLowerCase();
  const ledger = readLeclercSealedLedger(code);
  return {
    lang: (ledger?.lang ?? "fr").trim().toLowerCase() || "fr",
    source: ledger?.sourceId?.trim() || "seed",
    products: mergeLeclercSealedSeedWithLedger(code, ledger?.products),
  };
}

/**
 * Installe les SKUs scellés seed (+ curated) pour une op connue.
 * Art manquant OK (`allowMissingArt`) — stubs catalogue sans packshot.
 */
export function ingestLeclercSealedProducts(
  setCode: string,
): { written: number; skipped: number; file: string | null } {
  const code = setCode.trim().toLowerCase();
  const op = leclercOpForSetCode(code);
  if (!op) {
    return { written: 0, skipped: 0, file: null };
  }
  const { lang, source, products: drafts } = resolveLeclercSealedSkus(code);
  const curated = leclercCuratedProductsDir(code);

  const products = drafts.map((sku) => {
    const artPath = curatedFile(curated, sku.slug, lang, sku.art);
    const backPath = curatedFile(curated, sku.slug, lang, sku.back);
    return {
      slug: sku.slug,
      kind: sku.kind,
      category: sku.category,
      name: sku.name,
      setCode: code,
      lang,
      releaseDate: null,
      declaredCardCount: sku.declaredCardCount,
      cardsPerPack: sku.cardsPerPack ?? null,
      packsContained: sku.packsContained ?? null,
      priceCents: sku.priceCents ?? null,
      ...(sku.packComposition !== undefined
        ? { packComposition: sku.packComposition }
        : {}),
      artPath,
      imageBackPath: backPath,
    };
  });

  const result = writeLocalSealedProducts({
    packId: op.packId,
    source,
    products,
    allowMissingArt: true,
  });
  return {
    written: result.written,
    skipped: result.skipped,
    file: result.file,
  };
}
