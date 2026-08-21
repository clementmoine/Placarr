/**
 * Produits scellés Ultra Challenge : upscales Figma en affichage,
 * dump Coleka conservé à côté de l’album.
 *
 * Les PNG vivent sous `curated/products/{slug}/fr/art.reconstructed.png`.
 * Ce n'est pas un hôte Panini. Le verso d’album est un packshot, pas le
 * sleeve `cards/back.fr.webp`.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { writeLocalSealedProducts } from "@/providers/shared/sealedProducts/localWrite";
import type { SealedKind } from "@/providers/shared/sealedProducts/kinds";

import { colekaAlbumStagingDir, readColekaAlbumLedger } from "./colekaAlbum";
import { NARUTO_ULTRA_PACK_ID, narutoUltraCuratedDir } from "./pack";

const LEDGER_FILE = "reconstructed-products.json";

export type UltraReconstructedSku = {
  slug: string;
  kind: SealedKind;
  category: string;
  name: string;
  art: string;
  back?: string;
  declaredCardCount: number | null;
};

export type UltraReconstructedLedger = {
  sourceId: string;
  lang: string;
  products: UltraReconstructedSku[];
};

export function ultraReconstructedProductsPath(): string {
  return path.join(narutoUltraCuratedDir(), "sources", LEDGER_FILE);
}

export function readUltraReconstructedLedger(): UltraReconstructedLedger {
  return JSON.parse(
    readFileSync(ultraReconstructedProductsPath(), "utf8"),
  ) as UltraReconstructedLedger;
}

export function ultraCuratedProductsDir(): string {
  return path.join(narutoUltraCuratedDir(), "products");
}

function curatedFile(
  root: string,
  slug: string,
  lang: string,
  filename: string,
): string | null {
  const dest = path.join(root, slug, lang, filename);
  return existsSync(dest) ? dest : null;
}

export function ingestUltraSealedProducts(
  opts: {
    curatedProductsDir?: string;
    colekaStagingDir?: string;
  } = {},
): { written: number; skipped: number; file: string } {
  const reconstructed = readUltraReconstructedLedger();
  const coleka = readColekaAlbumLedger();
  const curated = opts.curatedProductsDir ?? ultraCuratedProductsDir();
  const lang = reconstructed.lang.trim().toLowerCase();
  const colekaArt = path.join(
    opts.colekaStagingDir ?? colekaAlbumStagingDir(),
    coleka.sku.file,
  );
  const colekaDump = existsSync(colekaArt)
    ? [{ source: coleka.sourceId, artPath: colekaArt }]
    : [];

  const products = reconstructed.products.flatMap((sku) => {
    const artPath = curatedFile(curated, sku.slug, lang, sku.art);
    if (!artPath) return [];
    const backPath = sku.back
      ? curatedFile(curated, sku.slug, lang, sku.back)
      : null;
    return [
      {
        slug: sku.slug,
        kind: sku.kind,
        category: sku.category,
        name: sku.name,
        setCode: null,
        lang: reconstructed.lang,
        releaseDate: coleka.released,
        declaredCardCount: sku.declaredCardCount,
        path: coleka.url,
        artPath,
        imageBackPath: backPath,
        extraDumps: sku.slug === coleka.sku.slug ? colekaDump : [],
      },
    ];
  });

  if (products.length) {
    return writeLocalSealedProducts({
      packId: NARUTO_ULTRA_PACK_ID,
      source: reconstructed.sourceId,
      products,
    });
  }

  return writeLocalSealedProducts({
    packId: NARUTO_ULTRA_PACK_ID,
    source: coleka.sourceId,
    products: [
      {
        slug: coleka.sku.slug,
        kind: coleka.sku.kind,
        category: coleka.sku.category,
        name: coleka.sku.name,
        setCode: null,
        lang: coleka.lang,
        releaseDate: coleka.released,
        declaredCardCount: coleka.sku.declaredCardCount,
        path: coleka.url,
        artPath: existsSync(colekaArt) ? colekaArt : null,
      },
    ],
  });
}
