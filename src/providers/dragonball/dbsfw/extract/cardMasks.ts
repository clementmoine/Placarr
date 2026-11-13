/**
 * Read-only extract of Fusion World card masks from the installed client.
 * The game tree is never written. WebP files land beside the catalogue print.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { writeLosslessRgbaWebp } from "@/lib/media/losslessWebp";
import { packCardDir } from "@/lib/packPaths";
import { decodeTextureTree } from "@/lib/unity/texture2d";
import { iterClassTrees, loadUnityFs } from "@/lib/unity/loadUnityFs";

import { DBS_FW_FACE_LANGS, DBS_FW_PACK_ID } from "../indexStore";
import { fusionWorldCardBundle, fusionWorldMaskTexture } from "../masks";

export type FwMaskExtractStats = {
  bundles: number;
  masks: number;
  written: number;
  skipped: number;
  failed: number;
};

function bundleNames(dir: string): string[] {
  return readdirSync(dir)
    .filter((name) => fusionWorldCardBundle(name))
    .sort((a, b) => a.localeCompare(b));
}

async function extractBundle(
  bundlesDir: string,
  fileName: string,
  force: boolean,
  stats: FwMaskExtractStats,
): Promise<void> {
  const card = fusionWorldCardBundle(fileName);
  if (!card) return;
  let loaded;
  try {
    loaded = loadUnityFs(readFileSync(path.join(bundlesDir, fileName)));
  } catch {
    stats.failed += 1;
    return;
  }

  for (const tree of iterClassTrees(loaded, 28)) {
    const name = String(tree.m_Name ?? tree.name ?? "");
    const mask = fusionWorldMaskTexture(name);
    if (!mask) continue;
    stats.masks += 1;
    const dests = mask.langs
      .filter((lang) =>
        (DBS_FW_FACE_LANGS as readonly string[]).includes(lang),
      )
      .map((lang) =>
        path.join(
          packCardDir(DBS_FW_PACK_ID, {
            set: card.set,
            lang,
            card: card.folder,
          }),
          mask.file,
        ),
      );
    const pending = dests.filter((dest) => {
      if (!existsSync(dest)) return true;
      // A front/back split must not replace the full bundle's mask.
      if (card.partial || !force) return false;
      return true;
    });
    stats.skipped += dests.length - pending.length;
    if (pending.length === 0) continue;
    const decoded = decodeTextureTree(tree, loaded);
    if (!decoded) {
      stats.failed += 1;
      continue;
    }
    for (const dest of pending) {
      try {
        await writeLosslessRgbaWebp(
          decoded.rgba,
          decoded.width,
          decoded.height,
          dest,
        );
        stats.written += 1;
      } catch {
        stats.failed += 1;
      }
    }
  }
}

export async function extractFusionWorldCardMasks(opts: {
  bundlesDir: string;
  force?: boolean;
  limit?: number;
  onProgress?: (done: number, total: number, stats: FwMaskExtractStats) => void;
}): Promise<FwMaskExtractStats> {
  const names = bundleNames(opts.bundlesDir);
  const selected = opts.limit ? names.slice(0, opts.limit) : names;
  const stats: FwMaskExtractStats = {
    bundles: selected.length,
    masks: 0,
    written: 0,
    skipped: 0,
    failed: 0,
  };
  let done = 0;
  for (const fileName of selected) {
    await extractBundle(opts.bundlesDir, fileName, opts.force === true, stats);
    done += 1;
    if (done % 50 === 0 || done === selected.length) {
      opts.onProgress?.(done, selected.length, stats);
    }
  }
  return stats;
}
