/**
 * Map DeckCardMania gallery captions → sealed product slugs (1 title = 1 SKU).
 *
 * Album packshots are multi-SKU collages on Série 1–10 — ignore those.
 * Gallery titles like « Deck Planète » / « Booster de 8 cartes » are the
 * honest packshot source. Super Séries / Tin box: one primary SKU per set.
 */
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

import { packSealedProductsDir } from "@/lib/packPaths";

import { DBS_JCC_PACK_ID } from "../pack";

/** Explicit deck captions attested on DCM set fiches (Série 1–10 dual decks). */
const DECK_CAPTION_SLUGS: Readonly<Record<string, string>> = {
  "deck planète": "part5-starter-1203",
  "deck planete": "part5-starter-1203",
  "deck résistance": "part5-starter-resistance",
  "deck resistance": "part5-starter-resistance",
  "deck vaincre la menace": "part4-starter-1200",
  "deck force du mal": "part4-starter-forces-du-mal",
  "deck forces du mal": "part4-starter-forces-du-mal",
  // S6–10 : une fiche = un deck nommé (packshot album `{idm}b.jpg` côté install).
  "deck fusion": "part6-starter-1206",
  "deck origine": "part7-starter-1208",
  "deck nouvelle epreuve": "part8-starter-1213",
  "deck nouvelle épreuve": "part8-starter-1213",
  "deck heros": "part9-starter-1216",
  "deck héros": "part9-starter-1216",
  "deck guerriers legendaires": "part10-starter-1219",
  "deck guerriers légendaires": "part10-starter-1219",
};

function normalizeCaption(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isBoosterCaption(norm: string): boolean {
  return (
    /^booster\b/.test(norm) ||
    /^pochette\b/.test(norm) ||
    /\bbooster de \d+ cartes\b/.test(norm)
  );
}

function isGenericDeckCaption(norm: string): boolean {
  return (
    /^deck de \d+ cartes$/.test(norm) ||
    /^deck de demarrage$/.test(norm) ||
    /^deck$/.test(norm)
  );
}

function isDbsjccSealedSet(set: string): boolean {
  return /^part\d+$/.test(set) || /^ss\d+$/.test(set) || set === "tinbox";
}

function productSlugsMatching(
  productsRoot: string,
  predicate: (slug: string) => boolean,
): string[] {
  if (!existsSync(productsRoot)) return [];
  return readdirSync(productsRoot)
    .filter(
      (slug) =>
        predicate(slug) && existsSync(path.join(productsRoot, slug, "fr")),
    )
    .sort();
}

/**
 * Primary booster slug for a set (`part5-booster-1202` or `ss3-booster`).
 */
export function primaryBoosterSlugForSet(
  setCode: string,
  productsRoot = packSealedProductsDir(DBS_JCC_PACK_ID),
): string | null {
  const prefix = `${setCode}-booster`;
  const slugs = productSlugsMatching(
    productsRoot,
    (slug) =>
      (slug === prefix || slug.startsWith(`${prefix}-`)) &&
      !slug.includes("-box"),
  );
  return slugs[0] ?? null;
}

/**
 * Primary starter slug (`part5-starter-1203` or `ss5-starter`).
 */
export function primaryStarterSlugForSet(
  setCode: string,
  productsRoot = packSealedProductsDir(DBS_JCC_PACK_ID),
): string | null {
  const prefix = `${setCode}-starter`;
  const slugs = productSlugsMatching(
    productsRoot,
    (slug) =>
      (slug === prefix || slug.startsWith(`${prefix}-`)) &&
      !slug.includes("-box"),
  );
  return slugs[0] ?? null;
}

/**
 * Best single sealed slug for an album packshot on Super Série / Tin box
 * (one product per fiche — collage risk is low).
 */
export function primarySealedSlugForSet(
  setCode: string,
  productsRoot = packSealedProductsDir(DBS_JCC_PACK_ID),
): string | null {
  return (
    primaryStarterSlugForSet(setCode, productsRoot) ??
    primaryBoosterSlugForSet(setCode, productsRoot) ??
    productSlugsMatching(productsRoot, (slug) =>
      slug.startsWith(`${setCode}-`),
    )[0] ??
    null
  );
}

/**
 * Resolve a DCM gallery image title to a sealed SKU slug, or null when the
 * caption is not a single-product packshot (liste, dos, exemple, collage…).
 */
export function sealedSlugFromDeckcardmaniaGalleryTitle(
  setHint: string | null | undefined,
  title: string,
  opts: { productsRoot?: string } = {},
): string | null {
  const set = setHint?.trim().toLowerCase() ?? "";
  if (!isDbsjccSealedSet(set)) return null;

  const norm = normalizeCaption(title);
  if (!norm) return null;
  if (/^liste\b|^dos\b|^exemple\b|^carte\b|^cartes\s*n/.test(norm)) {
    return null;
  }

  const deckSlug = DECK_CAPTION_SLUGS[norm];
  if (deckSlug) {
    if (!deckSlug.startsWith(`${set}-`)) return null;
    return deckSlug;
  }

  if (isBoosterCaption(norm)) {
    return primaryBoosterSlugForSet(set, opts.productsRoot);
  }

  if (isGenericDeckCaption(norm)) {
    return primaryStarterSlugForSet(set, opts.productsRoot);
  }

  return null;
}
