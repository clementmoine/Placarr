/**
 * Annonces eBay Ninja Ranks via Browse API — pas de scrape HTML.
 *
 * Le ledger `ebay-ninja-ranks.json` liste les item ids. Seul le sell sheet
 * dealer entre en staging ; les annonces pick-a-card servent d'attestation.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  ebayBrowseItemId,
  fetchEbayBrowseItem,
} from "@/providers/ebay/browseItem";
import { httpGet } from "@/lib/http/httpClient";
import { packStagingDir } from "@/lib/packPaths";

import { NARUTO_RANKS_PACK_ID, narutoRanksCuratedDir } from "./pack";

const LEDGER_FILE = "ebay-ninja-ranks.json";
const STAGING_FOLDER = "ebay-ninja-ranks";
const UA =
  "Mozilla/5.0 PlacarrNarutoScrape/1.0 (eBay Browse API image fetch)";

export type EbayNinjaRanksListing = {
  legacyItemId: string;
  variationId?: string;
  listing: string;
  role: string;
  state: string;
  ingest?: string;
  stagingPrefix?: string;
  note?: string;
  finding?: string;
};

export type EbayNinjaRanksLedger = {
  source: string;
  marketplaceId: string;
  listings: EbayNinjaRanksListing[];
};

export function ebayNinjaRanksLedgerPath(): string {
  return path.join(narutoRanksCuratedDir(), "sources", LEDGER_FILE);
}

export function readEbayNinjaRanksLedger(): EbayNinjaRanksLedger {
  return JSON.parse(
    readFileSync(ebayNinjaRanksLedgerPath(), "utf8"),
  ) as EbayNinjaRanksLedger;
}

export function ebayNinjaRanksStagingDir(): string {
  return path.join(packStagingDir(NARUTO_RANKS_PACK_ID), STAGING_FOLDER);
}

export type EbayNinjaRanksSyncReport = {
  fetched: number;
  images: number;
  skipped: string[];
  expired: string[];
};

export async function syncEbayNinjaRanksFromBrowseApi(
  opts: { force?: boolean } = {},
): Promise<EbayNinjaRanksSyncReport> {
  const ledger = readEbayNinjaRanksLedger();
  const staging = ebayNinjaRanksStagingDir();
  mkdirSync(staging, { recursive: true });
  const skipped: string[] = [];
  const expired: string[] = [];
  let fetched = 0;
  let images = 0;

  for (const row of ledger.listings) {
    if (row.state === "expired") {
      expired.push(row.legacyItemId);
      continue;
    }
    if (row.ingest !== "staging") {
      skipped.push(row.legacyItemId);
      continue;
    }
    const itemId = ebayBrowseItemId(
      row.legacyItemId,
      row.variationId ?? "0",
    );
    const item = await fetchEbayBrowseItem(itemId, {
      marketplaceId: ledger.marketplaceId,
    });
    if (!item) {
      expired.push(row.legacyItemId);
      continue;
    }
    fetched += 1;
    writeFileSync(
      path.join(staging, `${row.stagingPrefix ?? row.legacyItemId}.json`),
      JSON.stringify(item, null, 2),
      "utf8",
    );
    const prefix = row.stagingPrefix ?? row.legacyItemId;
    for (const [i, url] of item.imageUrls.entries()) {
      const dest = path.join(staging, `${prefix}-${i + 1}.jpg`);
      if (!opts.force && existsSync(dest)) continue;
      try {
        const res = await httpGet<ArrayBuffer>(url, {
          headers: { "User-Agent": UA, Referer: row.listing },
          responseType: "arraybuffer",
          timeout: 40_000,
          validateStatus: (status) => status === 200,
        });
        const buf = Buffer.from(res.data);
        if (buf.byteLength < 4_000) continue;
        writeFileSync(dest, buf);
        images += 1;
      } catch {
        /* octets manquants = trou honnête */
      }
    }
  }

  return { fetched, images, skipped, expired };
}
