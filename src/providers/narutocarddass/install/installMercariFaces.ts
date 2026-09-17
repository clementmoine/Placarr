/**
 * Install Mercari faces as `art.mercari.*`.
 * Ledger rows list a live `static.mercdn.net` `url` (and optionally a git-backed
 * `curated` path as offline fallback). Curated wins when the file is on disk.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { dataRoot } from "@/lib/runtimeData";
import { downloadMercariOrigPhoto } from "@/providers/shared/mercariCdn";

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
  /** Test seam — defaults to live mercdn fetch. */
  fetchImage?: (url: string) => Promise<Buffer | null>;
};

export async function installMercariFaces(
  options: InstallMercariFacesOptions = {},
): Promise<{ written: string[]; skipped: string[]; failed: string[] }> {
  const packRoot = options.packRoot ?? path.join(dataRoot(), NARUTO_PACK_ID);
  const curatedRoot = options.curatedRoot ?? narutoCuratedDir();
  const fetchImage = options.fetchImage ?? downloadMercariOrigPhoto;
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

    let buf: Buffer | null = null;
    const curatedRel =
      "curated" in row && typeof row.curated === "string" ? row.curated : null;
    if (curatedRel) {
      const src = path.join(curatedRoot, curatedRel);
      if (existsSync(src)) buf = readFileSync(src);
    }
    if (!buf && typeof row.url === "string" && row.url.length > 0) {
      buf = await fetchImage(row.url);
    }
    if (!buf) {
      failed.push(key);
      continue;
    }
    if (options.dryRun) {
      written.push(key);
      continue;
    }
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
