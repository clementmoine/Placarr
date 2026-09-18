/**
 * Harvest Naruto Data Carddass listings from suruga-ya.jp.
 * Works when VPN is Japanese.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { httpGet } from "@/lib/http/httpClient";
import {
  mergeSurugaHtmlIntoListingsTsv,
} from "./mergeSurugaPaste";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
    const fixedLoc = encodeURI(res.headers.location);
    const res2 = await httpGet<string>(fixedLoc, {
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

export async function harvestSurugaDcd(
  queries: string[] = [
    "NARUTO フォーメーション",
    "NARUTO ナルティメットクロス",
    "NARUTO DT-",
    "NARUTO 疾風伝 カードダス",
    "NARUTO ナルティメット",
  ],
  maxPagesPerQuery = 26,
): Promise<void> {
  let grandTotalAdded = 0;

  for (const q of queries) {
    const encoded = encodeURIComponent(q);
    console.log(`\n=== Harvesting query: "${q}" ===`);
    let queryAdded = 0;

    for (let page = 1; page <= maxPagesPerQuery; page++) {
      const url = `https://www.suruga-ya.jp/search?category=501080113&search_word=${encoded}&page=${page}`;
      try {
        console.log(`[suruga-dcd] Fetching "${q}" page ${page}...`);
        const html = await fetchSurugaHtml(url);

        if (!html || html.includes("Just a moment...")) {
          console.warn(`[suruga-dcd] Cloudflare challenge on page ${page}, stopping.`);
          break;
        }

        const resMerge = mergeSurugaHtmlIntoListingsTsv(html);
        queryAdded += resMerge.added;
        grandTotalAdded += resMerge.added;
        console.log(
          `[suruga-dcd] Page ${page}: total listings now ${resMerge.after} (+${resMerge.added} new)`,
        );

        if (!html.includes(`page=${page + 1}`)) {
          console.log(`[suruga-dcd] No next page link found for "${q}".`);
          break;
        }

        await sleep(500);
      } catch (err: any) {
        console.error(`[suruga-dcd] Error on page ${page}:`, err?.message ?? err);
        break;
      }
    }
    console.log(`[suruga-dcd] Query "${q}" finished: added ${queryAdded} new listings.`);
  }

  console.log(`\n[suruga-dcd] Grand total new listings added: ${grandTotalAdded}`);
}

const isDirectCli =
  Boolean(process.argv[1]) &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectCli) {
  harvestSurugaDcd();
}
