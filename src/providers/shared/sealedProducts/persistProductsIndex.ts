/**
 * Une seule porte pour lire / écrire l'index scellé.
 *
 * Lecture : `catalog.sqlite` (tables `products` / `product_contents`) en
 * priorité, sinon `products-index.json`. La graine git
 * (`curated/products-contents.json`) reste mergée à chaque load.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { packCatalogDb, packProductsIndexPath } from "@/lib/packPaths";

import { mergeCuratedSealedContents } from "./curatedContents";
import {
  emptyProductsIndex,
  isProductsIndexV1,
  type ProductsIndexV1,
  type SealedProductEntry,
} from "./indexFormat";
import { backfillSealedProductSetLogos } from "./backfillLogos";
import { backfillSealedProductPackshots } from "./packshotUrl";
import {
  loadProductsIndexFromSqlite,
  writeProductsIndexToSqlite,
} from "./productsSqlite";

export type PersistSealedProductsIndexOpts = {
  /** Déjà mergé (évite un double merge si l'appelant a préparé l'index). */
  alreadyMerged?: boolean;
  /**
   * Destination JSON explicite (tests). Défaut : pas d'écriture JSON.
   */
  file?: string;
  /** Force writing `products-index.json` next to the pack (legacy projection). */
  writeJsonProjection?: boolean;
  packDir?: string;
  productsDir?: string;
};

function finalizeSealedProducts(
  packId: string,
  products: Record<string, SealedProductEntry>,
  opts?: { productsDir?: string },
): Record<string, SealedProductEntry> {
  backfillSealedProductPackshots(packId, products, opts);
  // Logos : même filet que les packshots — un index écrit avant que le
  // résolveur soit branché (ou avant le relevé TCGdex) ne reste pas nu.
  backfillSealedProductSetLogos(packId, products);
  return products;
}

/**
 * Charge l'index + overlay curated + packshots disque. À utiliser par tout
 * lecteur (Catalogue, conseil d'achat, …) pour ne pas dépendre d'un disque
 * éventuellement stale.
 */
export function loadSealedProductsIndex(packId: string): ProductsIndexV1 {
  const fromSqlite = loadProductsIndexFromSqlite(packId);
  let index = fromSqlite ?? emptyProductsIndex(packId);
  if (!fromSqlite) {
    const file = packProductsIndexPath(packId);
    if (existsSync(file)) {
      try {
        const raw: unknown = JSON.parse(readFileSync(file, "utf8"));
        if (isProductsIndexV1(raw)) index = raw;
      } catch {
        /* keep empty */
      }
    }
  }
  const products = mergeCuratedSealedContents(packId, index.products);
  return {
    ...index,
    pack: packId,
    products: finalizeSealedProducts(packId, products),
  };
}

/**
 * Merge curated + backfill packshots puis écrit `catalog.sqlite` (tables
 * products / product_contents). JSON projection only if `writeJsonProjection`.
 */
export function persistSealedProductsIndex(
  packId: string,
  products: Record<string, SealedProductEntry>,
  opts: PersistSealedProductsIndexOpts = {},
): { file: string; index: ProductsIndexV1 } {
  const productsDir =
    opts.productsDir ??
    (opts.packDir ? path.join(opts.packDir, "products") : undefined) ??
    (opts.file ? path.join(path.dirname(opts.file), "products") : undefined);
  const merged = opts.alreadyMerged
    ? products
    : mergeCuratedSealedContents(packId, products);
  const index: ProductsIndexV1 = {
    version: 1,
    pack: packId,
    generatedAt: new Date().toISOString(),
    products: finalizeSealedProducts(packId, merged, { productsDir }),
  };
  const dbPath = opts.packDir
    ? path.join(opts.packDir, "catalog.sqlite")
    : undefined;
  writeProductsIndexToSqlite(packId, index, { dbPath });
  const file = opts.file ?? packProductsIndexPath(packId);
  if (opts.writeJsonProjection || opts.file) {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, `${JSON.stringify(index, null, 2)}\n`, "utf8");
  }
  return { file: dbPath ?? packCatalogDb(packId), index };
}

/** Persiste un index déjà assemblé (garde `pack` / version). */
export function persistSealedProductsIndexDoc(
  index: ProductsIndexV1,
  opts: PersistSealedProductsIndexOpts = {},
): { file: string; index: ProductsIndexV1 } {
  const packId = index.pack;
  const merged = opts.alreadyMerged
    ? index.products
    : mergeCuratedSealedContents(packId, index.products);
  return persistSealedProductsIndex(packId, merged, {
    alreadyMerged: true,
    file: opts.file,
  });
}
