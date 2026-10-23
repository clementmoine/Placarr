/**
 * Split a sealed lottery pool into base cards vs chase inserts (e.g. Leclerc
 * Fixeez) — chase stays in the random pool, never guaranteed.
 */
import type { SealedPrintLink } from "./indexFormat";

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
