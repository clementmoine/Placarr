/**
 * Défi Ninja sealed SKU (404 Éditions box). Packshot optional until pasted.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { writeLocalSealedProducts } from "@/providers/shared/sealedProducts/localWrite";
import type { SealedKind } from "@/providers/shared/sealedProducts/kinds";

import { NARUTO_DEFI_NINJA_SET_CODE } from "./printKey";
import { NARUTO_DEFI_NINJA_PACK_ID, narutoDefiNinjaCuratedDir } from "./pack";

const LEDGER_FILE = "defi-ninja-products.json";

export type DefiNinjaProductEntry = {
  slug: string;
  kind: SealedKind;
  category: string;
  name: string;
  lang: string;
  declaredCardCount: number | null;
  ean?: string | null;
  path?: string | null;
  art?: string | null;
  note?: string;
};

export type DefiNinjaProductsLedger = {
  source: string;
  url: string;
  ean: string;
  products: DefiNinjaProductEntry[];
};

export function defiNinjaProductsPath(): string {
  return path.join(narutoDefiNinjaCuratedDir(), "sources", LEDGER_FILE);
}

export function readDefiNinjaProductsLedger(): DefiNinjaProductsLedger {
  return JSON.parse(
    readFileSync(defiNinjaProductsPath(), "utf8"),
  ) as DefiNinjaProductsLedger;
}

function curatedArtPath(slug: string, lang: string, art: string): string {
  return path.join(
    narutoDefiNinjaCuratedDir(),
    "products",
    slug,
    lang.trim().toLowerCase(),
    art,
  );
}

export function ingestDefiNinjaSealedProducts(): {
  written: number;
  skipped: number;
  file: string;
} {
  const ledger = readDefiNinjaProductsLedger();
  const products = ledger.products.flatMap((row) => {
    if (!row.art?.trim()) return [];
    const dest = curatedArtPath(row.slug, row.lang, row.art.trim());
    if (!existsSync(dest)) return [];
    return [
      {
        slug: row.slug,
        kind: row.kind,
        category: row.category,
        name: row.name,
        setCode: NARUTO_DEFI_NINJA_SET_CODE,
        catalogueSetId: NARUTO_DEFI_NINJA_SET_CODE,
        lang: row.lang,
        releaseDate: null,
        declaredCardCount: row.declaredCardCount,
        path: row.path ?? ledger.url,
        artPath: dest,
      },
    ];
  });

  if (!products.length) {
    return { written: 0, skipped: ledger.products.length, file: "" };
  }

  const result = writeLocalSealedProducts({
    packId: NARUTO_DEFI_NINJA_PACK_ID,
    source: "shop",
    products,
  });
  return {
    written: result.written,
    skipped: result.skipped + (ledger.products.length - products.length),
    file: result.file,
  };
}
