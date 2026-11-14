/**
 * Install naruto-card.jp faces from staging blobs (after browser prefetch).
 *
 *   pnpm exec tsx scripts/installNarutocardjpFaces.ts carddass-ja
 *   pnpm exec tsx scripts/installNarutocardjpFaces.ts shippuden
 *   pnpm exec tsx scripts/installNarutocardjpFaces.ts data-carddass
 *   pnpm exec tsx scripts/installNarutocardjpFaces.ts all
 */
import "dotenv/config";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { packCardsDir, packCatalogDb } from "@/lib/packPaths";
import {
  installNarutocardjpFaces,
  type NarutocardjpLine,
} from "@/providers/naruto/shared/narutocardjp/harvest";

async function installLine(line: NarutocardjpLine) {
  if (line === "carddass-ja") {
    const { narutoDiskCardId, mintNarutoPrintKey, NARUTO_PACK_ID } =
      await import("@/providers/naruto/narutocarddass/identity");
    const catalogPath = packCatalogDb(NARUTO_PACK_ID);
    const catalog = existsSync(catalogPath)
      ? new DatabaseSync(catalogPath, { readOnly: true })
      : null;
    const lookup = catalog?.prepare(
      "SELECT print_key, set_code FROM prints WHERE number = ? ORDER BY set_code LIMIT 8",
    );
    const result = await installNarutocardjpFaces({
      packId: NARUTO_PACK_ID,
      line,
      prefetchBrowser: false,
      resolveDest: (hit) => {
        if (!hit.family || !hit.number) return null;
        const diskId = narutoDiskCardId(`${hit.family}${hit.number}`);
        if (!diskId) return null;
        const rows = (lookup?.all(diskId) ?? []) as Array<{
          print_key: string;
          set_code: string;
        }>;
        const preferred =
          rows.find((row) => /^s\d+$/i.test(row.set_code)) ?? rows[0];
        if (preferred) {
          return {
            set: preferred.set_code,
            lang: "ja",
            card: diskId,
            printKey: preferred.print_key,
          };
        }
        const jaRoot = path.join(packCardsDir(NARUTO_PACK_ID), "ja");
        if (!existsSync(jaRoot)) return null;
        for (const set of readdirSync(jaRoot)) {
          const cardDir = path.join(jaRoot, set, diskId);
          if (!existsSync(cardDir)) continue;
          const printKey = mintNarutoPrintKey(diskId, set);
          if (!printKey) continue;
          return { set, lang: "ja", card: diskId, printKey };
        }
        return null;
      },
    });
    catalog?.close();
    return result;
  }

  if (line === "shippuden") {
    const { diskIdFromPrintedReference } = await import(
      "@/providers/naruto/narutoshippuden/search"
    );
    const { shippudenPrintKey } = await import(
      "@/providers/naruto/narutoshippuden/pipeline/ledgers"
    );
    return installNarutocardjpFaces({
      packId: "naruto/shippuden",
      line,
      prefetchBrowser: false,
      resolveDest: (hit) => {
        const diskId = diskIdFromPrintedReference(hit.printedRef);
        if (!diskId) return null;
        const printKey = shippudenPrintKey(diskId);
        if (!printKey) return null;
        const m = diskId.match(/^([a-z]+)(\d+)$/i);
        if (!m) return null;
        return {
          set: m[1]!.toLowerCase(),
          lang: "ja",
          card: diskId,
          printKey,
        };
      },
    });
  }

  const { NARUTO_DATA_CARDDASS_PACK_ID } = await import(
    "@/providers/naruto/narutodatacarddass/pack"
  );
  const { dataCarddassPrintKey, parseDataCarddassPrinted } = await import(
    "@/providers/naruto/narutodatacarddass/printKey"
  );
  return installNarutocardjpFaces({
    packId: NARUTO_DATA_CARDDASS_PACK_ID,
    line: "data-carddass",
    prefetchBrowser: false,
    resolveDest: (hit) => {
      const parsed = parseDataCarddassPrinted(hit.printedRef);
      if (!parsed) return null;
      const printKey = dataCarddassPrintKey(parsed.set, parsed.number);
      if (!printKey) return null;
      return {
        set: parsed.set,
        lang: "ja",
        card: parsed.number,
        printKey,
      };
    },
  });
}

async function main() {
  const arg = (process.argv[2] || "all").trim();
  const lines: NarutocardjpLine[] =
    arg === "all"
      ? ["carddass-ja", "shippuden", "data-carddass"]
      : [arg as NarutocardjpLine];
  for (const line of lines) {
    console.log(`── install ${line}`);
    const result = await installLine(line);
    console.log(JSON.stringify({ line, ...result }));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
