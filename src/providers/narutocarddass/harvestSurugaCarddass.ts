/**
 * Crawl suruga-ya.jp for Naruto Carddass tabletop listings (巻ノ…, 忍-, 術-, 作-, 依-)
 * and update curated/sources/suruga-ya-carddass-listings.tsv.
 *
 * Works through Japanese VPN or direct connection.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { httpGet } from "@/lib/http/httpClient";
import {
  formatSurugaCarddassListingsTsv,
  mergeSurugaCarddassListings,
  parseSurugaCarddassListingsTsv,
  parseSurugaCarddassSearchHtml,
  type SurugaCarddassListing,
} from "./parse/parseSurugaCarddass";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

const sleep = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const TSV_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "curated/sources/suruga-ya-carddass-listings.tsv",
);

async function fetchSurugaHtml(url: string): Promise<string> {
  const res = await httpGet<string>(url, {
    headers: {
      "User-Agent": UA,
      "Accept-Language": "ja,en-US;q=0.9,en;q=0.8",
      Referer: "https://www.suruga-ya.jp/",
    },
    responseType: "text",
    timeout: 15_000,
    maxRedirects: 0,
    validateStatus: (s) => s >= 200 && s < 400,
  });

  if (res.status >= 300 && res.status < 400 && res.headers.location) {
    const rawLoc = res.headers.location;
    const decodedLoc = Buffer.from(rawLoc, "latin1").toString("utf8");
    const nextUrl = encodeURI(decodeURI(decodedLoc));
    const res2 = await httpGet<string>(nextUrl, {
      headers: {
        "User-Agent": UA,
        "Accept-Language": "ja,en-US;q=0.9,en;q=0.8",
        Referer: "https://www.suruga-ya.jp/",
      },
      responseType: "text",
      timeout: 15_000,
      validateStatus: (s) => s === 200,
    });
    return res2.data;
  }
  return res.data;
}

export async function harvestSurugaCarddass(options: {
  queries?: string[];
  maxPagesPerQuery?: number;
  delayMs?: number;
  tsvPath?: string;
} = {}): Promise<{
  before: number;
  after: number;
  added: number;
  tsvPath: string;
}> {
  const tsvPath = options.tsvPath ?? TSV_PATH;
  const delayMs = options.delayMs ?? 400;
  const maxPages = options.maxPagesPerQuery ?? 26;

  const queries = options.queries ?? [
    "NARUTO カードゲーム 忍-",
    "NARUTO カードゲーム 術-",
    "NARUTO カードゲーム 作-",
    "NARUTO カードゲーム 依-",
    "NARUTO カードゲーム 巻ノ",
    "NARUTO カードダス 忍-",
    "NARUTO カードダス 術-",
    "NARUTO カードダス 作-",
    "NARUTO カードダス 依-",
  ];

  const existing: SurugaCarddassListing[] = existsSync(tsvPath)
    ? parseSurugaCarddassListingsTsv(readFileSync(tsvPath, "utf8"))
    : [];
  const before = existing.length;

  const byId = new Map<string, SurugaCarddassListing>();
  for (const item of existing) {
    byId.set(item.id, item);
  }

  for (const q of queries) {
    console.log(`\n=== Harvesting Carddass query: "${q}" ===`);
    let queryAdded = 0;

    for (let page = 1; page <= maxPages; page++) {
      const encodedWord = encodeURIComponent(q);
      const url = `https://www.suruga-ya.jp/search?category=5&search_word=${encodedWord}&page=${page}`;

      try {
        console.log(`[suruga-carddass] "${q}" page ${page}...`);
        const html = await fetchSurugaHtml(url);

        if (!html || html.includes("Just a moment...")) {
          console.warn(
            `[suruga-carddass] Cloudflare challenge on page ${page}, stopping query.`,
          );
          break;
        }

        const items = parseSurugaCarddassSearchHtml(html);
        let pageAdded = 0;
        for (const item of items) {
          if (!byId.has(item.id)) {
            byId.set(item.id, item);
            pageAdded++;
            queryAdded++;
          }
        }

        console.log(
          `[suruga-carddass] Page ${page}: ${items.length} items parsed (+${pageAdded} new, total: ${byId.size})`,
        );

        if (!html.includes(`page=${page + 1}`) || items.length === 0) {
          console.log(`[suruga-carddass] No next page for "${q}".`);
          break;
        }

        await sleep(delayMs);
      } catch (err: unknown) {
        console.error(
          `[suruga-carddass] Error on page ${page}:`,
          err instanceof Error ? err.message : err,
        );
        break;
      }
    }

    console.log(
      `[suruga-carddass] Query "${q}" finished: +${queryAdded} new listings.`,
    );
  }

  const allListings = Array.from(byId.values());
  writeFileSync(tsvPath, formatSurugaCarddassListingsTsv(allListings), "utf8");

  const after = allListings.length;
  const added = after - before;

  console.log(
    `\n[suruga-carddass] Summary: before=${before}, after=${after}, added=${added}`,
  );

  return { before, after, added, tsvPath };
}

const isDirectCli =
  Boolean(process.argv[1]) &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectCli) {
  harvestSurugaCarddass().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
