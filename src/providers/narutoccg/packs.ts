/**
 * One data pack (`naruto/carddass`) for Carddass FR/IT/JA and Bandai USA CCG.
 * PrintKeys stay `naruto:…` — the game slug is not the folder.
 * `naruto/en-ccg` is a disk / URL alias, not a second catalogue.
 *
 * Client-safe (no `node:*`): `cataloguePacks` is imported by the admin
 * Catalogue tab. Disk roots stay in `indexStore` / callers.
 * Line helpers are verso / set-title only — they do not split the catalogue.
 */
export const NARUTO_PACK_ID = "naruto/carddass";
export const NARUTO_EN_PACK_ID = "naruto/en-ccg";

/**
 * Les trois lignes qui cohabitent dans le pack.
 *
 * `data-carddass` est le jeu de **borne d'arcade** : la borne scanne un
 * code-barres au dos, la carte n'a rien à voir avec la numérotation 忍/術/作/依
 * du jeu de table. Elle partage le pack, jamais la série.
 */
export type NarutoCardLine = "carddass-fr" | "en-ccg" | "data-carddass";

/*
  Les familles du 疾風伝 — `shi`, `mju`, `msa`, `gaku` — ont quitté cette liste
  le 2026-08-21 : elles appartiennent à un **autre jeu**, qui a son pack depuis.
  Les y laisser leur donnait la ligne Carddass, et avec elle son verso.
*/
const CARDDASS_PREFIX =
  /^(ni|te|ta|cl|ki|prni|prte|prta|prcl|prki|opni)[-]?\d/i;
const EN_CCG_PREFIX = /^(n|j|m|c|pr|ps)[-]?\d/i;
/** `DN-032T` (cabinet 2005), `NM-049` (cabinet 2007). Testé avant `n`/`m`. */
const DATA_CARDDASS_PREFIX = /^(dn|nm)[-]?\d/i;

/**
 * Line split is verso / sealed only. `ni001` and `n001` sit side by side
 * (same numeration family) but stay distinct impressions.
 * Do not use the set code alone — both lines have an s1.
 */
export function narutoCatalogueLineForCard(
  card: string,
  set?: string,
): NarutoCardLine {
  const raw = card.trim();
  // Avant tout le reste : `NM-049` commence par un `n` qui n'est pas celui du CCG US.
  if (DATA_CARDDASS_PREFIX.test(raw)) return "data-carddass";
  if (CARDDASS_PREFIX.test(raw)) return "carddass-fr";
  if (EN_CCG_PREFIX.test(raw)) return "en-ccg";
  const series = (set ?? "").trim().toLowerCase();
  /*
    `gaku` et les `maku` sont partis avec le 疾風伝 ; ne restent ici que les
    séries européennes, les promos et les 巻ノ japonais.
  */
  if (
    series === "promo" ||
    /^s[1-6]$/.test(series) ||
    /^maki\d+$/.test(series)
  ) {
    return "carddass-fr";
  }
  return "en-ccg";
}

export function narutoCatalogueLineForSealed(entry: {
  lang?: string | null;
  setCode?: string | null;
  slug: string;
}): NarutoCardLine {
  const lang = (entry.lang ?? "").toUpperCase();
  if (lang === "EN") return "en-ccg";
  if (lang === "IT" || lang === "JA" || lang === "JP") return "carddass-fr";
  // Bandai CCG displays are s7–s28 (`display-s13`). Italian CACG is `display-s1-it`.
  // JP 巻ノ volumes use `booster-vol5-jp` / set `maki5` — not FR `booster-s5`.
  if (/^display-s(?:[7-9]|1\d|2[0-8])$/i.test(entry.slug)) return "en-ccg";
  const set = (entry.setCode ?? "").trim().toLowerCase();
  if (/^s(?:[7-9]|1\d|2[0-8])$/.test(set)) return "en-ccg";
  return "carddass-fr";
}

export function narutoDataPackForCard(_card: string, _set?: string): string {
  return NARUTO_PACK_ID;
}
