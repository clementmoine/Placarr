/**
 * Batch Node extract of Live card UnityFS textures (ADR-021 phase B).
 * Shaders / cards.json aggregation stay on Python until phases C+.
 */

import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { packCardsDir, foilPackDir } from "@/providers/shared/foilPaths";
import {
  cardFaceDir,
  extractCardBundleTextures,
  loadUvRectFile,
  writeExtractSidecar,
  type MaterialManifestRow,
  type TextureMode,
} from "@/providers/pokemontcglive/extractCardTextures";

const BUNDLE_RE =
  /^[a-z0-9.-]+_[a-z]{2,4}_\d+(?:_[a-z])?$/i;

export type ExtractCardsNodeOpts = {
  repo: string;
  bundlesDir: string;
  textureMode?: TextureMode;
  limitCards?: number;
};

export type ExtractCardsNodeResult = {
  ok: boolean;
  bundles: number;
  written: number;
  skipped: number;
  errors: number;
  rows: MaterialManifestRow[];
};

export async function extractCardsNode(
  opts: ExtractCardsNodeOpts,
): Promise<ExtractCardsNodeResult> {
  const textureMode = opts.textureMode ?? "cards";
  const cardsRoot = packCardsDir(opts.repo, "pokemon");
  const cropRect = loadUvRectFile(foilPackDir(opts.repo, "pokemon"));
  let cardFiles = readdirSync(opts.bundlesDir)
    .filter((n) => BUNDLE_RE.test(n))
    .map((n) => path.join(opts.bundlesDir, n))
    .filter((p) => statSync(p).isFile())
    .sort();
  if (opts.limitCards && opts.limitCards > 0) {
    cardFiles = cardFiles.slice(0, opts.limitCards);
  }

  let written = 0;
  let skipped = 0;
  let errors = 0;
  const rows: MaterialManifestRow[] = [];

  for (let i = 0; i < cardFiles.length; i++) {
    const bundlePath = cardFiles[i]!;
    const faceDir = cardFaceDir(cardsRoot, path.basename(bundlePath));
    const art = path.join(faceDir, "art.webp");
    const mtime = statSync(bundlePath).mtimeMs / 1000;
    if (
      textureMode !== "none" &&
      existsSync(art) &&
      statSync(art).mtimeMs / 1000 >= mtime
    ) {
      skipped++;
      continue;
    }
    try {
      const result = await extractCardBundleTextures(bundlePath, faceDir, {
        textureMode,
        cropRect,
      });
      rows.push(...result.rows);
      written += result.written.length;
      writeExtractSidecar(faceDir, mtime, textureMode, result.rows);
    } catch (err) {
      errors++;
      if (errors <= 10) {
        console.log(
          `  FAIL ${path.basename(bundlePath)}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
    if ((i + 1) % 200 === 0 || i + 1 === cardFiles.length) {
      console.log(
        `  cards ${i + 1}/${cardFiles.length} manifests=${rows.length} skipped=${skipped}`,
      );
    }
  }

  return {
    ok: errors === 0 || written > 0 || skipped > 0,
    bundles: cardFiles.length,
    written,
    skipped,
    errors,
    rows,
  };
}
