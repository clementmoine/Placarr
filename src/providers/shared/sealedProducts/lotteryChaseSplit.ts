/**
 * Split a sealed lottery pool into base cards vs chase inserts (e.g. Leclerc
 * Fixeez) — chase stays in the random pool, never guaranteed.
 *
 * Display must follow **this SKU's** `packComposition` : Fixeez only appear as
 * « possibles » when `possibleChase` attests them (disney25 / marvel24). A
 * dedicated Fixeez pack (`slots` fixeez) shows them as the primary pool. A
 * 4-card pochette with a separate Fixeez SKU (marvel23) excludes them.
 */
import type { SealedPrintLink } from "./indexFormat";
import type { PackCompositionField } from "./packCompositionTypes";

/** Collector numbers / titles that mark Fixeez-style inserts. */
export function sealedPrintLooksLikeFixeezChase(
  print: Pick<SealedPrintLink, "printKey" | "name" | "slug" | "ref">,
): boolean {
  const key = print.printKey?.trim() || "";
  if (/[:-]f\d{1,3}(?:$|[^\d])/i.test(key)) return true;
  const label = `${print.name ?? ""} ${print.slug ?? ""} ${print.ref ?? ""}`;
  return /\bfixeez\b/i.test(label);
}

export function splitSealedLotteryChasePrints(
  prints: readonly SealedPrintLink[],
): { base: SealedPrintLink[]; chase: SealedPrintLink[] } {
  const base: SealedPrintLink[] = [];
  const chase: SealedPrintLink[] = [];
  for (const print of prints) {
    if (sealedPrintLooksLikeFixeezChase(print)) chase.push(print);
    else base.push(print);
  }
  return { base, chase };
}

function labelLooksLikeFixeez(raw: string): boolean {
  return /\bfixeez\b/i.test(raw.trim());
}

/**
 * How Fixeez relate to **this** SKU's attested composition.
 * - `optional` — `possibleChase` (hors des N cartes, non garanti)
 * - `primary` — slot dédié Fixeez (pochette-fixeez)
 * - `exclude` — pas sur ce SKU (pochette 4 cartes marvel23, etc.)
 */
export function sealedFixeezLotteryRole(
  packComposition: PackCompositionField | undefined,
): "optional" | "primary" | "exclude" {
  if (packComposition == null || packComposition === "none") return "exclude";
  if (typeof packComposition !== "object") return "exclude";
  if ((packComposition.possibleChase ?? []).some(labelLooksLikeFixeez)) {
    return "optional";
  }
  for (const slot of packComposition.slots) {
    if (labelLooksLikeFixeez(slot.id)) return "primary";
    if (slot.rarities.some(labelLooksLikeFixeez)) return "primary";
  }
  return "exclude";
}

export type SealedLotteryDisplayPools = {
  /** Tuiles « cartes / contenu principal » du dialogue. */
  base: SealedPrintLink[];
  /**
   * Section « Fixeez possibles (aléatoire, non garanti) » — seulement si
   * `possibleChase` atteste le chase sur ce SKU.
   */
  optionalChase: SealedPrintLink[];
};

/**
 * Pools UI honnêtes pour un SKU : ne pas inventer Fixeez sur une pochette
 * cartes quand l'édition les vend ailleurs.
 */
export function sealedLotteryDisplayPools(
  prints: readonly SealedPrintLink[],
  packComposition: PackCompositionField | undefined,
): SealedLotteryDisplayPools {
  const { base, chase } = splitSealedLotteryChasePrints(prints);
  const role = sealedFixeezLotteryRole(packComposition);
  if (role === "optional") {
    return { base, optionalChase: chase };
  }
  if (role === "primary") {
    // Never fall back to the 108 set cards — this SKU is Fixeez-only.
    return { base: chase, optionalChase: [] };
  }
  return { base, optionalChase: [] };
}

/**
 * Pool loterie honnête pour un SKU (detail / conseil) : cartes ± Fixeez
 * optionnels, ou Fixeez seuls, selon `packComposition`.
 */
export function sealedLotteryPoolForSku(
  prints: readonly SealedPrintLink[],
  packComposition: PackCompositionField | undefined,
): SealedPrintLink[] {
  const { base, optionalChase } = sealedLotteryDisplayPools(
    prints,
    packComposition,
  );
  return optionalChase.length ? [...base, ...optionalChase] : base;
}
