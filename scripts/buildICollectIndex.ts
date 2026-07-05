#!/usr/bin/env tsx
import {
  ensureICollectIndex,
  countICollectBarcodeIndex,
  countICollectItemCatalog,
} from "@/services/providers/icollect/indexStore";
import { runICollectFullSitemapSync } from "@/services/providers/icollect/catalogSync";

async function main() {
  const db = await ensureICollectIndex();
  if (!db) {
    console.error("Failed to open iCollect SQLite index.");
    process.exit(1);
  }

  const beforeBarcodes = countICollectBarcodeIndex(db);
  const beforeCatalog = countICollectItemCatalog(db);
  console.log(
    `Building iCollect catalog (${beforeBarcodes} barcodes, ${beforeCatalog} catalog rows)...`,
  );

  const result = await runICollectFullSitemapSync(db, {
    onProgress: ({ index, total, url, stats }) => {
      console.log(
        `[${index}/${total}] ${url} +${stats.barcodeUpserts} barcodes, +${stats.catalogUpserts} catalog rows`,
      );
    },
  });

  const afterBarcodes = countICollectBarcodeIndex(db);
  const afterCatalog = countICollectItemCatalog(db);
  console.log(
    `Done. ${result.sitemaps} sitemaps, ${afterBarcodes} barcodes (+${afterBarcodes - beforeBarcodes}), ${afterCatalog} catalog rows (+${afterCatalog - beforeCatalog}).`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
