/**
 * Nikita JA scans of landscape prints land as portrait files (Canon flatbed).
 * Ability + attested early Blast Souls need a CCW quarter-turn so artW > artH.
 * Later Blast Souls (S-500, S-687…) are upright portrait prints — leave them.
 */
import type { BleachScbCard } from "./parseCarddassFr";
import { BLEACH_SCB_ABILITY_SET } from "./printKey";

/**
 * Blast Soul collector numbers whose nikita scan is a sideways landscape print.
 * Not every ブラストソウル — S-500 / S-687 stay portrait.
 */
const BLEACH_SCB_BLAST_LANDSCAPE_NUMBERS: ReadonlySet<string> = new Set([
  "026",
  "031",
  "032",
  "099",
  "128",
  "129",
  "181",
]);

/** Degrees passed to sharp.rotate / sips -r (CCW 90 ≡ 270 CW). */
export function bleachScbJaFaceRotateDeg(
  card: Pick<BleachScbCard, "type" | "set" | "number">,
): 0 | 90 | 180 | 270 {
  const type = card.type?.trim() ?? "";
  if (type === "アビリティ" || card.set === BLEACH_SCB_ABILITY_SET) return 270;
  if (
    type === "ブラストソウル" &&
    BLEACH_SCB_BLAST_LANDSCAPE_NUMBERS.has(card.number?.padStart(3, "0") ?? "")
  ) {
    return 270;
  }
  return 0;
}
