/**
 * Naruto face paths: `cards/{folder}/{ni0001|n0001}/{lang}/`.
 * Alt JP lines use their prefix as folder (`gaku/gaku0001`, `shi/shi0001`).
 * Series folders (`s1`, `s28`) are the old layout — still readable.
 */
import { assetsPackBase } from "@/lib/packAssetUrls";

import {
  isNarutoFamilyFolder,
  narutoCardDiskFolder,
  narutoDiskCardId,
  parseNarutoCollector,
  type NarutoCollectorFamily,
} from "./collectorIdentity";

export type NarutoCardPathId = {
  family: NarutoCollectorFamily;
  folder: string;
  diskId: string;
  lang: string;
};

/**
 * `JAP` / `JP` → `ja`. Une langue absente rend `""` plutôt que de jeter.
 *
 * Le paramètre était typé `string` mais recevait `null` : un tirage sans aucun
 * titre n'a pas de langue, et **188 d'entre eux** existent au catalogue. Le
 * `.trim()` sur `null` faisait jeter la construction du candidat — et comme la
 * recherche enveloppe chaque provider dans un `allSettled`, une seule de ces
 * cartes vidait **tout** le résultat. Chercher « cl04 » ne rendait rien, parce
 * que la requête croisait `cl-0043`, qui n'a pas de titre.
 */
export function normalizeNarutoLang(lang: string | null | undefined): string {
  const code = (lang ?? "").trim().toLowerCase();
  if (code === "jap" || code === "jp") return "ja";
  return code;
}

export function narutoCardPathFromCollector(
  raw: string,
  lang: string | null | undefined,
  appearanceSet?: string | null,
): NarutoCardPathId | null {
  const id = parseNarutoCollector(raw);
  const diskId = narutoDiskCardId(raw, appearanceSet);
  if (!id || !diskId) return null;
  /*
    La langue est un **segment du chemin** (`ninja/ni0001/fr`). Sans elle, il n'y
    a pas de chemin à donner — et un dossier vide pointerait à côté. On rend
    `null`, ce que les appelants savent lire : ils n'attachent alors ni art ni
    vignette, et la carte reste sélectionnable par sa seule référence.
  */
  const code = normalizeNarutoLang(lang);
  if (!code) return null;
  return {
    family: id.family,
    folder: narutoCardDiskFolder(id),
    diskId,
    lang: code,
  };
}

/** `ninja/ni0001/fr` · `gaku/gaku0001/ja` */
export function narutoCardRelPath(id: NarutoCardPathId): string {
  return `${id.folder}/${id.diskId}/${id.lang}`;
}

export function narutoCardRelSegments(id: NarutoCardPathId): string[] {
  return [id.folder, id.diskId, id.lang];
}

/** Old dump: `s1/fr/ni001`. */
export function legacyNarutoCardRelPath(
  appearanceSet: string,
  lang: string,
  cardId: string,
): string {
  return `${appearanceSet}/${lang}/${cardId}`;
}

export function narutoAssetsCardUrl(
  pack: string,
  id: NarutoCardPathId,
  file: string,
): string {
  const parts = [...narutoCardRelSegments(id), file].map((p) =>
    encodeURIComponent(p),
  );
  return `${assetsPackBase(pack)}/cards/${parts.join("/")}`;
}

export function isNewNarutoCardLayoutRoot(name: string): boolean {
  return isNarutoFamilyFolder(name);
}

const NARUTO_LANGS = new Set(["fr", "en", "it", "ja"]);

export function isNarutoLangDir(name: string): boolean {
  return NARUTO_LANGS.has(normalizeNarutoLang(name));
}
