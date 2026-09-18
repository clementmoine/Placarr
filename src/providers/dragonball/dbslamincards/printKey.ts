import { buildPrintKey } from "@/core/identify/printKey";

import { DBS_LAMINCARDS_PRINT_GAME } from "./pack";

const SET_LABELS: Readonly<Record<string, string>> = {
  nero: "Serie Nero",
  argento: "Serie Argento",
  oro: "Serie Oro",
  platino: "Serie Platino",
  smeraldo: "Serie Smeraldo",
  z2008: "Lamincards 2008 (ES)",
  fr2008: "Lamincards France 2008",
  fror: "Lamincards Série Or (FR)",
};

/** `dbslamincards:fr2008-0008` / `dbslamincards:fr2008-0008-s` (Silver). */
export function lamincardsPrintKey(
  setCode: string,
  number: string,
  grouping?: string | null,
): string | null {
  const n = Number.parseInt(number.trim(), 10);
  if (!Number.isFinite(n) || n < 1) return null;
  return buildPrintKey({
    game: DBS_LAMINCARDS_PRINT_GAME,
    set: setCode.trim().toLowerCase(),
    number: String(n).padStart(4, "0"),
    grouping: grouping?.trim().toLowerCase() || null,
  });
}

export function lamincardsSetLabel(setCode: string): string {
  const key = setCode.trim().toLowerCase();
  return SET_LABELS[key] ?? key.toUpperCase();
}

export function formatLamincardsReference(
  setCode: string,
  number: string,
  rarityLabel?: string | null,
): string {
  const n = Number.parseInt(number.trim(), 10);
  const printed = Number.isFinite(n) ? String(n) : number.trim();
  const base = `${lamincardsSetLabel(setCode)} #${printed}`;
  const rarity = rarityLabel?.trim();
  return rarity ? `${base} ${rarity}` : base;
}
