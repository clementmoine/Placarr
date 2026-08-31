/**
 * Fold leftover `art.jpg` (written before dumps were named) into
 * `art.<source>.<ext>`. Byte-identical to a named sibling → drop. Unique
 * files get a source when locale + size identify the host; the rest stay
 * `legacy` until that host is scraped.
 */
import { createHash } from "node:crypto";
import {
  existsSync,
  readFileSync,
  readdirSync,
  renameSync,
  unlinkSync,
} from "node:fs";
import path from "node:path";

import {
  NARUTO_FACE_DECISION_FILE,
  narutoFaceFilename,
  narutoFaceSourceOf,
  parseNarutoFaceDecision,
  recordNarutoFaceDecision,
  type NarutoFaceSource,
} from "./faceChoice";
import { listNarutoCardDirs } from "./narutoCardDisk";
import type { NarutoLangAppearances } from "./appearanceSets";

export const UNSOURCED_ART_NAME = /^art\.(jpe?g|png|gif|webp)$/i;

export type UnsourcedArtPlan =
  | { op: "delete"; keep: string }
  | { op: "rename"; source: NarutoFaceSource }
  | { op: "keep" };

function near(
  width: number,
  height: number,
  tw: number,
  th: number,
  dw = 8,
  dh = 8,
): boolean {
  return Math.abs(width - tw) <= dw && Math.abs(height - th) <= dh;
}

/** Who wrote this unsourced file, or null if we will not invent a host. */
export function inferUnsourcedNarutoSource(input: {
  lang: string;
  appearanceSet?: string | null;
  width: number;
  height: number;
}): NarutoFaceSource | null {
  const lang = input.lang.toLowerCase();
  const set = (input.appearanceSet ?? "").toLowerCase();
  const { width, height } = input;
  if (lang === "ja" && near(width, height, 340, 500, 6, 4)) return "nikita";
  if (lang === "it") return "coleka";
  if (lang === "fr") {
    if (set === "s28") return "coleka";
    if (near(width, height, 350, 495, 8, 8)) return "carddass";
    if (width >= 840 && width <= 860 && height >= 1195 && height <= 1215) {
      return "carddass";
    }
    return null;
  }
  if (lang === "en") {
    if (near(width, height, 750, 1050, 12, 12)) return "vintage";
    if (near(width, height, 350, 490, 8, 8)) {
      return set === "s28" ? "stop2shop" : "goat";
    }
    return null;
  }
  return null;
}

export function planUnsourcedNarutoArt(input: {
  unsourcedFile: string;
  unsourcedHash: string;
  named: readonly { source: NarutoFaceSource; file: string; hash: string }[];
  lang: string;
  appearanceSet?: string | null;
  width: number;
  height: number;
}): UnsourcedArtPlan {
  const twin = input.named.find((row) => row.hash === input.unsourcedHash);
  if (twin) return { op: "delete", keep: twin.file };
  const source = inferUnsourcedNarutoSource(input);
  if (!source) return { op: "keep" };
  if (input.named.some((row) => row.source === source)) return { op: "keep" };
  return { op: "rename", source };
}

function sha1(abs: string): string {
  return createHash("sha1").update(readFileSync(abs)).digest("hex");
}

function loadAppearances(root: string): Record<string, NarutoLangAppearances> {
  try {
    const raw = JSON.parse(
      readFileSync(path.join(root, "appearances.json"), "utf8"),
    ) as { appearances?: Record<string, NarutoLangAppearances> };
    return raw.appearances ?? {};
  } catch {
    return {};
  }
}

function retargetDecision(cardDir: string, from: string, to: string): void {
  try {
    const json = readFileSync(
      path.join(cardDir, NARUTO_FACE_DECISION_FILE),
      "utf8",
    );
    const named = parseNarutoFaceDecision(json, "art");
    if (named === from) recordNarutoFaceDecision(cardDir, "art", to);
  } catch {
    /* no decision */
  }
}

export async function foldUnsourcedNarutoArt(root: string): Promise<{
  deleted: number;
  renamed: number;
  kept: number;
}> {
  const cardsDir = path.join(root, "cards");
  const appearances = loadAppearances(root);
  const { default: sharp } = await import("sharp");
  let deleted = 0;
  let renamed = 0;
  let kept = 0;
  for (const hit of listNarutoCardDirs(cardsDir, appearances)) {
    let files: string[];
    try {
      files = readdirSync(hit.abs);
    } catch {
      continue;
    }
    const unsourced = files.filter((name) => UNSOURCED_ART_NAME.test(name));
    if (!unsourced.length) continue;
    const named: { source: NarutoFaceSource; file: string; hash: string }[] =
      files.flatMap((file) => {
        const source = narutoFaceSourceOf(file);
        if (!source || source === "legacy") return [];
        return [
          {
            source,
            file,
            hash: sha1(path.join(hit.abs, file)),
          },
        ];
      });
    for (const file of unsourced) {
      const abs = path.join(hit.abs, file);
      let width = 0;
      let height = 0;
      try {
        const meta = await sharp(abs).metadata();
        width = meta.width ?? 0;
        height = meta.height ?? 0;
      } catch {
        kept += 1;
        continue;
      }
      const plan = planUnsourcedNarutoArt({
        unsourcedFile: file,
        unsourcedHash: sha1(abs),
        named,
        lang: hit.lang,
        appearanceSet: hit.appearanceSet,
        width,
        height,
      });
      if (plan.op === "delete") {
        unlinkSync(abs);
        retargetDecision(hit.abs, file, plan.keep);
        deleted += 1;
        continue;
      }
      if (plan.op === "rename") {
        const ext = path.extname(file).replace(/^\./, "").toLowerCase();
        const destName = narutoFaceFilename(
          plan.source,
          "art",
          ext === "jpeg" ? "jpg" : ext,
        );
        const dest = path.join(hit.abs, destName);
        if (existsSync(dest)) {
          kept += 1;
          continue;
        }
        renameSync(abs, dest);
        retargetDecision(hit.abs, file, destName);
        named.push({ source: plan.source, file: destName, hash: sha1(dest) });
        renamed += 1;
        continue;
      }
      kept += 1;
    }
  }
  return { deleted, renamed, kept };
}
