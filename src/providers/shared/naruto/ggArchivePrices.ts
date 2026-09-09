/**
 * Côtes narutocardgame.gg (staging `prices.json`) → offres marché `new` en USD.
 * L'UI / checklist ne les affichent en EUR qu'via le fallback FX existant
 * (`fxFallbackEstimatedCents`) quand aucun prix euros natif n'existe.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { pricedOffers } from "@/core/catalog/priceOffers";
import type { PriceOfferInput } from "@/core/enrich/evidence";
import { parsePrintKey } from "@/core/identify/printKey";
import { packStagingDir } from "@/lib/packPaths";
import type { BarcodePriceRefreshContext } from "@/types/providerModule";

import { GG_STAGING_FOLDER } from "./ggArchiveHarvest";
import type { GgArchiveLine } from "@/providers/narutocarddass/parse/parseNarutoCardGameGg";

export const GG_ARCHIVE_PRICE_SOURCE = "narutocardgame.gg";

export type GgPriceRow = {
  name: string;
  price: string;
  href?: string;
  number?: string;
};

export type GgPricesFile = {
  source?: string;
  line?: GgArchiveLine;
  rows?: GgPriceRow[];
};

/** `$0.70` / `€1,20` / `1.14 USD` → cents + currency. */
export function parseGgPriceAmount(
  raw: string,
): { cents: number; currency: "USD" | "EUR" } | null {
  const text = raw.replace(/\s+/g, " ").trim();
  if (!text) return null;
  const usd = /^\$\s*([\d,]+(?:\.\d{1,2})?)$/.exec(text);
  if (usd) {
    const n = Number.parseFloat(usd[1]!.replace(/,/g, ""));
    if (!Number.isFinite(n) || n <= 0) return null;
    return { cents: Math.round(n * 100), currency: "USD" };
  }
  const eur = /^€\s*([\d.]+(?:,\d{1,2})?)$|^([\d.]+(?:,\d{1,2})?)\s*€$/.exec(
    text,
  );
  if (eur) {
    const token = (eur[1] ?? eur[2] ?? "").replace(/\./g, "").replace(",", ".");
    const n = Number.parseFloat(token);
    if (!Number.isFinite(n) || n <= 0) return null;
    return { cents: Math.round(n * 100), currency: "EUR" };
  }
  const usdSuffix = /^([\d,]+(?:\.\d{1,2})?)\s*USD$/i.exec(text);
  if (usdSuffix) {
    const n = Number.parseFloat(usdSuffix[1]!.replace(/,/g, ""));
    if (!Number.isFinite(n) || n <= 0) return null;
    return { cents: Math.round(n * 100), currency: "USD" };
  }
  return null;
}

/** Classic EN CCG: `j023` → `naruto:j-0023`. */
export function classicGgNumberToPrintKey(number: string): string | null {
  const m = /^([a-z]+)(\d+)$/i.exec(number.trim());
  if (!m) return null;
  const prefix = m[1]!.toLowerCase();
  const n = Number.parseInt(m[2]!, 10);
  if (!Number.isFinite(n) || n < 1) return null;
  return `naruto:${prefix}-${String(n).padStart(4, "0")}`;
}

/** Kayou: `NRZ08-SR-003` → dotted `nrz08.sr.003` (match cards-index `card`). */
export function kayouGgNumberToCard(number: string): string | null {
  const clean = number.trim().toLowerCase().replace(/-/g, ".");
  if (!clean || !/\d/.test(clean)) return null;
  return clean;
}

/** Mythos: `KS-007` → `mythos:ks1-0007` ; `KS-117-V` → variant grouping later. */
export function mythosGgNumberToPrintKey(number: string): string | null {
  const raw = number.trim().toUpperCase();
  const base = /^KS-(\d+)$/.exec(raw);
  if (base) {
    const n = Number.parseInt(base[1]!, 10);
    if (!Number.isFinite(n) || n < 1) return null;
    return `mythos:ks1-${String(n).padStart(4, "0")}`;
  }
  const mss = /^MSS-?(\d+)$/i.exec(raw);
  if (mss) {
    const n = Number.parseInt(mss[1]!, 10);
    if (!Number.isFinite(n) || n < 1) return null;
    return `mythos:mss01-${String(n).padStart(4, "0")}`;
  }
  return null;
}

export function ggPricesStagingPath(packId: string): string {
  return path.join(packStagingDir(packId), GG_STAGING_FOLDER, "prices.json");
}

export function loadGgPricesFile(packId: string): GgPricesFile | null {
  const file = ggPricesStagingPath(packId);
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as GgPricesFile;
  } catch {
    return null;
  }
}

export type GgPriceLookup = {
  cents: number;
  currency: "USD" | "EUR";
  name: string;
  sourceUrl: string;
};

function sourceUrlForRow(row: GgPriceRow, file: GgPricesFile): string {
  if (row.href?.startsWith("http")) return row.href;
  if (row.href?.startsWith("/")) {
    return `https://narutocardgame.gg${row.href}`;
  }
  return file.source?.trim() || "https://narutocardgame.gg/";
}

/**
 * Build printKey → cote map from a staging prices file.
 * `resolvePrintKey` maps a row; return null to skip.
 */
export function indexGgPrices(
  file: GgPricesFile,
  resolvePrintKey: (row: GgPriceRow) => string | null,
): Map<string, GgPriceLookup> {
  const out = new Map<string, GgPriceLookup>();
  for (const row of file.rows ?? []) {
    const printKey = resolvePrintKey(row);
    if (!printKey) continue;
    const amount = parseGgPriceAmount(row.price);
    if (!amount) continue;
    const prev = out.get(printKey);
    if (prev && prev.cents <= amount.cents) continue;
    out.set(printKey, {
      cents: amount.cents,
      currency: amount.currency,
      name: row.name?.trim() || printKey,
      sourceUrl: sourceUrlForRow(row, file),
    });
  }
  return out;
}

function printKeyFromCtx(ctx: BarcodePriceRefreshContext): string | null {
  const direct = ctx.printKey?.trim();
  if (direct) return direct;
  return ctx.externalIds?.printKey?.trim() || null;
}

export function refreshGgArchivePriceOffers(input: {
  ctx: BarcodePriceRefreshContext;
  packId: string;
  printGame: string;
  resolvePrintKey: (row: GgPriceRow) => string | null;
}): PriceOfferInput[] {
  const { ctx, packId, printGame, resolvePrintKey } = input;
  if (ctx.shelfType !== "tcg") return [];
  const printKey = printKeyFromCtx(ctx);
  if (!printKey) return [];
  if (parsePrintKey(printKey)?.game !== printGame) return [];

  const file = loadGgPricesFile(packId);
  if (!file) return [];
  const index = indexGgPrices(file, resolvePrintKey);
  const hit = index.get(printKey);
  if (!hit) return [];

  const productName =
    ctx.primaryTitle?.trim() ||
    ctx.primaryName?.trim() ||
    hit.name ||
    "Estimation";

  return pricedOffers(GG_ARCHIVE_PRICE_SOURCE, [
    {
      // Lowest live listing — même bucket que Lorcast USD ; FX → ~EUR si besoin.
      condition: "new",
      priceCents: hit.cents,
      rawValue: hit,
      extra: {
        currency: hit.currency,
        productName,
        sourceUrl: hit.sourceUrl,
        metadataScoped: true,
      },
    },
  ]);
}
