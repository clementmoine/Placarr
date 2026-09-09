/**
 * Copy VPN-saved Yahoo auction photos into the catalogue as `art.yahoo.*`.
 * Source of truth: `curated/sources/yahoo-auctions.json` + `curated/cards/…/source.jpg`.
 * Never fetch the CDN — those URLs die without a JP session.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { dataRoot } from "@/lib/runtimeData";

import { narutoDiskCardId } from "../collectorIdentity";
import { narutoCuratedDir } from "../curatedPaths";
import { upsertNarutoAppearances } from "../migrateCardLayout";
import { narutoCardAbsDir } from "../narutoCardDisk";
import { existingNarutoArtForSource, saveNarutoFace } from "../narutoFaceBytes";
import { NARUTO_PACK_ID } from "../packs";
import { yahooIngestFaces } from "../sources/yahooAuctions";

export type InstallYahooAuctionFacesOptions = {
  packRoot?: string;
  curatedRoot?: string;
  force?: boolean;
  dryRun?: boolean;
};

export async function installYahooAuctionFaces(
  options: InstallYahooAuctionFacesOptions = {},
): Promise<{ written: string[]; skipped: string[]; failed: string[] }> {
  const packRoot = options.packRoot ?? path.join(dataRoot(), NARUTO_PACK_ID);
  const curatedRoot = options.curatedRoot ?? narutoCuratedDir();
  const cardsDir = path.join(packRoot, "cards");
  const written: string[] = [];
  const skipped: string[] = [];
  const failed: string[] = [];
  for (const row of yahooIngestFaces()) {
    const diskId = narutoDiskCardId(row.printedRef);
    if (!diskId) {
      failed.push(row.printedRef);
      continue;
    }
    const lang = row.lang.toLowerCase();
    const cardDir =
      narutoCardAbsDir(cardsDir, diskId, lang, row.setCode) ??
      path.join(cardsDir, "ninja", diskId, lang);
    const key = `${diskId}/${lang}`;
    upsertNarutoAppearances(packRoot, [
      { diskId, lang, appearanceSet: row.setCode },
    ]);
    if (!options.force && existingNarutoArtForSource(cardDir, "yahoo")) {
      skipped.push(key);
      continue;
    }
    const src = path.join(curatedRoot, row.curated);
    if (!existsSync(src)) {
      failed.push(key);
      continue;
    }
    if (options.dryRun) {
      written.push(key);
      continue;
    }
    const buf = readFileSync(src);
    const saved = await saveNarutoFace({
      cardDir,
      buf,
      source: "yahoo",
      lang,
      force: options.force,
    });
    if (saved === "skip") skipped.push(key);
    else written.push(key);
  }
  return { written, skipped, failed };
}
