import { buildPrintKey } from "@/core/identify/printKey";

import { LECLERC_PRINT_GAME } from "./pack";

/** Star Wars Cosmic Shells — Leclerc 2015. */
export const LECLERC_SW15_SET = "sw15";
/** Star Wars Cosmic Shells II — Leclerc 2016. */
export const LECLERC_SW16_SET = "sw16";
/** Star Wars — Leclerc 2018. */
export const LECLERC_SW18_SET = "sw18";
/** Star Wars « Maîtriser la Force » — Leclerc 2019. */
export const LECLERC_SW19_SET = "sw19";
/** Star Wars « Maîtriser la Force » — Sticker Backs — Leclerc 2019. */
export const LECLERC_SW19_STICKER_SET = "sw19sb";
/** Marvel « Deviens un Héros » — Leclerc 2020. */
export const LECLERC_MARVEL20_SET = "marvel20";
/** Marvel « Deviens un Héros » — Sticker Backs — Leclerc 2020. */
export const LECLERC_MARVEL20_STICKER_SET = "marvel20sb";
/** Marvel « Révèle ton Pouvoir » — Leclerc automne 2021. */
export const LECLERC_MARVEL21_SET = "marvel21";
/** Marvel « Pars en Mission » — Leclerc automne 2022. */
export const LECLERC_MARVEL22_SET = "marvel22";
/** Marvel « Défie tes Héros » — Leclerc automne 2023. */
export const LECLERC_MARVEL23_SET = "marvel23";
/** Marvel « Explore l'univers Marvel avec Groot » — Leclerc automne 2024. */
export const LECLERC_MARVEL24_SET = "marvel24";
/** Disney « Découvre la magie de Disney » — Leclerc automne 2025. */
export const LECLERC_DISNEY25_SET = "disney25";

/**
 * Affichage catalogue : `{année} {Franchise}: {titre}` (± variante Sticker Backs).
 * Aligné sur les intitulés collectionneur / TCDB.
 */
const SET_LABELS_FR: Readonly<Record<string, string>> = {
  [LECLERC_SW15_SET]: "2015 Star Wars Cosmic Shells",
  [LECLERC_SW16_SET]: "2016 Star Wars Cosmic Shells II",
  [LECLERC_SW18_SET]: "2018 Star Wars",
  [LECLERC_SW19_SET]: "2019 Star Wars: Maîtriser la Force",
  [LECLERC_SW19_STICKER_SET]:
    "2019 Star Wars: Maîtriser la Force - Sticker Backs",
  [LECLERC_MARVEL20_SET]: "2020 Marvel: Deviens un Héros",
  [LECLERC_MARVEL20_STICKER_SET]:
    "2020 Marvel: Deviens un Héros - Sticker Backs",
  [LECLERC_MARVEL21_SET]: "2021 Marvel: Révèle ton Pouvoir",
  [LECLERC_MARVEL22_SET]: "2022 Marvel: Pars en Mission",
  [LECLERC_MARVEL23_SET]: "2023 Marvel: Défie tes Héros",
  [LECLERC_MARVEL24_SET]: "2024 Marvel: Explore L'Univers Marvel avec Groot",
  [LECLERC_DISNEY25_SET]: "2025 Disney: Découvre la magie de Disney",
};

const SET_SORT: Readonly<Record<string, number>> = {
  [LECLERC_SW15_SET]: 2015,
  [LECLERC_SW16_SET]: 2016,
  [LECLERC_SW18_SET]: 2018,
  [LECLERC_SW19_SET]: 2019,
  [LECLERC_SW19_STICKER_SET]: 2019.1,
  [LECLERC_MARVEL20_SET]: 2020,
  [LECLERC_MARVEL20_STICKER_SET]: 2020.1,
  [LECLERC_MARVEL21_SET]: 2021,
  [LECLERC_MARVEL22_SET]: 2022,
  [LECLERC_MARVEL23_SET]: 2023,
  [LECLERC_MARVEL24_SET]: 2024,
  [LECLERC_DISNEY25_SET]: 2025,
};

export function leclercPrintKey(
  setCode: string,
  number: string,
): string | null {
  return buildPrintKey({
    game: LECLERC_PRINT_GAME,
    set: setCode.trim().toLowerCase(),
    number: number.trim().toLowerCase(),
    grouping: null,
  });
}

export function leclercSetLabel(setCode: string, _language?: string | null): string {
  const code = setCode.trim().toLowerCase();
  return SET_LABELS_FR[code] ?? setCode.toUpperCase();
}

export function leclercSetSortKey(setCode: string): number | null {
  const code = setCode.trim().toLowerCase();
  return SET_SORT[code] ?? null;
}

/** `001` / `f01` → `MARVEL24-001` / `MARVEL24-F01`. */
export function formatLeclercReference(
  setCode: string,
  number: string,
  _grouping?: string | null,
  _language?: string | null,
): string {
  const n = number.trim().toLowerCase();
  if (n.startsWith("f")) {
    return `${setCode.toUpperCase()}-${n.toUpperCase()}`;
  }
  return `${setCode.toUpperCase()}-${n.toUpperCase()}`;
}
