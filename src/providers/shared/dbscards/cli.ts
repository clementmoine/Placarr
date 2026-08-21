#!/usr/bin/env tsx
/**
 * Sealed-product graph for the TCG Cards family
 * (dbscards, fw.dbscards, lorcards, pkmcards, opecards, …).
 *
 *   tsx src/providers/shared/dbscards/cli.ts --site pkmcards
 *   tsx src/providers/shared/dbscards/cli.ts --site opecards --offline
 *   pnpm tcgcards:products -- --site lorcards
 *
 * Pack pipelines (Masters, Fusion World, Lorcana, Pokémon extract) call the
 * same crawl. This CLI is for a host that has no pack button yet (One Piece)
 * and for a one-off reparse.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

import { scrapeTcgCardsProducts } from "./scrapeProducts";
import {
  isTcgCardsSiteId,
  tcgCardsCrawlableSites,
  tcgCardsSite,
  type TcgCardsSiteId,
} from "./sites";

function argValue(argv: readonly string[], name: string): string | undefined {
  const idx = argv.indexOf(name);
  if (idx < 0) return undefined;
  return argv[idx + 1];
}

function optionalNumber(
  argv: readonly string[],
  name: string,
): number | undefined {
  const raw = argValue(argv, name);
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

export async function runTcgCardsProductsCli(
  argv: readonly string[] = process.argv,
): Promise<void> {
  const siteArg = argValue(argv, "--site")?.toLowerCase();
  if (!siteArg || !isTcgCardsSiteId(siteArg)) {
    const known = tcgCardsCrawlableSites()
      .map((site) => site.id)
      .join(", ");
    throw new Error(`tcgcards: pass --site (${known}, or a listed family id)`);
  }
  const siteId: TcgCardsSiteId = siteArg;
  const site = tcgCardsSite(siteId);
  if (!site.packId) {
    throw new Error(`tcgcards: ${siteId} is in the family but has no pack yet`);
  }
  const result = await scrapeTcgCardsProducts(siteId, {
    force: argv.includes("--force"),
    offline: argv.includes("--offline"),
    delayMs: optionalNumber(argv, "--delay"),
    limit: optionalNumber(argv, "--limit"),
    onProgress: (message) => console.log(`   products — ${message}`),
  });
  console.log(
    `── products ${siteId} : ${result.listed} SKU, ${result.detail} fiches, ` +
      `${result.printsLinked} liens carte (${result.fetched} GET, ` +
      `${result.catalogCompleted} complétés catalogue)`,
  );
  console.log(
    JSON.stringify(
      { site: siteId, pack: site.packId, ok: true, ...result },
      null,
      2,
    ),
  );
}

const thisFile = fileURLToPath(import.meta.url);
export const TCGCARDS_PRODUCTS_CLI_PATH = thisFile;
const invoked = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invoked === thisFile) {
  runTcgCardsProductsCli(process.argv).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
