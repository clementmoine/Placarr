/**
 * Où vivent les faces du 疾風伝, et sous quel pack d'effets elles se rendent.
 *
 * Même ordre que {@link assetsCardUrl} / {@link packCardDir} :
 * `cards/{famille}/{langue}/{diskId}/fichier` — ex. `gaku/ja/gaku0038/`.
 * (Un ancien commentaire disait set/card/lang ; le disque n'a jamais suivi.)
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

/**
 * `gaku` + `0038` / `gaku0038` / `38` → `gaku0038`.
 *
 * Sans le préfixe famille, l'URL catalogue tombait sur `…/ja/0038/` (404) alors
 * que le fichier est `…/ja/gaku0038/art.suruga.jpg`.
 */
export function normalizeShippudenDiskId(
  cardType: string,
  number: string,
): string {
  const family = narutoShippudenCardFolder(cardType);
  const raw = number.trim().toLowerCase();
  if (!raw) return family;
  const digits = raw.startsWith(family)
    ? raw.slice(family.length)
    : /^\d+$/.test(raw)
      ? raw
      : null;
  if (digits != null && /^\d+$/.test(digits)) {
    const n = digits.replace(/^0+/, "") || "0";
    return `${family}${n.padStart(4, "0")}`;
  }
  return raw;
}

/**
 * URL face — `number` peut être l'id disque (`gaku0038`) ou les seuls chiffres
 * (`0038`) ; on normalise toujours avant de joindre le chemin.
 */
export function narutoShippudenAssetsCardUrl(
  cardType: string,
  number: string,
  lang: string,
  file: string,
): string {
  const family = narutoShippudenCardFolder(cardType);
  return assetsPackFileUrl(
    NARUTO_SHIPPUDEN_PACK_ID,
    "cards",
    family,
    lang?.trim().toLowerCase(),
    normalizeShippudenDiskId(family, number),
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
