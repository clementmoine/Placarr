#!/usr/bin/env tsx
import axios from "axios";

import {
  ICE_HEADERS,
  parseVideoGameSitemapUrls,
} from "@/services/providers/icollect/fetch";
import {
  countICollectBarcodeIndex,
  ensureICollectIndex,
  ingestICollectSitemapXml,
} from "@/services/providers/icollect/indexStore";

const ICE_SITEMAP_MASTER =
  "https://www.icollecteverything.com/sitemaps/sitemap-master.xml";

async function fetchSitemapUrls(): Promise<string[]> {
  const response = await axios.get<string>(ICE_SITEMAP_MASTER, {
    headers: ICE_HEADERS,
    timeout: 20_000,
    validateStatus: (status) => status >= 200 && status < 400,
  });
  return parseVideoGameSitemapUrls(response.data);
}

async function main() {
  const db = await ensureICollectIndex();
  if (!db) {
    console.error("Failed to open iCollect SQLite index.");
    process.exit(1);
  }

  const before = countICollectBarcodeIndex(db);
  const sitemapUrls = await fetchSitemapUrls();
  console.log(
    `Building iCollect videogame barcode index from ${sitemapUrls.length} sitemaps (${before} rows already cached)...`,
  );

  let ingested = 0;
  for (const [index, sitemapUrl] of sitemapUrls.entries()) {
    const started = Date.now();
    const response = await axios.get<string>(sitemapUrl, {
      headers: ICE_HEADERS,
      timeout: 120_000,
      validateStatus: (status) => status >= 200 && status < 400,
    });
    const added = await ingestICollectSitemapXml(db, response.data);
    ingested += added;
    console.log(
      `[${index + 1}/${sitemapUrls.length}] ${sitemapUrl} +${added} rows (${Date.now() - started}ms)`,
    );
  }

  const after = countICollectBarcodeIndex(db);
  console.log(
    `Done. Indexed ${after} unique barcodes (+${after - before} net new, ${ingested} upserts).`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
