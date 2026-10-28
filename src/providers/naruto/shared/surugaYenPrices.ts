/**
 * Suruga-ya used yen → synced ledger under `data/<pack>/` (diskId-anchored)
 * + JPY price offers.
 *
 * Shared by Naruto Carddass / Data Carddass / 疾風伝. Each line supplies its
 * listings, printed→diskId mapper, packId, and ledger path.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { pricedOffers } from "@/core/catalog/priceOffers";
import type { PriceOfferInput } from "@/core/enrich/evidence";
import { packSurugaPricesPath } from "@/lib/packPaths";
import { fetchTextWithFlareFallback } from "@/lib/http/scrapeFetch";
import type { BarcodePriceRefreshContext } from "@/types/providerModule";

export const SURUGA_YEN_PRICE_SOURCE = "Suruga-ya";

/** Auto / sources scrape — polite slice of product pages. */
export const SURUGA_PRICE_ENRICH_LIMIT = 80;

export const SURUGA_YA_JP_ORIGIN = "https://www.suruga-ya.jp";

export function surugaYaProductUrl(productId: string): string {
  return `${SURUGA_YA_JP_ORIGIN}/product/detail/${productId.toUpperCase()}`;
}

export type SurugaYenListing = {
  id: string;
  printed: string;
};

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

export type SurugaDetailParsed = {
  printed?: string;
  priceYen: number | null;
};

function decodeSurugaHtmlEntities(raw: string): string {
  return raw
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"');
}

/**
 * Yen amount from Suruga copy. Prefer 税込 when both bare and tax-in are shown
 * (`40円(税込44円)` → 44).
 */
export function parseSurugaYenAmount(raw: string): number | null {
  const text = decodeSurugaHtmlEntities(raw).replace(/\s+/g, " ");
  const taxIn = /税込\s*([0-9,]+)\s*円/.exec(text);
  if (taxIn) {
    const n = Number(taxIn[1]!.replace(/,/g, ""));
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  const plain = /([0-9,]+)\s*円/.exec(text);
  if (!plain) return null;
  const n = Number(plain[1]!.replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Used (中古) ask on a product page — marketplace, not kaitori buyback. */
export function parseSurugaUsedPriceYen(html: string): number | null {
  const usedBlock =
    /data-label="[^"]*中古[^"]*"[\s\S]{0,500}?class="[^"]*price-buy[^"]*"[^>]*>([^<]+)/i.exec(
      html,
    ) ??
    /中古[\s\S]{0,200}?([0-9,]+)\s*円(?:\s*\(?\s*税込)?/i.exec(html);
  if (usedBlock) {
    const yen = parseSurugaYenAmount(usedBlock[0]!);
    if (yen != null) return yen;
  }
  const buy =
    /class="[^"]*price-buy[^"]*"[^>]*>([^<]+)/i.exec(html) ??
    /<span class="price">([^<]+)<\/span>/i.exec(html);
  return buy ? parseSurugaYenAmount(buy[1] ?? buy[0]!) : null;
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
  filePath: string,
): SurugaPriceLedger | null {
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, "utf8")) as SurugaPriceLedger;
  } catch {
    return null;
  }
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

const sleep = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

export type HarvestSurugaYenPricesOpts = {
  packId: string;
  ledgerPath: string;
  listings: readonly SurugaYenListing[];
  printedToDiskId: (printed: string) => string | null;
  productUrl?: (productId: string) => string;
  /**
   * Optional line-specific detail parse (e.g. Carddass printed gate).
   * Default: yen only from HTML; printed comes from the listing TSV.
   */
  parseDetail?: (html: string, productId: string) => SurugaDetailParsed | null;
  limit?: number;
  delayMs?: number;
  force?: boolean;
  detailHtmlById?: ReadonlyMap<string, string>;
};

/**
 * Budgeted product-detail enrich. Keeps prior ledger rows; fills missing
 * diskIds from curated listings (+ live detail when not mocked).
 */
export async function harvestSurugaYenPrices(
  opts: HarvestSurugaYenPricesOpts,
): Promise<{ ledger: SurugaPriceLedger; outPath: string; fetched: number }> {
  const limit = opts.limit ?? SURUGA_PRICE_ENRICH_LIMIT;
  const delayMs = opts.delayMs ?? 400;
  const productUrl = opts.productUrl ?? surugaYaProductUrl;
  const observedAt = new Date().toISOString();
  const outPath = opts.ledgerPath;
  const prior = readSurugaPriceLedger(outPath);
  const byDisk = surugaYenByDiskId(prior);
  let fetched = 0;

  for (const listing of opts.listings) {
    if (fetched >= limit) break;
    const diskId = opts.printedToDiskId(listing.printed);
    if (!diskId) continue;
    if (!opts.force && byDisk.has(diskId)) continue;

    let detail: SurugaDetailParsed | null = null;
    const injected = opts.detailHtmlById?.get(listing.id.toUpperCase());
    if (injected != null) {
      detail = opts.parseDetail
        ? opts.parseDetail(injected, listing.id)
        : { priceYen: parseSurugaUsedPriceYen(injected) };
    } else {
      if (delayMs > 0 && fetched > 0) await sleep(delayMs);
      try {
        const html = await fetchTextWithFlareFallback(productUrl(listing.id), {
          timeout: 45_000,
        });
        if (!html) {
          fetched += 1;
          continue;
        }
        detail = opts.parseDetail
          ? opts.parseDetail(html, listing.id)
          : { priceYen: parseSurugaUsedPriceYen(html) };
        fetched += 1;
      } catch {
        fetched += 1;
        continue;
      }
    }

    if (!detail) continue;
    const yen = detail.priceYen;
    if (yen == null || !Number.isFinite(yen) || yen <= 0) continue;
    const printed = detail.printed?.trim() || listing.printed;
    const resolvedDisk = opts.printedToDiskId(printed) ?? diskId;
    byDisk.set(resolvedDisk, {
      diskId: resolvedDisk,
      printed,
      productId: listing.id.toUpperCase(),
      priceYen: Math.round(yen),
      priceYenCents: Math.round(yen),
      productUrl: productUrl(listing.id),
      observedAt,
    });
  }

  const cards = [...byDisk.values()].sort((a, b) =>
    a.diskId.localeCompare(b.diskId),
  );
  const ledger: SurugaPriceLedger = {
    source: "Suruga-ya.jp used product detail (税込)",
    sourceId: "suruga-ya-used",
    packId: opts.packId,
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

export type RefreshSurugaYenOffersOpts = {
  ledgerPath: string;
  diskIdFromPrintKey: (printKey: string) => string | null;
};

/** JA used market ask — JPY; FX fills EUR `~` when dig/Coleka empty. */
export async function refreshSurugaYenPriceOffersFromLedger(
  ctx: BarcodePriceRefreshContext,
  opts: RefreshSurugaYenOffersOpts,
): Promise<PriceOfferInput[]> {
  if (ctx.shelfType !== "tcg") return [];
  const printKey = printKeyFromCtx(ctx);
  if (!printKey) return [];
  const diskId = opts.diskIdFromPrintKey(printKey);
  if (!diskId) return [];
  const row = surugaYenByDiskId(readSurugaPriceLedger(opts.ledgerPath)).get(
    diskId,
  );
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

/** Curated sources dir under a Naruto provider folder (attested maps only). */
export function narutoProviderCuratedSourcesDir(providerFolder: string): string {
  return path.join(
    process.cwd(),
    "src/providers/naruto",
    providerFolder,
    "curated/sources",
  );
}

/** Provider module folder → catalogue / data pack id. */
const SURUGA_PROVIDER_DATA_PACK: Readonly<Record<string, string>> = {
  narutocarddass: "naruto/carddass",
  narutodatacarddass: "naruto/data-carddass",
  narutoshippuden: "naruto/shippuden",
};

/** Synced yen quotes — `data/<pack>/suruga-prices.json`. */
export function surugaPriceLedgerPathForProvider(
  providerFolder: string,
): string {
  const pack = SURUGA_PROVIDER_DATA_PACK[providerFolder];
  if (!pack) {
    throw new Error(`No Suruga data pack for provider folder ${providerFolder}`);
  }
  return packSurugaPricesPath(pack);
}
