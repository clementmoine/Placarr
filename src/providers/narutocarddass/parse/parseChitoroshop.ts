/**
 * Identifier une carte de chitoroshop, dont la fiche ne dit pas sa famille.
 *
 * La boutique vend des cartes japonaises à l'unité, avec des scans à plat en
 * 1414×2000 — exactement ce qui manque au catalogue japonais. Mais son titre
 * ne porte que le nom et le numéro : « Baki 130 ». Or le numéro seul ne tranche
 * rien, chacun existant dans six ou sept familles du catalogue.
 *
 * **Deux signaux indépendants**, et c'est leur indépendance qui fait la valeur :
 *
 * 1. Le **nom anglais**. La boutique écrit en anglais, et le catalogue tient
 *    4 261 titres anglais du CCG américain. Une correspondance exacte sur le
 *    couple (nom, numéro) donne la famille — américaine, qu'on traduit ensuite
 *    en famille japonaise, `n`→`ni`, `j`→`te`, `m`→`ta`.
 * 2. Le **volume**. La fiche dit « Vol.6 », et les plages de numéros de chaque
 *    sortie japonaise sont connues. Si une seule famille du volume couvre ce
 *    numéro, elle est désignée.
 *
 * Mesuré le 2026-08-21 sur les 227 produits : les deux signaux se prononcent
 * ensemble 15 fois et **ne se contredisent jamais**. C'est cette absence de
 * désaccord qui autorise à faire confiance aux 52 cas où un seul parle.
 *
 * Ce module ne fait que l'identification, sans réseau : il se teste sur des
 * chaînes.
 */

/** Famille américaine → famille japonaise. Même carte, deux numérotations. */
const JAPANESE_FAMILY: Readonly<Record<string, string>> = {
  n: "ni",
  ni: "ni",
  j: "te",
  ju: "te",
  te: "te",
  m: "ta",
  mi: "ta",
  st: "ta",
  ta: "ta",
  c: "cl",
  cl: "cl",
  ki: "ki",
};

export function japaneseFamilyOf(family: string): string | null {
  return JAPANESE_FAMILY[family.trim().toLowerCase()] ?? null;
}

/** Accents retirés, ponctuation aplatie : « Kidōmaru » et « Kidomaru ». */
export function normalizeShopName(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type ChitoroTitle = { name: string; number: number };

/**
 * « Baki 130 | Naruto Card Game » → `{ name: "baki", number: 130 }`.
 *
 * Rend `null` dès que le titre ne finit pas par un numéro : la collection tient
 * aussi des autocollants et de la Data Carddass, qui ne sont pas des cartes de
 * ce jeu.
 */
export function parseChitoroTitle(title: string): ChitoroTitle | null {
  const head = String(title).split("|")[0]?.trim() ?? "";
  const match = /^(.*?)\s+(\d{1,3})$/.exec(head);
  if (!match) return null;
  const name = normalizeShopName(match[1]);
  if (!name) return null;
  return { name, number: Number(match[2]) };
}

/** « Naruto Card Game Vol.6 (2004) » → `maki6`. */
export function chitoroVolumeSetCode(text: string): string | null {
  const match = /Vol\.?\s*(\d{1,2})\b/i.exec(text);
  return match ? `maki${Number(match[1])}` : null;
}

export type ChitoroIdentity = {
  family: string;
  number: number;
  /** Ce qui a tranché — les deux, ou l'un des deux. */
  by: "both" | "name" | "volume";
};

/**
 * Croise les deux signaux.
 *
 * Un **désaccord** ne se tranche pas : on rend `null` plutôt que de choisir. Il
 * ne s'en est présenté aucun sur les 227 produits, et le jour où il s'en
 * présentera un, c'est qu'une des deux tables est fausse — pas qu'il faut
 * départager au hasard.
 */
export function resolveChitoroIdentity(input: {
  number: number;
  byName: string | null;
  byVolume: string | null;
}): ChitoroIdentity | null {
  const { number, byName, byVolume } = input;
  if (byName && byVolume) {
    if (byName !== byVolume) return null;
    return { family: byName, number, by: "both" };
  }
  if (byName) return { family: byName, number, by: "name" };
  if (byVolume) return { family: byVolume, number, by: "volume" };
  return null;
}
