/**
 * Copy VPN-saved Mercari photos into the catalogue as `art.mercari.*`.
 * Source of truth: `curated/sources/mercari.json` + `curated/cards/…/source.jpg`.
 * Never fetch mercdn — those URLs die without a JP session.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { dataRoot } from "@/lib/runtimeData";

import { narutoDiskCardId } from "../collectorIdentity";
import { narutoCuratedDir } from "../curatedPaths";
import { mercariIngestFaces } from "../sources/mercari";
import { upsertNarutoAppearances } from "../migrateCardLayout";
import { narutoCardAbsDir } from "../narutoCardDisk";
import { existingNarutoArtForSource, saveNarutoFace } from "../narutoFaceBytes";
import { NARUTO_PACK_ID } from "../packs";

export type InstallMercariFacesOptions = {
  packRoot?: string;
  curatedRoot?: string;
  force?: boolean;
  dryRun?: boolean;
};

export async function installMercariFaces(
  options: InstallMercariFacesOptions = {},
): Promise<{ written: string[]; skipped: string[]; failed: string[] }> {
  const packRoot = options.packRoot ?? path.join(dataRoot(), NARUTO_PACK_ID);
  const curatedRoot = options.curatedRoot ?? narutoCuratedDir();
  const cardsDir = path.join(packRoot, "cards");
  const written: string[] = [];
  const skipped: string[] = [];
  const failed: string[] = [];
  for (const row of mercariIngestFaces()) {
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
    if (!options.force && existingNarutoArtForSource(cardDir, "mercari")) {
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
      source: "mercari",
      lang,
      force: options.force,
    });
    if (saved === "skip") skipped.push(key);
    else written.push(key);
  }
  return { written, skipped, failed };
}
