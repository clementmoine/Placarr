/**
 * nikita.jp `/cardlist/blc` — BLEACH ソウルカードバトル (JA titles + face URLs).
 *
 * JP numbering (S-/B-/E-/Z-/PZ- + Ability A-) is the original identity. FR
 * carddass.fr remapped A/C/E/Z — do not merge FR âme `A###` with JP Ability
 * `A-###`.
 *
 * Structure HTML parsée par le client partagé ; ici seulement l'identité BLC.
 */
import {
  NIKITA_TCG_DB_ORIGIN,
  nikitaCardlistPath,
  parseNikitaCardlistRows,
} from "@/providers/shared/nikita/cardlist";

import {
  BLEACH_SCB_ABILITY_SET,
  parseBleachScbPrinted,
} from "./printKey";

export const NIKITA_BLC_ORIGIN = NIKITA_TCG_DB_ORIGIN;
export const NIKITA_BLC_CARDLIST_PATH = nikitaCardlistPath("blc");

export type NikitaBlcCard = {
  printed: string;
  set: string;
  number: string;
  nameJa: string;
  faceUrlJa: string;
  setLabel: string | null;
  cardType: string | null;
};

export function parseNikitaBlcCardlist(html: string): NikitaBlcCard[] {
  const out: NikitaBlcCard[] = [];
  const seen = new Set<string>();
  for (const row of parseNikitaCardlistRows(html, "blc")) {
    const parsed = parseBleachScbPrinted(row.printedRef);
    if (!parsed) continue;
    // Belt: ctype アビリティ without hyphenated A- still lands on ability.
    const isAbility =
      parsed.set === BLEACH_SCB_ABILITY_SET ||
      row.cardTypeLabel === "アビリティ";
    const set = isAbility ? BLEACH_SCB_ABILITY_SET : parsed.set;
    const printed =
      set === BLEACH_SCB_ABILITY_SET
        ? `A-${parsed.number}`
        : parsed.printed;
    if (seen.has(printed)) continue;
    seen.add(printed);
    out.push({
      printed,
      set,
      number: parsed.number,
      nameJa: row.nameJa,
      faceUrlJa: row.faceUrl,
      setLabel: row.setLabel,
      cardType: row.cardTypeLabel,
    });
  }
  return out;
}
