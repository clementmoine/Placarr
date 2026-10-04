/**
 * Posters checklist JCC → champ `poster` du deck (comme `imageBack`).
 * Les SKU scellés `*-poster-*` dbzc sont des doublons : art reporté sur le deck.
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
} from "node:fs";
import path from "node:path";

import { assetsPackFileUrl } from "@/lib/packAssetUrls";
import { packSealedProductsDir } from "@/lib/packPaths";
import {
  loadSealedProductsIndex,
  persistSealedProductsIndexDoc,
} from "@/providers/shared/sealedProducts/persistProductsIndex";

import { DBS_JCC_PACK_ID } from "../pack";

type DeckPosterSpec = {
  deckSlug: string;
  posterSlug: string;
  lang: string;
  source: string;
};

/** Posters attestés (dbzc packaging id → deck). */
const DECK_POSTERS: readonly DeckPosterSpec[] = [
  {
    deckSlug: "part9-starter-1216",
    posterSlug: "part9-poster-1217",
    lang: "fr",
    source: "dbzcollection",
  },
];

function productKeyForSlug(
  products: Record<string, { slug: string }>,
  slug: string,
): string | null {
  for (const [key, entry] of Object.entries(products)) {
    if (entry.slug === slug) return key;
  }
  return null;
}

function posterArtSource(spec: DeckPosterSpec): string | null {
  const root = packSealedProductsDir(DBS_JCC_PACK_ID);
  const preferred = path.join(
    root,
    spec.posterSlug,
    spec.lang,
    `art.${spec.source}.jpg`,
  );
  if (existsSync(preferred)) return preferred;
  const dir = path.join(root, spec.posterSlug, spec.lang);
  if (!existsSync(dir)) return null;
  for (const name of readdirSync(dir)) {
    if (/^art\./i.test(name)) return path.join(dir, name);
  }
  return null;
}

export function isDbsjccPosterSealedSlug(slug: string): boolean {
  return /-poster-\d+$/i.test(slug.trim());
}

export type InstallDeckPostersReport = {
  attached: number;
  purged: number;
  missing: string[];
};

export function installDbsjccDeckPosters(): InstallDeckPostersReport {
  const index = loadSealedProductsIndex(DBS_JCC_PACK_ID);
  const products = { ...index.products };
  let attached = 0;
  const missing: string[] = [];

  for (const spec of DECK_POSTERS) {
    const deckKey = productKeyForSlug(products, spec.deckSlug);
    const deck = deckKey ? products[deckKey] : undefined;
    if (!deck || !deckKey) {
      missing.push(spec.deckSlug);
      continue;
    }
    const src = posterArtSource(spec);
    if (!src) {
      missing.push(spec.posterSlug);
      continue;
    }
    const destDir = path.join(
      packSealedProductsDir(DBS_JCC_PACK_ID),
      spec.deckSlug,
      spec.lang,
    );
    mkdirSync(destDir, { recursive: true });
    const ext = path.extname(src).toLowerCase() || ".jpg";
    const safe = ext === ".jpeg" ? ".jpg" : ext;
    const artName = `poster.${spec.source}${safe}`;
    copyFileSync(src, path.join(destDir, artName));
    const posterUrl = assetsPackFileUrl(
      DBS_JCC_PACK_ID,
      "products",
      spec.deckSlug,
      spec.lang,
      artName,
    );
    products[deckKey] = { ...deck, poster: posterUrl };
    attached += 1;
  }

  let purged = 0;
  for (const [key, entry] of Object.entries(products)) {
    if (
      entry.category === "poster" ||
      isDbsjccPosterSealedSlug(entry.slug)
    ) {
      delete products[key];
      purged += 1;
    }
  }

  if (attached || purged) {
    persistSealedProductsIndexDoc({ ...index, products }, {
      alreadyMerged: true,
    });
  }
  return { attached, purged, missing };
}
