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
  if (!argv.includes("--offline") && !argv.includes("--skip-suruga-prices")) {
    try {
      const { harvestSurugaShippudenPrices } = await import(
        /* webpackIgnore: true */
        "./harvest/surugaPrices"
      );
      const surugaPrices = await harvestSurugaShippudenPrices();
      console.log(
        `── Suruga yen prices — ${surugaPrices.ledger.cardCount} diskId (${surugaPrices.fetched} fiches)`,
      );
    } catch (err) {
      console.warn(
        `── Suruga yen prices — ${err instanceof Error ? err.message : err}`,
      );
    }
  }
  if (!argv.includes("--skip-documents")) {
    try {
      const { loadShippudenCuratedDocuments } = await import(
        "@/providers/naruto/narutoshippuden/curated/documents"
      );
      const { harvestPackDocuments } = await import(
        "@/providers/shared/documents/harvestPackDocuments"
      );
      const docs = await harvestPackDocuments({
        packId: "naruto/shippuden",
        curated: loadShippudenCuratedDocuments(),
        force: argv.includes("--force"),
      });
      console.log(
        `── documents : ${docs.fetched} fetched, ${docs.skipped} skipped, ` +
          `${docs.urlOnly} url-only, ${docs.failed} failed / ${docs.total}`,
      );
    } catch (err) {
      console.warn(
        `── documents — ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  if (!argv.includes("--offline") && !argv.includes("--skip-narutocardjp")) {
    try {
      const {
        harvestNarutocardjpFaces,
        installNarutocardjpFaces,
      } = await import("@/providers/naruto/shared/narutocardjp/harvest");
      const { diskIdFromPrintedReference } = await import("./search");
      const { shippudenPrintKey } = await import("./pipeline/ledgers");
      const { openNarutoShippudenDbForWrite } = await import("./indexStore");
      const harvested = await harvestNarutocardjpFaces({
        packId: "naruto/shippuden",
        line: "shippuden",
      });
      console.log(
        `── naruto-card.jp 疾風伝 — ${harvested.hits} faces → ${harvested.path}`,
      );
      const installed = await installNarutocardjpFaces({
        packId: "naruto/shippuden",
        line: "shippuden",
        force: argv.includes("--force"),
        resolveDest: (hit) => {
          const diskId = diskIdFromPrintedReference(hit.printedRef);
          if (!diskId) return null;
          const printKey = shippudenPrintKey(diskId);
          if (!printKey) return null;
          const m = diskId.match(/^([a-z]+)(\d+)$/i);
          if (!m) return null;
          const family = m[1]!.toLowerCase();
          return {
            set: family,
            lang: "ja",
            card: diskId,
            printKey,
          };
        },
        writeAsset: (row) => {
          try {
            const db = openNarutoShippudenDbForWrite();
            db.prepare(
              `INSERT INTO print_assets (print_key, lang, art, source_url)
               VALUES (?, ?, ?, ?)
               ON CONFLICT(print_key, lang) DO UPDATE SET
                 art = excluded.art,
                 source_url = COALESCE(excluded.source_url, print_assets.source_url)`,
            ).run(row.printKey, row.lang, row.art, row.sourceUrl);
          } catch {
            /* index may be closed / missing mid-sync */
          }
        },
      });
      console.log(
        `── naruto-card.jp install — ${installed.written} écrites, ${installed.skipped} skip, ${installed.failed} fail`,
      );
    } catch (err) {
      console.warn(
        `── naruto-card.jp — ${err instanceof Error ? err.message : err}`,
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

