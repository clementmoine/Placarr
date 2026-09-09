/**
 * Split official carddas.com double-height GIFs into `art.carddas-a` (top)
 * and `art.carddas-b` (bottom). Source of truth: ledger + staging GIFs from
 * the carddas.jp harvest — not hand-pasted PNGs.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { dataRoot } from "@/lib/runtimeData";

import ledger from "../curated/sources/carddas-jp-double-illustrations.json";
import { narutoCardAbsDir } from "../narutoCardDisk";
import {
  existingNarutoArtForSource,
  saveNarutoFace,
} from "../narutoFaceBytes";
import { NARUTO_PACK_ID } from "../packs";
import { NARUTO_STAGING_CARDDAS_JP } from "../scrape/scrapeCarddasJp";

const LANG = "ja";

export type InstallCarddasDoubleIllustrationFacesOptions = {
  force?: boolean;
  root?: string;
};

function packRoot(dataDir?: string): string {
  return path.join(dataDir ?? dataRoot(), NARUTO_PACK_ID);
}

/** Basename of the GIF listed in the ledger (`jutsu-192_10.gif`). */
export function carddasDoubleGifBasename(gifField: string): string {
  const base = gifField.split("/").pop()?.trim() ?? "";
  return base.replace(/\s*\(.*\)$/, "").trim();
}

function findStagingGif(stagingRoot: string, basename: string): string | null {
  const candidates = [
    path.join(
      stagingRoot,
      "www.carddass.com/naruto/cardlist/card_img",
      basename,
    ),
    path.join(
      stagingRoot,
      "www.carddas.com/naruto/cardlist/card_img",
      basename,
    ),
  ];
  for (const abs of candidates) {
    if (existsSync(abs)) return abs;
  }
  return null;
}

export async function installCarddasDoubleIllustrationFaces(
  opts: InstallCarddasDoubleIllustrationFacesOptions = {},
): Promise<{ written: string[]; skipped: string[]; failed: string[] }> {
  const root = packRoot(opts.root);
  const staging = path.join(root, NARUTO_STAGING_CARDDAS_JP);
  const cardsDir = path.join(root, "cards");
  const written: string[] = [];
  const skipped: string[] = [];
  const failed: string[] = [];
  const { default: sharp } = await import("sharp");

  for (const row of ledger.cards) {
    const diskId = String(row.number).trim().toLowerCase();
    const gifName = carddasDoubleGifBasename(row.gif);
    const gifAbs = findStagingGif(staging, gifName);
    if (!gifAbs) {
      failed.push(`${diskId}:missing-gif:${gifName}`);
      continue;
    }
    const cardDir =
      narutoCardAbsDir(cardsDir, diskId, LANG) ??
      path.join(cardsDir, "jutsu", diskId, LANG);
    const meta = await sharp(readFileSync(gifAbs)).metadata();
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;
    if (width < 8 || height < 16) {
      failed.push(`${diskId}:bad-gif`);
      continue;
    }
    const half = Math.floor(height / 2);
    const halves: { source: "carddas-a" | "carddas-b"; top: number }[] = [
      { source: "carddas-a", top: 0 },
      { source: "carddas-b", top: half },
    ];
    for (const halfRow of halves) {
      const key = `${diskId}/${halfRow.source}`;
      if (
        !opts.force &&
        existingNarutoArtForSource(cardDir, halfRow.source)
      ) {
        skipped.push(key);
        continue;
      }
      const buf = await sharp(gifAbs)
        .extract({
          left: 0,
          top: halfRow.top,
          width,
          height: half,
        })
        .png()
        .toBuffer();
      const saved = await saveNarutoFace({
        cardDir,
        buf,
        source: halfRow.source,
        lang: LANG,
        force: opts.force,
      });
      if (saved === "skip") skipped.push(key);
      else written.push(key);
    }
  }
  return { written, skipped, failed };
}
