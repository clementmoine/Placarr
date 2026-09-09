/**
 * Orientation d'affichage d'une face, pour `toCandidate`.
 *
 * Deux sources :
 *
 * 1. Le relevé éditorial `curated/landscape-prints.json` — autorité pour les
 *    cartes paysage dont la face choisie est un scan portrait couché (PR-060).
 *    Le probe pixel ne mesure que la face choisie : il ne peut pas voir qu'un
 *    fichier portrait contient une carte couchée, et son repli sans dimensions
 *    répondrait `landscapeFace` — faux pour un scan couché.
 * 2. Le probe pixel de `cards-index.json` (`artW`/`artH` + `landscapePrint`),
 *    partagé avec les autres packs locaux, pour tout le reste.
 */
import { artOrientationForPackPrint } from "@/providers/shared/cardCatalogue/cardsIndexOrientation";
import type { ArtFaceOrientation } from "@/lib/text/artFaceOrientation";

import ledger from "./curated/landscape-prints.json";
import { NARUTO_PACK_ID } from "./packs";

export type EditorialLandscapePrint = {
  printKey: string;
  lang?: string;
  artW?: number;
  artH?: number;
};

const EDITORIAL_BY_KEY = new Map<string, EditorialLandscapePrint>(
  (ledger.prints as EditorialLandscapePrint[]).map((row) => [
    row.printKey.trim().toLowerCase(),
    row,
  ]),
);

/** Relevé éditorial paysage — pour l'export d'index (flag + dims du scan couché). */
export function narutoEditorialLandscapePrints(): readonly EditorialLandscapePrint[] {
  return [...EDITORIAL_BY_KEY.values()];
}

export function narutoCarddassPrintOrientation(
  printKey: string,
  lang: string | null | undefined,
): (ArtFaceOrientation & { landscapePrint?: boolean }) | null {
  const key = printKey?.trim().toLowerCase();
  if (!key) return null;
  if (EDITORIAL_BY_KEY.has(key)) {
    // Carte paysage, scan affiché portrait couché : on tourne d'un quart de tour.
    return { landscapePrint: true, faceQuarterTurns: 1 };
  }
  return artOrientationForPackPrint(NARUTO_PACK_ID, printKey, lang);
}
