/**
 * Posters checklist JCC → `poster.<source>.*` sur le deck (+ champ `poster`).
 * Pas de SKU scellé `*-poster-*` : l’art vit sur le starter (comme imageBack).
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
} from "node:fs";
import path from "node:path";

import { assetsPackFileUrl } from "@/lib/packAssetUrls";
import { packDataDir, packSealedProductsDir } from "@/lib/packPaths";
import {
  loadSealedProductsIndex,
  persistSealedProductsIndexDoc,
} from "@/providers/shared/sealedProducts/persistProductsIndex";

import { DBS_JCC_PACK_ID } from "../pack";

type DeckPosterSpec = {
  deckSlug: string;
  /** Ancien slug dbzc (preuve / quarantine) — plus un SKU catalogue. */
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

function firstMatchingArt(dir: string): string | null {
  if (!existsSync(dir)) return null;
  for (const name of readdirSync(dir)) {
    if (/^art\./i.test(name)) return path.join(dir, name);
  }
  return null;
}

/**
 * Source priority: already on deck as `poster.<source>.*`, else legacy
 * products/{posterSlug}, else quarantine orphan dir.
 */
function posterArtSource(spec: DeckPosterSpec): string | null {
  const root = packSealedProductsDir(DBS_JCC_PACK_ID);
  const deckPoster = path.join(
    root,
    spec.deckSlug,
    spec.lang,
    `poster.${spec.source}.jpg`,
  );
  if (existsSync(deckPoster)) return deckPoster;
  for (const name of existsSync(path.join(root, spec.deckSlug, spec.lang))
    ? readdirSync(path.join(root, spec.deckSlug, spec.lang))
    : []) {
    if (name.toLowerCase().startsWith(`poster.${spec.source}.`)) {
      return path.join(root, spec.deckSlug, spec.lang, name);
    }
  }

  const preferred = path.join(
    root,
    spec.posterSlug,
    spec.lang,
    `art.${spec.source}.jpg`,
  );
  if (existsSync(preferred)) return preferred;
  const fromProducts = firstMatchingArt(
    path.join(root, spec.posterSlug, spec.lang),
  );
  if (fromProducts) return fromProducts;

  const quarantine = path.join(
    packDataDir(DBS_JCC_PACK_ID),
    "quarantine",
    "orphan-dbzc-sealed",
    spec.posterSlug,
    spec.lang,
  );
  const qPreferred = path.join(quarantine, `art.${spec.source}.jpg`);
  if (existsSync(qPreferred)) return qPreferred;
  return firstMatchingArt(quarantine);
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
    const dest = path.join(destDir, artName);
    // Already canonical on the deck — only refresh index URL.
    if (path.resolve(src) !== path.resolve(dest)) {
      copyFileSync(src, dest);
    }
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
