/**
 * Install official TV Tokyo CCG card scans as `art.tvtokyo.*`.
 * Source of truth: `curated/sources/tvtokyo.json`.
 * Disk: `cards/{family}/{diskId}/{lang}/`.
 *
 * Doubles (`*a.jpg` / `*b.jpg`) → `art.tvtokyo-a` / `art.tvtokyo-b`.
 * Deux fichiers plain sur le même diskId (ex. s034 + ir034) : le second
 * devient `tvtokyo-b` plutôt que d'écraser.
 */
import path from "node:path";

import { httpGet } from "@/lib/http/httpClient";
import { dataRoot } from "@/lib/runtimeData";

import { narutoDiskCardId } from "../collectorIdentity";
import type { NarutoFaceSource } from "../faceChoice";
import { narutoCardAbsDir } from "../narutoCardDisk";
import {
  existingNarutoArtForSource,
  saveNarutoFace,
} from "../narutoFaceBytes";
import { NARUTO_PACK_ID } from "../packs";
import {
  narutoCcgTvTokyoIngestFaces,
  tvTokyoFaceSourceFromFile,
  type NarutoCcgTvTokyoFace,
} from "../sources/tvTokyoFaces";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
const REFERER = "https://www.tv-tokyo.co.jp/anime/naruto2002/goods/";

export type InstallTvTokyoFacesOptions = {
  packRoot?: string;
  force?: boolean;
  fetchImage?: (url: string) => Promise<Buffer | null>;
};

function diskIdOf(row: {
  diskId?: string | null;
  printedRef?: string | null;
}): string | null {
  const fromDisk = String(row.diskId ?? "").trim().toLowerCase();
  if (fromDisk) return fromDisk;
  const printed = String(row.printedRef ?? "").trim();
  return printed ? narutoDiskCardId(printed) : null;
}

type PlannedFace = {
  row: NarutoCcgTvTokyoFace;
  diskId: string;
  lang: string;
  source: NarutoFaceSource;
};

/** Assign sources before any download — a/b + collisions plain/plain. */
export function planTvTokyoFaceSources(
  faces: readonly NarutoCcgTvTokyoFace[] = narutoCcgTvTokyoIngestFaces(),
): { planned: PlannedFace[]; failed: string[] } {
  const planned: PlannedFace[] = [];
  const failed: string[] = [];
  const claimed = new Map<string, Set<NarutoFaceSource>>();

  for (const row of faces) {
    const diskId = diskIdOf(row);
    if (!diskId) {
      failed.push(String(row.printedRef ?? row.url));
      continue;
    }
    const lang = String(row.lang ?? "ja").toLowerCase();
    let source: NarutoFaceSource = tvTokyoFaceSourceFromFile(
      String(row.file ?? ""),
    );
    const used = claimed.get(diskId) ?? new Set<NarutoFaceSource>();
    if (used.has(source)) {
      if (source === "tvtokyo" && !used.has("tvtokyo-b")) {
        source = "tvtokyo-b";
      } else {
        failed.push(`${diskId}/${lang}:${row.file}:source-collision`);
        continue;
      }
    }
    used.add(source);
    claimed.set(diskId, used);
    planned.push({ row, diskId, lang, source });
  }
  return { planned, failed };
}

export async function installTvTokyoFaces(
  options: InstallTvTokyoFacesOptions = {},
): Promise<{ written: string[]; skipped: string[]; failed: string[] }> {
  const packRoot = options.packRoot ?? path.join(dataRoot(), NARUTO_PACK_ID);
  const cardsDir = path.join(packRoot, "cards");
  const written: string[] = [];
  const skipped: string[] = [];
  const { planned, failed: planFailed } = planTvTokyoFaceSources();
  const failed: string[] = [...planFailed];

  const CHUNK_SIZE = 8;
  for (let i = 0; i < planned.length; i += CHUNK_SIZE) {
    const chunk = planned.slice(i, i + CHUNK_SIZE);
    await Promise.all(
      chunk.map(async ({ row, diskId, lang, source }) => {
        const cardDir = narutoCardAbsDir(cardsDir, diskId, lang);
        if (!cardDir) {
          failed.push(`${diskId}/${lang}`);
          return;
        }
        const key = `${diskId}/${lang}/${source}`;
        if (!options.force && existingNarutoArtForSource(cardDir, source)) {
          skipped.push(key);
          return;
        }
        const buf = options.fetchImage
          ? await options.fetchImage(row.url)
          : await downloadImage(row.url);
        if (!buf) {
          failed.push(key);
          return;
        }
        const saved = await saveNarutoFace({
          cardDir,
          buf,
          source,
          lang,
          force: options.force,
        });
        if (saved === "skip") skipped.push(key);
        else written.push(key);
      }),
    );
  }
  return { written, skipped, failed };
}

async function downloadImage(url: string): Promise<Buffer | null> {
  try {
    const res = await httpGet<ArrayBuffer>(url, {
      headers: { "User-Agent": UA, Referer: REFERER },
      responseType: "arraybuffer",
      timeout: 30_000,
      validateStatus: (status) => status === 200,
    });
    const buf = Buffer.from(res.data as ArrayBuffer);
    return buf.byteLength >= 800 ? buf : null;
  } catch {
    return null;
  }
}
