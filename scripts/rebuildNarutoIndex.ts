/**
 * Rebuild data/naruto/carddass/catalog.sqlite from disk (set-scoped keys).
 *
 *   pnpm tsx scripts/rebuildNarutoIndex.ts
 */
import "dotenv/config";

import { scrapeNarutoCards } from "@/providers/naruto/narutocarddass/scrape/scrapeCards";

async function main() {
  await scrapeNarutoCards({ indexOnly: true });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
