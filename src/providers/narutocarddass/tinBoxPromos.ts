/**
 * Map tin-box / site promo JPEGs (NI-PR##) into `cards/promo/fr/pr0NN/`.
 * Used paths are **moved** out of staging (cards = catalogue; staging = leftovers).
 */
import fs from "node:fs";
import path from "node:path";

import { dataRoot } from "@/lib/runtimeData";

import { NARUTO_PACK_ID } from "./indexStore";
import { narutoCardAbsDir } from "./narutoCardDisk";
import { NARUTO_STAGING_SITE } from "./scrape/scrapeCards";

export type TinPromoMap = {
  /** Collector id under cards/, e.g. pr011 */
  cardId: string;
  /** Display name FR */
  name: string;
  /** Prefer largest / cleanest face */
  artFrom: string;
  /** Optional smaller packshot / site face → thumb.jpg */
  thumbFrom?: string;
  /** Extra duplicates left in staging (not installed) */
  aliases?: string[];
};

/**
 * From carddass.fr `news.htm` (Wayback 2008-11):
 * tin box hobby → Naruto [NI-PR16] + Orochimaru [NI-PR11].
 * Packshots `carte-promo-tb-N1/N2` = site thumbs of those two (N2 = PR-11).
 */
export const TIN_BOX_PROMOS: readonly TinPromoMap[] = [
  {
    cardId: "pr011",
    name: "Orochimaru",
    artFrom: "images/cartes/promo/promo-tin-box-oro.jpg",
    thumbFrom: "images/cartes/promo/orochimaru_promo.jpg",
    aliases: ["images/packshots/carte-promo-tb-N2.jpg"],
  },
  {
    cardId: "pr016",
    name: "Naruto Uzumaki",
    artFrom: "images/cartes/promo/promo-tin-box-naruto.jpg",
    thumbFrom: "images/packshots/carte-promo-tb-N1.jpg",
  },
] as const;

function moveInto(src: string, dest: string): boolean {
  if (!fs.existsSync(src)) return false;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  if (fs.existsSync(dest)) {
    try {
      const st = fs.lstatSync(dest);
      if (st.isSymbolicLink() || st.isFile()) fs.unlinkSync(dest);
    } catch {
      /* */
    }
  }
  try {
    const tmp = `${dest}.tmp`;
    fs.copyFileSync(src, tmp);
    fs.renameSync(tmp, dest);
    fs.unlinkSync(src);
    return true;
  } catch {
    return false;
  }
}

/**
 * Install PR-11 / PR-16 faces from staging → cards (move; staging loses used files).
 */
export function materializeTinBoxPromos(root?: string): {
  installed: string[];
  missing: string[];
} {
  const pack = root ?? path.join(dataRoot(), NARUTO_PACK_ID);
  const staging = path.join(pack, NARUTO_STAGING_SITE);
  const cardsDir = path.join(pack, "cards");
  const installed: string[] = [];
  const missing: string[] = [];

  for (const promo of TIN_BOX_PROMOS) {
    const cardDir =
      narutoCardAbsDir(cardsDir, promo.cardId, "fr", "promo") ??
      path.join(cardsDir, "promo", "fr", promo.cardId);
    fs.mkdirSync(cardDir, { recursive: true });

    const artSrc = path.join(staging, promo.artFrom);
    const ext = path.extname(promo.artFrom).toLowerCase() || ".jpg";
    const artDest = path.join(
      cardDir,
      `art.carddass${ext === ".jpeg" ? ".jpg" : ext}`,
    );
    if (!moveInto(artSrc, artDest)) {
      if (!fs.existsSync(artDest)) missing.push(promo.artFrom);
    }

    if (promo.thumbFrom) {
      const thumbSrc = path.join(staging, promo.thumbFrom);
      const thumbDest = path.join(cardDir, "thumb.jpg");
      if (!moveInto(thumbSrc, thumbDest)) {
        if (!fs.existsSync(thumbDest) && fs.existsSync(artDest)) {
          fs.copyFileSync(artDest, thumbDest);
        } else if (!fs.existsSync(thumbDest)) {
          missing.push(promo.thumbFrom);
        }
      }
    }

    if (fs.existsSync(artDest)) installed.push(promo.cardId);
  }

  return { installed, missing };
}
