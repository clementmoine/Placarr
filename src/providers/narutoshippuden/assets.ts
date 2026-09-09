/**
 * Où vivent les faces du 疾風伝, et sous quel pack d'effets elles se rendent.
 *
 * Le rangement reprend celui du Carddass — `famille/carte/langue/fichier` —
 * parce qu'il est bon et que rien ne justifiait d'en inventer un autre pour ce
 * jeu. Ce qui change, c'est la **racine** : `naruto/shippuden` et non
 * `naruto/carddass`.
 */
import path from "node:path";

import { assetsPackFileUrl } from "@/lib/packAssetUrls";

import { NARUTO_SHIPPUDEN_PACK_ID } from "./indexStore";

/**
 * Le pack d'effets du jeu.
 *
 * Distinct de celui du Carddass pour une raison concrète : le **dos**. Les deux
 * jeux n'ont pas le même — « NARUTO 疾風伝 CARD GAME » dans un losange d'un
 * côté, le triskèle 忍/術/幻 de l'autre — et les dos étant servis par langue, la
 * ligne japonaise du 疾風伝 héritait de celui du Carddass tant qu'elle vivait
 * dans son pack.
 */
export const NARUTO_SHIPPUDEN_EFFECT_PACK_ID = "naruto-shippuden";

/** `shi0043` → `shi`, `術伝-65` reste rangé sous `mju`. */
export function narutoShippudenCardFolder(cardType: string): string {
  return cardType.trim().toLowerCase();
}

export function narutoShippudenAssetsCardUrl(
  cardType: string,
  number: string,
  lang: string,
  file: string,
): string {
  return assetsPackFileUrl(
    NARUTO_SHIPPUDEN_PACK_ID,
    "cards",
    narutoShippudenCardFolder(cardType),
    number.trim().toLowerCase(),
    lang?.trim().toLowerCase(),
    file,
  );
}

/** La racine `curated/` du pack — lui seul sait où elle est. */
export function narutoShippudenCuratedDir(): string {
  return path.join(
    process.cwd(),
    "src",
    "providers",
    "narutoshippuden",
    "curated",
  );
}
