/**
 * Naruto 疾風伝 pack extract — Catalogue Sync / worker (in-process).
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

import { refreshNarutoShippudenCatalog } from "./catalog";

export async function runNarutoShippudenPackPipeline(
  argv: readonly string[] = [],
): Promise<void> {
  const crawlSuruga = argv.includes("--crawl-suruga");
  if (crawlSuruga) {
    try {
      const { harvestSurugaShippuden } = await import("./pipeline/suruga");
      const res = await harvestSurugaShippuden();
      console.log(
        `── Suruga Shippuden crawl : ${res.crawledPages} pages, ${res.totalListings} listings (+${res.newListings} nouveaux) → ${res.tsvPath}`,
      );
    } catch (err) {
      console.warn(
        `── Suruga Shippuden crawl — échec : ${err instanceof Error ? err.message : err}`,
      );
    }
  }
  const summary = await refreshNarutoShippudenCatalog();
  console.log(`── Naruto Shippuden — catalogue rafraîchi`, summary);
}

const isDirectCli =
  Boolean(process.argv[1]) &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectCli) {
  runNarutoShippudenPackPipeline(process.argv.slice(2)).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

