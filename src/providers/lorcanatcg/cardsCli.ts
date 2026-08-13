#!/usr/bin/env tsx
/**
 * CLI shim — logic lives in `@/providers/lorcanatcg/scrapeCards`.
 *
 *   pnpm foil:lorcana:cards
 *   pnpm foil:lorcana:cards -- --force
 *   pnpm foil:lorcana:cards -- --cleanup-only
 */
import path from "node:path";
import fs from "node:fs";

import { dataRoot } from "@/lib/runtimeData";
import {
  cleanupLegacyPrintRootAssets,
  scrapeLorcanaCards,
  stripLegacyFlatIndexKeys,
} from "@/providers/lorcanatcg/scrapeCards";

async function cleanupOnly(): Promise<void> {
  const root = path.resolve(dataRoot(), "..");
  const cardsDir = path.join(root, "data/lorcana/cards");
  const indexPaths = [path.join(root, "data/lorcana/cards-index.json")];
  const legacy = cleanupLegacyPrintRootAssets(cardsDir);
  let stripped = 0;
  for (const indexPath of indexPaths) {
    if (!fs.existsSync(indexPath)) continue;
    const payload = JSON.parse(fs.readFileSync(indexPath, "utf8")) as {
      cards?: Record<string, Record<string, unknown>>;
    };
    if (!payload.cards) continue;
    stripped += stripLegacyFlatIndexKeys(payload.cards);
    fs.writeFileSync(indexPath, `${JSON.stringify(payload, null, 2)}\n`);
  }
  console.log(
    JSON.stringify(
      {
        cleanupOnly: true,
        legacyRootRemoved: legacy.removed,
        legacyRootBytes: legacy.bytes,
        flatIndexKeysStripped: stripped,
      },
      null,
      2,
    ),
  );
}

if (process.argv.includes("--cleanup-only")) {
  cleanupOnly().catch((error) => {
    console.error(error);
    process.exit(1);
  });
} else {
  scrapeLorcanaCards({ force: process.argv.includes("--force") }).catch(
    (error) => {
      console.error(error);
      process.exit(1);
    },
  );
}
