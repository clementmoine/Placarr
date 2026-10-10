/**
 * Harvest Coleka deals → curated price ledgers (printKey-anchored).
 *
 * One rubrique = one deals ajax call. Packs supply `resolvePrintKey`.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import {
  fetchColekaRubriqueDeals,
  type ColekaDealOffer,
} from "./deals";

export type ColekaPriceRow = {
  printKey: string | null;
  printed: string | null;
  colekaId: string;
  rubriqueId: string;
  refItem: string | null;
  title: string | null;
  quotationEuro: number | null;
  quotationCents: number | null;
  offerEuro: number | null;
  offerCents: number | null;
  shippingEuro: number | null;
  marketplace: string | null;
  observedAt: string | null;
  affiliatePath: string | null;
};

export type ColekaPriceLedger = {
  source: string;
  sourceId: "coleka-deals";
  packId: string;
  fetchedAt: string;
  rubriques: {
    id: string;
    label: string;
    offerCount: number;
    uniqueItems: number;
    withQuotation: number;
    listedCount: number | null;
  }[];
  offerCount: number;
  uniqueItems: number;
  withQuotation: number;
  withPrintKey: number;
  cards: ColekaPriceRow[];
};

export type ColekaDealsRubriqueTarget = {
  rubriqueId: string;
  label: string;
  listedCount?: number | null;
  resolvePrintKey: (deal: ColekaDealOffer) => string | null;
  resolvePrinted?: (deal: ColekaDealOffer) => string | null;
};

export type HarvestColekaDealsOpts = {
  signal?: AbortSignal;
  lang?: string;
  nbs?: number;
  /** Forwarded to deals ajax (logged-in Coleka session). */
  cookie?: string;
};

export function colekaEuroToCents(euro: number | null): number | null {
  if (euro == null || !Number.isFinite(euro)) return null;
  return Math.round(euro * 100);
}

export function dealToColekaPriceRow(
  deal: ColekaDealOffer,
  resolve: Pick<
    ColekaDealsRubriqueTarget,
    "resolvePrintKey" | "resolvePrinted"
  >,
): ColekaPriceRow {
  return {
    printKey: resolve.resolvePrintKey(deal),
    printed: resolve.resolvePrinted?.(deal) ?? deal.refItem,
    colekaId: deal.colekaId,
    rubriqueId: deal.rubriqueId || "",
    refItem: deal.refItem,
    title: deal.title,
    quotationEuro: deal.quotationEuro,
    quotationCents: colekaEuroToCents(deal.quotationEuro),
    offerEuro: deal.offerEuro,
    offerCents: colekaEuroToCents(deal.offerEuro),
    shippingEuro: deal.shippingEuro,
    marketplace: deal.marketplace,
    observedAt: deal.observedAt,
    affiliatePath: deal.affiliatePath,
  };
}

/** Prefer row with quotation; else newer observedAt. */
function mergePriceRows(
  a: ColekaPriceRow,
  b: ColekaPriceRow,
): ColekaPriceRow {
  const aQ = a.quotationCents != null;
  const bQ = b.quotationCents != null;
  if (aQ !== bQ) return bQ ? b : a;
  const aTs = a.observedAt ?? "";
  const bTs = b.observedAt ?? "";
  return bTs >= aTs ? b : a;
}

export function mergeColekaPriceRows(
  rows: ColekaPriceRow[],
): ColekaPriceRow[] {
  const byKey = new Map<string, ColekaPriceRow>();
  for (const row of rows) {
    const key =
      row.printKey?.trim() ||
      `id:${row.colekaId}` ||
      `ref:${row.refItem ?? ""}`;
    const prev = byKey.get(key);
    byKey.set(key, prev ? mergePriceRows(prev, row) : row);
  }
  return [...byKey.values()].sort((a, b) =>
    (a.printKey ?? a.printed ?? a.colekaId).localeCompare(
      b.printKey ?? b.printed ?? b.colekaId,
    ),
  );
}

export async function harvestColekaDealsForPack(
  packId: string,
  targets: readonly ColekaDealsRubriqueTarget[],
  opts: HarvestColekaDealsOpts = {},
): Promise<ColekaPriceLedger> {
  const rubriqueSummaries: ColekaPriceLedger["rubriques"] = [];
  const allRows: ColekaPriceRow[] = [];
  let offerCount = 0;

  for (const target of targets) {
    const result = await fetchColekaRubriqueDeals(target.rubriqueId, {
      signal: opts.signal,
      lang: opts.lang ?? "fr",
      nbs: opts.nbs ?? 200,
      cookie: opts.cookie,
    });
    offerCount += result.offerCount;
    const rows = result.items.map((deal) =>
      dealToColekaPriceRow(deal, target),
    );
    const withQuotation = rows.filter((r) => r.quotationCents != null).length;
    rubriqueSummaries.push({
      id: target.rubriqueId,
      label: target.label,
      offerCount: result.offerCount,
      uniqueItems: rows.length,
      withQuotation,
      listedCount: target.listedCount ?? null,
    });
    allRows.push(...rows);
  }

  const cards = mergeColekaPriceRows(allRows);
  return {
    source: `coleka.com deals ajax (${packId})`,
    sourceId: "coleka-deals",
    packId,
    fetchedAt: new Date().toISOString(),
    rubriques: rubriqueSummaries,
    offerCount,
    uniqueItems: cards.length,
    withQuotation: cards.filter((c) => c.quotationCents != null).length,
    withPrintKey: cards.filter((c) => Boolean(c.printKey)).length,
    cards,
  };
}

export function writeColekaPriceLedger(
  outPath: string,
  ledger: ColekaPriceLedger,
): string {
  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(ledger, null, 2)}\n`, "utf8");
  return outPath;
}

export function readColekaPriceLedger(
  filePath: string,
): ColekaPriceLedger | null {
  if (!existsSync(filePath)) return null;
  return JSON.parse(readFileSync(filePath, "utf8")) as ColekaPriceLedger;
}

/** Prefer quotation (cote) over live marketplace ask. */
export function colekaRowPreferredCents(row: ColekaPriceRow): number | null {
  if (row.quotationCents != null && row.quotationCents > 0) {
    return row.quotationCents;
  }
  if (row.offerCents != null && row.offerCents > 0) return row.offerCents;
  return null;
}

export function colekaPriceCentsByPrintKey(
  ledger: ColekaPriceLedger | null,
): Map<string, number> {
  const out = new Map<string, number>();
  if (!ledger) return out;
  for (const row of ledger.cards) {
    const pk = row.printKey?.trim();
    if (!pk) continue;
    const cents = colekaRowPreferredCents(row);
    if (cents == null) continue;
    if (!out.has(pk)) out.set(pk, cents);
  }
  return out;
}
