/**
 * Coleka deals prices for Dragon Ball Lamincards leaf rubriques.
 *
 * Hub `_r4591` mixes series — never harvest it. Only leaves we can map 1:1
 * onto a catalogue `setCode` (argento / oro / platino / fr2008 / fror).
 */
import path from "node:path";

import {
  harvestColekaDealsForPack,
  writeColekaPriceLedger,
  type ColekaDealsRubriqueTarget,
  type ColekaPriceLedger,
} from "@/providers/shared/coleka/dealsHarvest";

import {
  DBS_LAMINCARDS_PACK_ID,
  dbsLamincardsCuratedDir,
} from "../pack";
import { lamincardsPrintKey } from "../printKey";

export type ColekaLamincardsDealsLeaf = {
  setCode: string;
  rubriqueId: string;
  label: string;
  listedCount: number | null;
};

/** Leaves with a stable setCode in our catalogue. */
export const COLEKA_LAMINCARDS_DEALS_LEAVES: readonly ColekaLamincardsDealsLeaf[] =
  [
    {
      setCode: "argento",
      rubriqueId: "13562",
      label: "Serie Argento 2006",
      listedCount: 152,
    },
    {
      setCode: "oro",
      rubriqueId: "13565",
      label: "Serie Oro 2007",
      listedCount: 151,
    },
    {
      setCode: "platino",
      rubriqueId: "13561",
      label: "Serie Platino 2007",
      listedCount: 193,
    },
    {
      setCode: "fr2008",
      rubriqueId: "7090",
      label: "Lamincards France 2008",
      listedCount: 193,
    },
    {
      setCode: "fror",
      rubriqueId: "7091",
      label: "Série Or France 2009",
      listedCount: 213,
    },
  ];

export function colekaLamincardsPriceLedgerPath(): string {
  return path.join(dbsLamincardsCuratedDir(), "sources", "coleka-prices.json");
}

/**
 * Deals `ref_item` is the checklist number (`037`); Silver / Gold live in the
 * title (`Carte 037 Silver`, `Carte 035 Gold`). Album / non-numeric → null.
 */
export function colekaLamincardsDealParts(
  ref: string | null | undefined,
  title: string | null | undefined,
): { number: string; grouping: string | null } | null {
  const raw = (ref ?? "").trim();
  if (!/^\d{1,3}$/.test(raw)) return null;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1 || n > 250) return null;
  const t = (title ?? "").toLowerCase();
  let grouping: string | null = null;
  if (/\bsilver\b/.test(t)) grouping = "s";
  else if (/\bgold\b/.test(t)) grouping = "g";
  return { number: String(n), grouping };
}

export function colekaLamincardsDealsTargets(): ColekaDealsRubriqueTarget[] {
  return COLEKA_LAMINCARDS_DEALS_LEAVES.map((leaf) => {
    const setCode = leaf.setCode;
    return {
      rubriqueId: leaf.rubriqueId,
      label: `Lamincards ${leaf.label}`,
      listedCount: leaf.listedCount,
      resolvePrintKey: (deal) => {
        const parts = colekaLamincardsDealParts(deal.refItem, deal.title);
        if (!parts) return null;
        return lamincardsPrintKey(setCode, parts.number, parts.grouping);
      },
      resolvePrinted: (deal) => {
        const parts = colekaLamincardsDealParts(deal.refItem, deal.title);
        if (!parts) return null;
        return parts.grouping
          ? `${parts.number}${parts.grouping}`
          : parts.number;
      },
    } satisfies ColekaDealsRubriqueTarget;
  });
}

export async function harvestColekaLamincardsPrices(
  opts: { signal?: AbortSignal } = {},
): Promise<{ ledger: ColekaPriceLedger; outPath: string }> {
  const ledger = await harvestColekaDealsForPack(
    DBS_LAMINCARDS_PACK_ID,
    colekaLamincardsDealsTargets(),
    opts,
  );
  const outPath = writeColekaPriceLedger(
    colekaLamincardsPriceLedgerPath(),
    ledger,
  );
  return { ledger, outPath };
}
