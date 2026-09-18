/**
 * Printed refs Bleach Soul Card Battle — A/C/E/Z/P + JP S-/B-/E-/Z-/PZ-/J- + Ability A-.
 *
 * FR `A###` (âme, remappé depuis JP S-) ≠ JP `A-###` (アビリティ). Ne pas
 * fusionner les deux sous le set `a`.
 *
 * JP events/zanpakuto keep the hyphen on nikita (`E-007`, `Z-023`) but share
 * the letter namespace with FR `E###` / `Z###` (same physical EU remaps when
 * present).
 */
import { buildPrintKey } from "@/core/identify/printKey";

import { BLEACH_SCB_PRINT_GAME } from "./pack";

export type BleachScbParsed = {
  set: string;
  number: string;
  printed: string;
};

/** Disk / printKey set for JP Ability cards (`A-029`). */
export const BLEACH_SCB_ABILITY_SET = "ability";

/** `A001` / `A-029` / `E-007` / `S-001` / `J-011` / `PZ-004` → set + number. */
export function parseBleachScbPrinted(raw: string): BleachScbParsed | null {
  const trimmed = raw.trim().replace(/\s+/g, "").toUpperCase();
  // JP Ability keeps the hyphen on-card (A-029). FR âmes are A029.
  const ability = trimmed.match(/^A-(\d{3})$/);
  if (ability) {
    const num = ability[1]!;
    return {
      set: BLEACH_SCB_ABILITY_SET,
      number: num,
      printed: `A-${num}`,
    };
  }
  // Jump / magazine promos (nikita プロモーションカード).
  const jump = trimmed.match(/^J-?(\d{3})$/);
  if (jump) {
    const num = jump[1]!;
    return { set: "j", number: num, printed: `J-${num}` };
  }
  // FR âme without hyphen; C/E/Z/P with optional hyphen (FR liste + JP nikita).
  const letter = trimmed.match(/^([ACEZP])-?(\d{3})$/);
  if (letter) {
    const type = letter[1]!.toLowerCase();
    const num = letter[2]!;
    // A with hyphen already handled as Ability above.
    if (type === "a") {
      return { set: "a", number: num, printed: `A${num}` };
    }
    const prefix = letter[1]!;
    return {
      set: type === "p" ? "p" : type,
      number: num,
      printed: `${prefix}${num}`,
    };
  }
  const jp = trimmed.match(/^(PZ|S|B)-?(\d{1,4})$/i);
  if (jp) {
    const prefix = jp[1]!.toLowerCase();
    const num = jp[2]!.padStart(3, "0");
    return {
      set: prefix === "pz" ? "promo" : prefix,
      number: num,
      printed: `${jp[1]!.toUpperCase()}-${num}`,
    };
  }
  return null;
}

export function bleachScbPrintKey(set: string, number: string): string | null {
  return buildPrintKey({
    game: BLEACH_SCB_PRINT_GAME,
    set,
    number,
  });
}

export function formatBleachScbReference(
  set: string,
  number: string,
): string {
  const s = set.trim().toLowerCase();
  const n = number.replace(/^0+/, "") || number;
  const padded = number.padStart(3, "0");
  if (s === BLEACH_SCB_ABILITY_SET) return `A-${padded}`;
  if (s === "j") return `J-${padded}`;
  if (/^[acezp]$/.test(s)) {
    return `${s.toUpperCase()}${padded}`;
  }
  if (s === "promo") return `PZ-${n}`;
  return `${s.toUpperCase()}-${n}`;
}

export function normalizeBleachScbSearchQuery(query: string): string {
  const parsed = parseBleachScbPrinted(query);
  if (parsed) return parsed.number;
  return query.trim().toLowerCase();
}
