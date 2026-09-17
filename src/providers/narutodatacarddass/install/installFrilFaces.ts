/**
 * Install Fril curated crops as `art.fril.*` beside other dumps.
 * Never skip because art.ebay (or another host) already exists.
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  unlinkSync,
} from "node:fs";
import path from "node:path";

import { dataRoot } from "@/lib/runtimeData";
import type { createLocalPrintsIndex } from "@/providers/shared/cardCatalogue/localPrintsIndex";

import {
  dataCarddassPrintKey,
  parseDataCarddassPrinted,
} from "../printKey";
import {
  NARUTO_DATA_CARDDASS_PACK_ID,
  narutoDataCarddassCuratedDir,
} from "../pack";
import { dataCarddassFrilIngestFaces } from "../sources/frilFaces";

const LANG = "ja";
const ART_NAME = "art.fril.jpg";

function existingFrilArt(cardDir: string): string | null {
  if (!existsSync(cardDir)) return null;
  return (
    readdirSync(cardDir).find((name) => /^art\.fril\./i.test(name)) ?? null
  );
}

export type InstallDataCarddassFrilFacesOptions = {
  packRoot?: string;
  curatedRoot?: string;
  force?: boolean;
  index?: ReturnType<typeof createLocalPrintsIndex>;
};

export async function installDataCarddassFrilFaces(
  options: InstallDataCarddassFrilFacesOptions = {},
): Promise<{ written: string[]; skipped: string[]; failed: string[] }> {
  const packRoot =
    options.packRoot ?? path.join(dataRoot(), NARUTO_DATA_CARDDASS_PACK_ID);
  const curatedRoot = options.curatedRoot ?? narutoDataCarddassCuratedDir();
  const written: string[] = [];
  const skipped: string[] = [];
  const failed: string[] = [];
  const assets: Array<{
    printKey: string;
    lang: string;
    art: string;
    sourceUrl?: string;
  }> = [];

  for (const row of dataCarddassFrilIngestFaces()) {
    const parsed = parseDataCarddassPrinted(row.printedRef);
    if (!parsed) {
      failed.push(row.printedRef);
      continue;
    }
    const printKey = dataCarddassPrintKey(parsed.set, parsed.number);
    if (!printKey) {
      failed.push(row.printedRef);
      continue;
    }
    const cardDir = path.join(
      packRoot,
      "cards",
      parsed.set,
      LANG,
      parsed.number,
    );
    const key = `${parsed.set}/${LANG}/${parsed.number}`;
    if (!options.force) {
      const existing = existingFrilArt(cardDir);
      if (existing) {
        assets.push({
          printKey,
          lang: LANG,
          art: existing,
          sourceUrl: row.listingUrl,
        });
        skipped.push(key);
        continue;
      }
    }

    const src = path.join(curatedRoot, row.curated);
    if (!existsSync(src)) {
      failed.push(key);
      continue;
    }
    mkdirSync(cardDir, { recursive: true });
    for (const name of readdirSync(cardDir)) {
      if (/^art\.fril\./i.test(name) && name !== ART_NAME) {
        unlinkSync(path.join(cardDir, name));
      }
    }
    copyFileSync(src, path.join(cardDir, ART_NAME));
    assets.push({
      printKey,
      lang: LANG,
      art: ART_NAME,
      sourceUrl: row.listingUrl,
    });
    written.push(key);
  }

  if (options.index && assets.length) {
    options.index.writeAssets(assets);
  }
  return { written, skipped, failed };
}
