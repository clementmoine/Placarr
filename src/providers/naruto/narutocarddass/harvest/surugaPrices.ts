/**
 * Suruga-ya used yen → curated ledger (diskId-anchored).
 *
 * Faces already come from the CDN / TSV. Prices live on product HTML (often
 * Cloudflare) — budgeted detail fetch fills `suruga-prices.json` so Sync can
 * enrich JA market asks without inventing EUR.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { fetchTextWithFlareFallback } from "@/lib/http/scrapeFetch";
import { parsePrintKey } from "@/core/identify/printKey";
import { pricedOffers } from "@/core/catalog/priceOffers";
import type { PriceOfferInput } from "@/core/enrich/evidence";
import type { BarcodePriceRefreshContext } from "@/types/providerModule";

import {
  loadSurugaCarddassCuratedListings,
  parseSurugaProductDetailHtml,
  surugaCarddassProductUrl,
  surugaPrintedToDiskId,
  type SurugaCarddassListing,
} from "../parse/marketplace";

export const SURUGA_YEN_PRICE_SOURCE = "Suruga-ya";

/** Auto / sources scrape — polite slice of product pages. */
export const SURUGA_PRICE_ENRICH_LIMIT = 80;

export type SurugaPriceRow = {
  diskId: string;
  printed: string;
  productId: string;
  priceYen: number;
  /** Yen as integer yen (not cents). */
  priceYenCents: number;
  productUrl: string;
  observedAt: string;
};

export type SurugaPriceLedger = {
  source: string;
  sourceId: "suruga-ya-used";
  packId: string;
  fetchedAt: string;
  cardCount: number;
  cards: SurugaPriceRow[];
};

function curatedSourcesDir(): string {
  return path.join(
    process.cwd(),
    "src/providers/naruto/narutocarddass/curated/sources",
  );
}

export function surugaPriceLedgerPath(): string {
  return path.join(curatedSourcesDir(), "suruga-prices.json");
}

export function writeSurugaPriceLedger(
  outPath: string,
  ledger: SurugaPriceLedger,
): string {
  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(ledger, null, 2)}\n`, "utf8");
  return outPath;
}

export function readSurugaPriceLedger(
  filePath: string = surugaPriceLedgerPath(),
): SurugaPriceLedger | null {
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, "utf8")) as SurugaPriceLedger;
  } catch {
    return null;
  }
}

/** `naruto:s1-ni0001` → `ni0001` (Suruga ledger key). */
export function surugaDiskIdFromPrintKey(
  printKey: string | null | undefined,
): string | null {
  const parsed = parsePrintKey(printKey);
  if (!parsed || parsed.game !== "naruto") return null;
  const number = parsed.number.trim().toLowerCase();
  return number || null;
}

export function surugaYenByDiskId(
  ledger: SurugaPriceLedger | null,
): Map<string, SurugaPriceRow> {
  const out = new Map<string, SurugaPriceRow>();
  if (!ledger) return out;
  for (const row of ledger.cards) {
    const id = row.diskId.trim().toLowerCase();
    if (!id || out.has(id)) continue;
    out.set(id, row);
  }
  return out;
}

function listingToRow(
  listing: SurugaCarddassListing,
  observedAt: string,
): SurugaPriceRow | null {
  const yen = listing.priceYen;
  if (yen == null || !Number.isFinite(yen) || yen <= 0) return null;
  const diskId = surugaPrintedToDiskId(listing.printed);
  if (!diskId) return null;
  return {
    diskId,
    printed: listing.printed,
    productId: listing.id.toUpperCase(),
    priceYen: Math.round(yen),
    priceYenCents: Math.round(yen),
    productUrl: surugaCarddassProductUrl(listing.id),
    observedAt,
  };
}

const sleep = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

export type HarvestSurugaPricesOpts = {
  limit?: number;
  delayMs?: number;
  force?: boolean;
  /** Inject HTML for tests — productId → html. */
  detailHtmlById?: ReadonlyMap<string, string>;
  /** Override curated TSV (tests). */
  listings?: readonly SurugaCarddassListing[];
  /** Override ledger path (tests). */
  ledgerPath?: string;
};

/**
 * Budgeted product-detail enrich. Keeps prior ledger rows; fills missing
 * diskIds from curated TSV (+ live detail when not mocked).
 */
export async function harvestSurugaCarddassPrices(
  opts: HarvestSurugaPricesOpts = {},
): Promise<{ ledger: SurugaPriceLedger; outPath: string; fetched: number }> {
  const limit = opts.limit ?? SURUGA_PRICE_ENRICH_LIMIT;
  const delayMs = opts.delayMs ?? 400;
  const observedAt = new Date().toISOString();
  const outPath = opts.ledgerPath ?? surugaPriceLedgerPath();
  const prior = readSurugaPriceLedger(outPath);
  const byDisk = surugaYenByDiskId(prior);
  const listings = opts.listings ?? loadSurugaCarddassCuratedListings();
  let fetched = 0;

  for (const listing of listings) {
    if (fetched >= limit) break;
    const diskId = surugaPrintedToDiskId(listing.printed);
    if (!diskId) continue;
    if (!opts.force && byDisk.has(diskId)) continue;

    let detail: SurugaCarddassListing | null = null;
    const injected = opts.detailHtmlById?.get(listing.id.toUpperCase());
    if (injected != null) {
      detail = parseSurugaProductDetailHtml(injected, listing.id);
    } else {
      if (delayMs > 0 && fetched > 0) await sleep(delayMs);
      try {
        const html = await fetchTextWithFlareFallback(
          surugaCarddassProductUrl(listing.id),
          { timeout: 45_000 },
        );
        if (!html) {
          fetched += 1;
          continue;
        }
        detail = parseSurugaProductDetailHtml(html, listing.id);
        fetched += 1;
      } catch {
        fetched += 1;
        continue;
      }
    }

    const row = detail ? listingToRow(detail, observedAt) : null;
    if (row) byDisk.set(row.diskId, row);
  }

  const cards = [...byDisk.values()].sort((a, b) =>
    a.diskId.localeCompare(b.diskId),
  );
  const ledger: SurugaPriceLedger = {
    source: "Suruga-ya.jp used product detail (税込)",
    sourceId: "suruga-ya-used",
    packId: "naruto/carddass",
    fetchedAt: observedAt,
    cardCount: cards.length,
    cards,
  };
  writeSurugaPriceLedger(outPath, ledger);
  return { ledger, outPath, fetched };
}

function printKeyFromCtx(ctx: BarcodePriceRefreshContext): string | null {
  const direct = ctx.printKey?.trim();
  if (direct) return direct;
  return ctx.externalIds?.printKey?.trim() || null;
}

/** JA used market ask — JPY; FX fills EUR `~` when dig/Coleka empty. */
export async function refreshSurugaYenPriceOffers(
  ctx: BarcodePriceRefreshContext,
  opts: { ledgerPath?: string } = {},
): Promise<PriceOfferInput[]> {
  if (ctx.shelfType !== "tcg") return [];
  const printKey = printKeyFromCtx(ctx);
  if (!printKey) return [];
  const diskId = surugaDiskIdFromPrintKey(printKey);
  if (!diskId) return [];
  const row = surugaYenByDiskId(
    readSurugaPriceLedger(opts.ledgerPath ?? surugaPriceLedgerPath()),
  ).get(diskId);
  if (!row) return [];

  const productName =
    ctx.primaryTitle?.trim() ||
    ctx.primaryName?.trim() ||
    ctx.titles?.[0]?.trim() ||
    row.printed;

  return pricedOffers(SURUGA_YEN_PRICE_SOURCE, [
    {
      condition: "used",
      priceCents: row.priceYenCents,
      rawValue: row,
      extra: {
        currency: "JPY",
        productName,
        sourceUrl: row.productUrl,
        metadataScoped: true,
        merchantName: "Suruga-ya",
      },
    },
  ]);
}
