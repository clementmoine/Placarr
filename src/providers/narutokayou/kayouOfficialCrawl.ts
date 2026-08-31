/**
 * Crawl kayouofficial.com Naruto IP → series (SKU) → card gallery.
 *
 * Writes `curated/sources/kayou-official-catalog.json` on every Catalogue Sync
 * so new series / cards / SKU rows surface without hand-editing ledgers.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { httpGet } from "@/lib/http/httpClient";

import { narutoKayouCuratedDir } from "./pack";
import {
  KAYOU_NARUTO_IP_ID,
  KAYOU_OFFICIAL_IP_COLLECTIONS,
  KAYOU_OFFICIAL_SERIES_URL,
  parseKayouOfficialIpSeriesIndex,
  parseKayouOfficialSeriesDetail,
  parseKayouOfficialSeriesIds,
  type KayouOfficialSeriesDetail,
} from "./kayouOfficialParse";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

export const KAYOU_OFFICIAL_CATALOG_FILE = "kayou-official-catalog.json";

export type KayouOfficialCatalogSeries = KayouOfficialSeriesDetail & {
  sectionEyebrow: string;
  sectionTitle: string;
  url: string;
};

export type KayouOfficialCatalog = {
  source: string;
  ipId: string;
  observed: string;
  crawledAt: string;
  contentHash: string;
  previousHash: string | null;
  changed: boolean;
  series: KayouOfficialCatalogSeries[];
};

export type KayouOfficialCrawlReport = {
  series: number;
  cards: number;
  changed: boolean;
  contentHash: string;
  path: string;
};

export function kayouOfficialCatalogPath(): string {
  return path.join(narutoKayouCuratedDir(), "sources", KAYOU_OFFICIAL_CATALOG_FILE);
}

export function readKayouOfficialCatalog(): KayouOfficialCatalog | null {
  const manifestPath = kayouOfficialCatalogPath();
  if (!existsSync(manifestPath)) return null;
  try {
    return JSON.parse(readFileSync(manifestPath, "utf8")) as KayouOfficialCatalog;
  } catch {
    return null;
  }
}

/** Stable hash over series ids + card idCodes (detects additions / removals). */
export function hashKayouOfficialCatalog(
  series: readonly Pick<KayouOfficialCatalogSeries, "seriesId" | "cards">[],
): string {
  const lines: string[] = [];
  for (const row of [...series].sort((a, b) =>
    a.seriesId.localeCompare(b.seriesId),
  )) {
    lines.push(row.seriesId);
    for (const card of row.cards) {
      lines.push(`${card.idCode}|${card.rarity}|${card.backImage}|${card.frontImage}`);
    }
  }
  return createHash("sha256").update(lines.join("\n")).digest("hex").slice(0, 16);
}

async function fetchText(url: string): Promise<string> {
  const res = await httpGet<string>(url, {
    headers: { "User-Agent": UA },
    responseType: "text",
    timeout: 45_000,
    validateStatus: (status) => status === 200,
  });
  return res.data;
}

export async function crawlKayouOfficialNaruto(opts: {
  ipId?: string;
  onProgress?: (message: string) => void;
  delayMs?: number;
} = {}): Promise<KayouOfficialCatalog> {
  const report = opts.onProgress ?? ((m: string) => console.log(`   kayou crawl — ${m}`));
  const ipId = opts.ipId ?? KAYOU_NARUTO_IP_ID;
  const delayMs = opts.delayMs ?? 0;
  const sleep = (ms: number) =>
    new Promise<void>((resolve) => {
      setTimeout(resolve, ms);
    });

  report(`index IP ${ipId}…`);
  const ipHtml = await fetchText(KAYOU_OFFICIAL_IP_COLLECTIONS);
  const index = parseKayouOfficialIpSeriesIndex(ipHtml, ipId);
  const indexBySeries = new Map(index.map((row) => [row.seriesId, row]));

  const seriesOut: KayouOfficialCatalogSeries[] = [];
  const seenSeries = new Set<string>();
  for (const entry of index) {
    if (seenSeries.has(entry.seriesId)) continue;
    seenSeries.add(entry.seriesId);
    if (delayMs > 0) await sleep(delayMs);
    report(`${entry.sectionTitle || entry.seriesId} (${entry.seriesId})…`);
    const html = await fetchText(KAYOU_OFFICIAL_SERIES_URL(entry.seriesId));
    const detail = parseKayouOfficialSeriesDetail(html, entry.seriesId);
    seriesOut.push({
      ...detail,
      sectionEyebrow: entry.sectionEyebrow,
      sectionTitle: entry.sectionTitle,
      url: KAYOU_OFFICIAL_SERIES_URL(entry.seriesId),
    });
  }

  // Series linked on IP page but missing from section walk (defensive).
  for (const seriesId of parseKayouOfficialSeriesIds(ipHtml, ipId)) {
    if (seenSeries.has(seriesId)) continue;
    seenSeries.add(seriesId);
    const meta = indexBySeries.get(seriesId);
    report(`série orpheline ${seriesId}…`);
    const html = await fetchText(KAYOU_OFFICIAL_SERIES_URL(seriesId));
    const detail = parseKayouOfficialSeriesDetail(html, seriesId);
    seriesOut.push({
      ...detail,
      sectionEyebrow: meta?.sectionEyebrow ?? "",
      sectionTitle: meta?.sectionTitle ?? "",
      url: KAYOU_OFFICIAL_SERIES_URL(seriesId),
    });
  }

  const contentHash = hashKayouOfficialCatalog(seriesOut);
  const previous = readKayouOfficialCatalog();
  const previousHash = previous?.contentHash ?? null;
  const now = new Date();

  return {
    source: "kayouofficial.com — Naruto IP catalogue crawl",
    ipId,
    observed: now.toISOString().slice(0, 10),
    crawledAt: now.toISOString(),
    contentHash,
    previousHash,
    changed: contentHash !== previousHash,
    series: seriesOut.sort((a, b) => a.seriesId.localeCompare(b.seriesId)),
  };
}

export async function writeKayouOfficialCatalog(
  catalog: KayouOfficialCatalog,
): Promise<KayouOfficialCrawlReport> {
  const manifestPath = kayouOfficialCatalogPath();
  mkdirSync(path.dirname(manifestPath), { recursive: true });
  writeFileSync(manifestPath, `${JSON.stringify(catalog, null, 2)}\n`);

  const cards = catalog.series.reduce((n, row) => n + row.cards.length, 0);
  return {
    series: catalog.series.length,
    cards,
    changed: catalog.changed,
    contentHash: catalog.contentHash,
    path: manifestPath,
  };
}

/** IP index → each SKU page → manifest JSON (Catalogue Sync hook). */
export async function runKayouOfficialCatalogCrawl(
  opts: {
    onProgress?: (message: string) => void;
    delayMs?: number;
  } = {},
): Promise<KayouOfficialCrawlReport> {
  const catalog = await crawlKayouOfficialNaruto(opts);
  return writeKayouOfficialCatalog(catalog);
}
