/**
 * Coleka deals prices for E.Leclerc supermarché ops (marvel21–24, disney25).
 */
import {
  harvestColekaDealsForPack,
  writeColekaPriceLedger,
  type ColekaDealsRubriqueTarget,
  type ColekaPriceLedger,
} from "@/providers/shared/coleka/dealsHarvest";
import { packColekaPricesPath } from "@/lib/packPaths";
import { COLEKA_LECLERC_LISTINGS } from "./parseColekaLeclerc";
import { leclercPrintKey } from "./printKey";

/** Ledger pack id (shared across `leclerc/marvel21` … admin lines). */
export const LECLERC_COLEKA_PRICE_PACK_ID = "leclerc";

export function colekaLeclercPriceLedgerPath(): string {
  return packColekaPricesPath(LECLERC_COLEKA_PRICE_PACK_ID);
}

function rubriqueIdFromListingPath(listingPath: string): string | null {
  const m = /_r(\d+)\b/i.exec(listingPath);
  return m?.[1] ?? null;
}

/**
 * Coleka deals `ref_item` → checklist number (`009`, `f14`).
 * Album / empty refs → null.
 */
export function colekaLeclercRefToNumber(
  ref: string | null | undefined,
): string | null {
  const raw = (ref ?? "").trim();
  if (!raw) return null;
  const fixeez = /^f\s*(\d{1,2})$/i.exec(raw);
  if (fixeez) return `f${String(Number(fixeez[1])).padStart(2, "0")}`;
  const letter = /^([A-H])$/i.exec(raw);
  if (letter) {
    const ord = letter[1]!.toUpperCase().charCodeAt(0) - "A".charCodeAt(0);
    return String(89 + ord).padStart(3, "0");
  }
  const prefixed = /^([CJc])\s*(\d{1,3})$/i.exec(raw);
  if (prefixed) {
    const p = prefixed[1]!.toLowerCase();
    const num = Number(prefixed[2]);
    if (!Number.isFinite(num) || num < 1 || num > 200) return null;
    if (p === "c" || p === "j") return `${p}${String(num).padStart(2, "0")}`;
  }
  const n = /^(\d{1,3})$/.exec(raw);
  if (!n) return null;
  const num = Number(n[1]);
  if (!Number.isFinite(num) || num < 1 || num > 200) return null;
  return String(num).padStart(3, "0");
}

export function colekaLeclercDealsTargets(): ColekaDealsRubriqueTarget[] {
  return COLEKA_LECLERC_LISTINGS.map((listing) => {
    const rubriqueId = rubriqueIdFromListingPath(listing.listingPath);
    if (!rubriqueId) {
      throw new Error(`Leclerc listing ${listing.setCode} missing _r id`);
    }
    const setCode = listing.setCode;
    return {
      rubriqueId,
      label: `Leclerc ${setCode}`,
      listedCount: null,
      resolvePrintKey: (deal) => {
        const number = colekaLeclercRefToNumber(deal.refItem);
        if (!number) return null;
        return leclercPrintKey(setCode, number);
      },
      resolvePrinted: (deal) => colekaLeclercRefToNumber(deal.refItem),
    } satisfies ColekaDealsRubriqueTarget;
  });
}

export async function harvestColekaLeclercPrices(
  opts: { signal?: AbortSignal } = {},
): Promise<{ ledger: ColekaPriceLedger; outPath: string }> {
  const ledger = await harvestColekaDealsForPack(
    LECLERC_COLEKA_PRICE_PACK_ID,
    colekaLeclercDealsTargets(),
    opts,
  );
  const outPath = writeColekaPriceLedger(
    colekaLeclercPriceLedgerPath(),
    ledger,
  );
  return { ledger, outPath };
}
