#!/usr/bin/env tsx
import { ICE_HEADERS } from "@/services/providers/icollect/fetch";
import {
  countICollectItemCatalog,
  countICollectPageCatalog,
  ensureICollectIndex,
  listDistinctICollectItems,
} from "@/services/providers/icollect/indexStore";
import { runICollectPageScrapeBatch } from "@/services/providers/icollect/catalogSync";

function parseArgs(argv: string[]) {
  const args = argv.filter((arg) => arg !== "--");
  let batchSize = Number.parseInt(process.env.ICOLLECT_PAGE_SCRAPE_BATCH || "", 10);
  if (!Number.isFinite(batchSize) || batchSize < 1) batchSize = 0;

  let delayMs = Number.parseInt(process.env.ICOLLECT_PAGE_SCRAPE_DELAY_MS || "", 10);
  if (!Number.isFinite(delayMs) || delayMs < 0) delayMs = 0;

  let concurrency = Number.parseInt(
    process.env.ICOLLECT_PAGE_SCRAPE_CONCURRENCY || "",
    10,
  );
  if (!Number.isFinite(concurrency) || concurrency < 1) concurrency = 3;

  let limit = Infinity;
  let force = false;
  for (const arg of args) {
    if (arg.startsWith("--batch=")) {
      const value = Number.parseInt(arg.slice("--batch=".length), 10);
      if (Number.isFinite(value) && value >= 0) batchSize = value;
    } else if (arg.startsWith("--delay-ms=")) {
      const value = Number.parseInt(arg.slice("--delay-ms=".length), 10);
      if (Number.isFinite(value) && value >= 0) delayMs = value;
    } else if (arg.startsWith("--concurrency=")) {
      const value = Number.parseInt(arg.slice("--concurrency=".length), 10);
      if (Number.isFinite(value) && value >= 1) concurrency = value;
    } else if (arg.startsWith("--limit=")) {
      const value = Number.parseInt(arg.slice("--limit=".length), 10);
      if (Number.isFinite(value) && value > 0) limit = value;
    } else if (arg === "--force") {
      force = true;
    }
  }

  return { batchSize, delayMs, concurrency, limit, force };
}

async function main() {
  const { batchSize, delayMs, concurrency, limit, force } = parseArgs(
    process.argv.slice(2),
  );
  const db = await ensureICollectIndex();
  if (!db) {
    console.error("Failed to open iCollect SQLite index.");
    process.exit(1);
  }

  const items = listDistinctICollectItems(db);
  if (items.length === 0) {
    console.error(
      "No indexed items. Run `pnpm icollect:build-index` first to ingest sitemaps.",
    );
    process.exit(1);
  }

  const batchLabel =
    batchSize <= 0 ? "unlimited (1h budget per batch)" : String(batchSize);

  console.log(
    `Scraping iCollect pages — batch size ${batchLabel}, delay=${delayMs}ms, concurrency=${concurrency}, force=${force}...`,
  );
  console.log(
    `Catalog before: ${countICollectItemCatalog(db)} rows (${countICollectPageCatalog(db)} full pages).`,
  );
  console.log(
    "Progress logs appear per scraped page; first fetch may take a few seconds.",
  );

  let scraped = 0;
  let failed = 0;
  let batches = 0;
  const maxBatches =
    batchSize > 0 ? Math.ceil(limit / batchSize) : Number.POSITIVE_INFINITY;

  while (scraped + failed < limit && batches < maxBatches) {
    const result = await runICollectPageScrapeBatch(db, {
      batchSize,
      delayMs,
      concurrency,
      force,
    });
    scraped += result.scraped;
    failed += result.failed;
    batches += 1;
    if (result.rateLimited) {
      console.warn(
        `Rate limited — waiting ${Math.ceil(result.backoffMs / 1000)}s before continuing...`,
      );
      await new Promise((resolve) => setTimeout(resolve, result.backoffMs));
    }
    if (result.scraped === 0 && result.failed === 0 && !result.rateLimited) {
      if (result.skipped > 0) {
        console.log(
          `Nothing to scrape in this batch (${result.skipped} items already fresh).`,
        );
      }
      break;
    }
  }

  console.log(
    `Done. ${scraped} pages scraped, ${failed} failures. Catalog now: ${countICollectItemCatalog(db)} rows (${countICollectPageCatalog(db)} full pages).`,
  );
  console.log(`User-Agent cookie header: ${ICE_HEADERS.Cookie}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
