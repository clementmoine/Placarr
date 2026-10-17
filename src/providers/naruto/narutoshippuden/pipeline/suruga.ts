/**
 * Crawl suruga-ya.jp for Naruto Shippuden cards (忍伝, 術伝, 作伝)
 * and update curated/sources/suruga-ya-shippuden-listings.tsv.
 * Requires direct connection or Japanese VPN.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { fetchTextWithFlareFallback } from "@/lib/http/scrapeFetch";
import {
  parseSurugaShippudenHtml,
  parseSurugaShippudenListingsTsv,
  serializeSurugaShippudenListingsTsv,
  type SurugaShippudenListing,
} from "../parse/suruga";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const TSV_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../curated/sources/suruga-ya-shippuden-listings.tsv",
);

const QUERIES = [
  { word: "NARUTO 忍伝-", maxPages: 13 },
  { word: "NARUTO 術伝-", maxPages: 6 },
  { word: "NARUTO 作伝-", maxPages: 3 },
  { word: "NARUTO 忍伝", maxPages: 13 },
  { word: "NARUTO 術伝", maxPages: 6 },
  { word: "NARUTO 作伝", maxPages: 3 },
  { word: "NARUTO 忍伝-学", maxPages: 2 },
  { word: "NARUTO 疾風伝 忍伝", maxPages: 10 },
  { word: "NARUTO 疾風伝 術伝", maxPages: 6 },
  { word: "NARUTO 疾風伝 作伝", maxPages: 3 },
];

const sleep = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

async function fetchSurugaHtml(url: string): Promise<string> {
  // Suruga serves Cloudflare on direct GET — same path as Data Carddass.
  if (!process.env.FLARESOLVERR_URL?.trim()) {
    throw new Error(
      "FLARESOLVERR_URL requis pour le crawl Suruga 疾風伝 (Cloudflare)",
    );
  }
  const html = await fetchTextWithFlareFallback(url, {
    headers: {
      "User-Agent": UA,
      "Accept-Language": "ja,en-US;q=0.9,en;q=0.8",
      Accept: "text/html,*/*",
      Referer: "https://www.suruga-ya.jp/",
    },
    timeout: 25_000,
    flareMaxTimeoutMs: 90_000,
    skipDirect: true,
  });
  return html ?? "";
}

export async function harvestSurugaShippuden(options: {
  delayMs?: number;
  tsvPath?: string;
  /** Cap pages per query (densif chunks / CI). */
  maxPagesPerQuery?: number;
} = {}): Promise<{
  crawledPages: number;
  totalListings: number;
  newListings: number;
  tsvPath: string;
}> {
  const tsvPath = options.tsvPath ?? TSV_PATH;
  const delayMs = options.delayMs ?? 400;
  const pageCap = options.maxPagesPerQuery;

  const existing = existsSync(tsvPath)
    ? parseSurugaShippudenListingsTsv(readFileSync(tsvPath, "utf8"))
    : [];

  const byId = new Map<string, SurugaShippudenListing>();
  for (const item of existing) {
    byId.set(item.id, item);
  }

  const initialCount = byId.size;
  let crawledPages = 0;

  for (const q of QUERIES) {
    console.log(`\n=== Harvesting Shippuden query: "${q.word}" ===`);
    let queryAdded = 0;
    const maxPages =
      pageCap != null ? Math.min(q.maxPages, pageCap) : q.maxPages;

    for (let p = 1; p <= maxPages; p++) {
      const pageParam = p === 1 ? "" : `&page=${p}`;
      const url = `https://www.suruga-ya.jp/search?category=50108&search_word=${encodeURIComponent(q.word)}${pageParam}`;

      try {
        console.log(`[suruga-shippuden] "${q.word}" page ${p}...`);
        const html = await fetchSurugaHtml(url);

        if (!html || html.includes("Just a moment...")) {
          console.warn(`[suruga-shippuden] Cloudflare challenge on page ${p}, stopping query.`);
          break;
        }

        const items = parseSurugaShippudenHtml(html);
        crawledPages++;
        let pageAdded = 0;

        for (const item of items) {
          if (!byId.has(item.id)) {
            byId.set(item.id, item);
            pageAdded++;
            queryAdded++;
          }
        }

        console.log(
          `[suruga-shippuden] Page ${p}: ${items.length} items parsed (+${pageAdded} new, total: ${byId.size})`,
        );

        if (items.length === 0 && p > 1) {
          break;
        }
      } catch (err) {
        console.warn(
          `Suruga Shippuden crawl error on page ${p}: ${err instanceof Error ? err.message : err}`,
        );
        break;
      }

      await sleep(delayMs);
    }

    console.log(`[suruga-shippuden] Query "${q.word}" finished: +${queryAdded} new.`);
  }

  const merged = serializeSurugaShippudenListingsTsv(Array.from(byId.values()));
  writeFileSync(tsvPath, merged, "utf8");

  const totalListings = byId.size;
  const newListings = totalListings - initialCount;

  return {
    crawledPages,
    totalListings,
    newListings,
    tsvPath,
  };
}

const isDirectCli =
  Boolean(process.argv[1]) &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectCli) {
  harvestSurugaShippuden().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
