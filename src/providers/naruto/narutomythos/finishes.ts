/**
 * Mythos rarity / parallel → house foil (flare + full-face mask).
 *
 * Parallels are distinct printKeys (grouping `v` / `vv2` / `h` / …), not a
 * picker on a common — foil-only once stamped, like DBS JCC Holo rows.
 */
import { NARUTO_MYTHOS_FULL_FOIL_MASK_URL } from "@/effects/narutomythos";
import type { PrintCandidate } from "@/types/providerModule";
import type { LocalPrintSearchRow } from "@/providers/shared/cardCatalogue/localPrintsIndex";

/** Canonical finish key declared on the effect pack. */
export type MythosFoilFinish = "holo";

/**
 * Rarities that ship as foil parallels on CICABOOM Mythos (not C / UC / R).
 * Grouping markers `h` / `gold` also count when rarity alone is plain.
 */
const FOIL_RARITIES = new Set([
  "m",
  "mythos",
  "ra",
  "s",
  "sv",
  "l",
  "legendary",
  "secret gold v",
]);

export function mythosFoilFromRarity(
  rarity: string | null | undefined,
): MythosFoilFinish | null {
  const key = rarity?.trim().toLowerCase() ?? "";
  if (!key) return null;
  if (FOIL_RARITIES.has(key)) return "holo";
  if (key.includes("holo") || key.includes("gold")) return "holo";
  return null;
}

/** Grouping slugs that mark a foil parallel (`h`, `gold`, Mythos `v`/`vv2`). */
export function mythosFoilFromGrouping(
  grouping: string | null | undefined,
): MythosFoilFinish | null {
  const g = grouping?.trim().toLowerCase() ?? "";
  if (!g) return null;
  // Variant=gold → `…gold…`. Variant=holo → `h` before `vN` or at end (`ah`, `hv2`).
  // Do not use bare `includes("h")` — that would catch `chibi` / `shinobi`.
  if (g.includes("gold") || /h(?:v\d|$)/.test(g)) return "holo";
  // Mythos rarity parallels: `v`, `vv2`, `vv2w`, …
  if (g === "v" || g.startsWith("vv") || /^v\d/.test(g)) return "holo";
  return null;
}

export function mythosFoilForPrint(
  rarity: string | null | undefined,
  grouping: string | null | undefined,
): MythosFoilFinish | null {
  return mythosFoilFromRarity(rarity) ?? mythosFoilFromGrouping(grouping);
}

export function decorateMythosCandidate(
  candidate: PrintCandidate,
  row: LocalPrintSearchRow,
): PrintCandidate {
  const rarity = row.rarity ?? candidate.rarity;
  const finish = mythosFoilForPrint(rarity, row.grouping);
  if (!finish) return candidate;
  return {
    ...candidate,
    finishes: [finish],
    plainFinishes: [],
    foilMaskUrl: NARUTO_MYTHOS_FULL_FOIL_MASK_URL,
  };
}
