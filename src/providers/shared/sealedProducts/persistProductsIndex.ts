/**
 * Une seule porte pour lire / écrire `products-index.json`.
 *
 * La graine git (`curated/products-contents.json`) est la vérité inventaire ;
 * l'index disque est le cache catalogue. Sans merge à **chaque** write (et
 * en filet à la lecture), un upsert site officiel / localWrite / Naruto
 * obsolète laissait des starters « contenu inconnu » alors que le ledger
 * les connaissait — et le Catalogue (lecture brute) divergeait du conseil
 * d'achat (lecture déjà mergée).
 *
 * Même filet pour les packshots : une réinsertion SKU sans `image` alors que
 * `products/{slug}/{lang}/art.*` existe ne doit plus produire de tuiles
 * « sans image ».
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { packProductsIndexPath } from "@/lib/packPaths";

import { mergeCuratedSealedContents } from "./curatedContents";
import {
  emptyProductsIndex,
  isProductsIndexV1,
  type ProductsIndexV1,
  type SealedProductEntry,
} from "./indexFormat";
import { backfillSealedProductPackshots } from "./packshotUrl";

export type PersistSealedProductsIndexOpts = {
  /** Déjà mergé (évite un double merge si l'appelant a préparé l'index). */
  alreadyMerged?: boolean;
  /**
   * Destination explicite (tests / ingest avec `packRoot` hors `dataRoot`).
   * Défaut : {@link packProductsIndexPath}.
   */
  file?: string;
  packDir?: string;
  productsDir?: string;
};

function finalizeSealedProducts(
  packId: string,
  products: Record<string, SealedProductEntry>,
  opts?: { productsDir?: string },
): Record<string, SealedProductEntry> {
  backfillSealedProductPackshots(packId, products, opts);
  return products;
}

/**
 * Charge l'index + overlay curated + packshots disque. À utiliser par tout
 * lecteur (Catalogue, conseil d'achat, …) pour ne pas dépendre d'un disque
 * éventuellement stale.
 */
export function loadSealedProductsIndex(packId: string): ProductsIndexV1 {
  const file = packProductsIndexPath(packId);
  let index = emptyProductsIndex(packId);
  if (existsSync(file)) {
    try {
      const raw: unknown = JSON.parse(readFileSync(file, "utf8"));
      if (isProductsIndexV1(raw)) index = raw;
    } catch {
      /* keep empty */
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
 * Merge curated + backfill packshots puis écrit `data/<pack>/products-index.json`.
 * Point unique pour tous les writers d'index scellé.
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
  const file = opts.file ?? packProductsIndexPath(packId);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(index, null, 2)}\n`, "utf8");
  return { file, index };
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
