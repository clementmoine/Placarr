/**
 * Coleka deals prices for Naruto Carddass FR + EN CCG leaf rubriques.
 */
import path from "node:path";

import {
  harvestColekaDealsForPack,
  writeColekaPriceLedger,
  type ColekaDealsRubriqueTarget,
  type ColekaPriceLedger,
} from "@/providers/shared/coleka/dealsHarvest";

import { mintNarutoPrintKey } from "../identity";
import {
  COLEKA_CARDDASS_FR_SERIES,
  colekaCarddassPrefixToCollector,
  colekaEuPrefixToCollector,
  colekaRampagePrefixToCollector,
  colekaUsPromoRefToCollector,
} from "../parse/coleka";
import { NARUTO_PACK_ID } from "../packs";
import colekaS6It from "../curated/sources/coleka-s6-it.json";
import colekaS24 from "../curated/sources/coleka-s24.json";
import colekaS28 from "../curated/sources/coleka-s28.json";
import colekaUsPromos from "../curated/sources/coleka-us-promos.json";

function curatedSourcesDir(): string {
  return path.join(
    process.cwd(),
    "src/providers/naruto/narutocarddass/curated/sources",
  );
}

export function colekaCarddassPriceLedgerPath(): string {
  return path.join(curatedSourcesDir(), "coleka-prices.json");
}

function rubriqueIdFromUrl(url: string): string | null {
  const m = /_r(\d+)\b/i.exec(url);
  return m?.[1] ?? null;
}

function printKeyFromCollector(collector: string | null): string | null {
  if (!collector) return null;
  return mintNarutoPrintKey(collector);
}

export function colekaCarddassDealsTargets(): ColekaDealsRubriqueTarget[] {
  const targets: ColekaDealsRubriqueTarget[] = [];

  for (const series of COLEKA_CARDDASS_FR_SERIES) {
    const id = series.rubrique.replace(/^_r/i, "");
    targets.push({
      rubriqueId: id,
      label: `Carddass FR ${series.set}`,
      listedCount: series.listedCount,
      resolvePrintKey: (deal) =>
        printKeyFromCollector(
          colekaCarddassPrefixToCollector(deal.refItem ?? ""),
        ),
      resolvePrinted: (deal) =>
        colekaCarddassPrefixToCollector(deal.refItem ?? ""),
    });
  }

  const s6Id = rubriqueIdFromUrl(colekaS6It.listing.url) ?? "41388";
  targets.push({
    rubriqueId: s6Id,
    label: "Carddass S6 IT",
    listedCount: colekaS6It.listing.enumerated ?? null,
    resolvePrintKey: (deal) =>
      printKeyFromCollector(
        colekaCarddassPrefixToCollector(deal.refItem ?? ""),
      ),
    resolvePrinted: (deal) =>
      colekaCarddassPrefixToCollector(deal.refItem ?? ""),
  });

  const s24Id = rubriqueIdFromUrl(colekaS24.listing.url) ?? "15466";
  targets.push({
    rubriqueId: s24Id,
    label: "Sage's Legacy s24 FR",
    listedCount: colekaS24.listing.enumerated ?? null,
    resolvePrintKey: (deal) =>
      printKeyFromCollector(colekaEuPrefixToCollector(deal.refItem ?? "")),
    resolvePrinted: (deal) => colekaEuPrefixToCollector(deal.refItem ?? ""),
  });

  const s28Id = rubriqueIdFromUrl(colekaS28.listing.url) ?? "16649";
  targets.push({
    rubriqueId: s28Id,
    label: "Storm 3 s28 FR",
    listedCount: null,
    resolvePrintKey: (deal) =>
      printKeyFromCollector(colekaEuPrefixToCollector(deal.refItem ?? "")),
    resolvePrinted: (deal) => colekaEuPrefixToCollector(deal.refItem ?? ""),
  });

  targets.push({
    rubriqueId: "16963",
    label: "Rampage Tornado deck",
    listedCount: 33,
    resolvePrintKey: (deal) =>
      printKeyFromCollector(
        colekaRampagePrefixToCollector(deal.refItem ?? ""),
      ),
    resolvePrinted: (deal) =>
      colekaRampagePrefixToCollector(deal.refItem ?? ""),
  });

  const promoId = rubriqueIdFromUrl(colekaUsPromos.listing.url) ?? "38199";
  targets.push({
    rubriqueId: promoId,
    label: "US EN promos",
    listedCount: colekaUsPromos.listing.count ?? null,
    resolvePrintKey: (deal) =>
      printKeyFromCollector(colekaUsPromoRefToCollector(deal.refItem ?? "")),
    resolvePrinted: (deal) => colekaUsPromoRefToCollector(deal.refItem ?? ""),
  });

  // Hero's Ascension — EN-only leaf (`_r36959`), not in the display-cover paste.
  targets.push({
    rubriqueId: "36959",
    label: "Hero's Ascension s27 EN",
    listedCount: null,
    resolvePrintKey: (deal) =>
      printKeyFromCollector(colekaEuPrefixToCollector(deal.refItem ?? "")),
    resolvePrinted: (deal) => colekaEuPrefixToCollector(deal.refItem ?? ""),
  });

  return targets;
}

export async function harvestColekaCarddassPrices(
  opts: { signal?: AbortSignal } = {},
): Promise<{ ledger: ColekaPriceLedger; outPath: string }> {
  const ledger = await harvestColekaDealsForPack(
    NARUTO_PACK_ID,
    colekaCarddassDealsTargets(),
    opts,
  );
  const outPath = writeColekaPriceLedger(
    colekaCarddassPriceLedgerPath(),
    ledger,
  );
  return { ledger, outPath };
}
