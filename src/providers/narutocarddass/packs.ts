/**
 * One data pack (`naruto/carddass`) for Carddass FR/IT/JA and Bandai USA CCG.
 * PrintKeys stay `naruto:…` — the game slug is not the folder.
 * `naruto/en-ccg` is a disk / URL alias, not a second catalogue.
 *
 * Client-safe (no `node:*`): `cataloguePacks` is imported by the admin
 * Catalogue tab. Disk roots stay in `indexStore` / callers.
 * Line helpers are verso / set-title only — they do not split the catalogue.
 *
 * Data Carddass arcade (DN/NM) is a **separate** provider
 * (`narutodatacarddass`) — never a Carddass line.
 */
export const NARUTO_PACK_ID = "naruto/carddass";
export const NARUTO_EN_PACK_ID = "naruto/en-ccg";

/**
 * Les deux lignes qui cohabitent dans le pack Carddass.
 */
export type NarutoCardLine = "carddass-fr" | "en-ccg";

/*
  Les familles du 疾風伝 — `shi`, `mju`, `msa`, `gaku` — ont quitté cette liste
  le 2026-08-21 : elles appartiennent à un **autre jeu**, qui a son pack depuis.
  Les y laisser leur donnait la ligne Carddass, et avec elle son verso.
*/
const CARDDASS_PREFIX =
  /^(ni|te|ta|cl|ki|prni|prte|prta|prcl|prki|opni)[-]?\d/i;
/** `nus` / `jus` / `prus` before `n` / `j` / `pr`. */
const EN_CCG_PREFIX =
  /^(nus|jus|mus|cus|prus|n|j|m|c|pr|ps)[-]?\d/i;
/** Arcade Data Carddass — autre provider ; ne jamais router vers en-ccg (N/M). */
const DATA_CARDDASS_PREFIX = /^(dn|nm|nx)[-]?\d/i;

/** True when the printed id belongs to the arcade Data Carddass provider. */
export function isNarutoDataCarddassPrintedRef(card: string): boolean {
  return DATA_CARDDASS_PREFIX.test(card.trim());
}

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
  // Arcade → hors ce pack ; on évite le faux positif en-ccg.
  if (DATA_CARDDASS_PREFIX.test(raw)) return "carddass-fr";
  if (CARDDASS_PREFIX.test(raw)) return "carddass-fr";
  if (EN_CCG_PREFIX.test(raw)) return "en-ccg";
  /*
    Plus de repli `s1`–`s6` / `promo` → Carddass : `J-US088` n'a pas le préfixe
    `j`+chiffres, et le set le classait à tort. 巻ノ / s1 sans numéro lu restent
    Carddass ; le reste (TP, tin, s7+) CCG.
  */
  const series = (set ?? "").trim().toLowerCase();
  if (/^maki\d+$/.test(series)) return "carddass-fr";
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
