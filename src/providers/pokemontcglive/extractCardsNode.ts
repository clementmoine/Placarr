/**
 * Batch Node extract of Live card UnityFS textures (ADR-021 phase B).
 * Full orchestration: {@link extractAllNode}.
 */

import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { packCardsDir, foilPackDir } from "@/providers/shared/foilPaths";
import { loadBundleLedger } from "@/providers/pokemontcglive/bundleLedger";
import {
  cardFaceDir,
  extractCardBundleTextures,
  isCardTextureExtractFresh,
  loadUvRectFile,
  readExtractSidecarMeta,
  writeExtractSidecar,
  type MaterialManifestRow,
  type TextureMode,
} from "@/providers/pokemontcglive/extractCardTextures";

const BUNDLE_RE = /^[a-z0-9.-]+_[a-z]{2,4}_\d+(?:_[a-z])?$/i;

export type ExtractCardsNodeOpts = {
  repo: string;
  bundlesDir: string;
  textureMode?: TextureMode;
  limitCards?: number;
  /**
   * Directory holding `cdn-bundle-versions.json.gz` (usually `staging/`).
   * Defaults to the parent of `bundlesDir`.
   */
  ledgerRoot?: string;
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
  const ledgerRoot = opts.ledgerRoot ?? path.dirname(opts.bundlesDir);
  const ledger = loadBundleLedger(ledgerRoot);
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
    const stem = path.basename(bundlePath);
    const faceDir = cardFaceDir(cardsRoot, stem);
    const art = path.join(faceDir, "art.webp");
    const st = statSync(bundlePath);
    const mtime = st.mtimeMs / 1000;
    const bundleSize = st.size;
    const bundleHash =
      ledger.entries[stem.toLowerCase()]?.hash?.trim() || null;
    const sidecar = readExtractSidecarMeta(faceDir);
    const upToDate = isCardTextureExtractFresh({
      artPath: art,
      bundleMtimeSec: mtime,
      bundleSize,
      textureMode,
      sidecar,
      bundleHash,
    });
    if (upToDate) {
      skipped++;
      if (sidecar?.rows?.length) rows.push(...sidecar.rows);
      // Backfill CDN hash on legacy sidecars so a later re-download of the
      // same bytes does not force another Unity decode.
      if (
        bundleHash &&
        sidecar?.rows?.length &&
        sidecar.bundleHash !== bundleHash
      ) {
        writeExtractSidecar(faceDir, mtime, textureMode, sidecar.rows, {
          bundleHash,
          bundleSize,
        });
      }
    } else {
      try {
        const result = await extractCardBundleTextures(bundlePath, faceDir, {
          textureMode,
          cropRect,
        });
        rows.push(...result.rows);
        written += result.written.length;
        writeExtractSidecar(faceDir, mtime, textureMode, result.rows, {
          bundleHash,
          bundleSize,
        });
      } catch (err) {
        errors++;
        if (errors <= 10) {
          console.log(
            `  FAIL ${stem}: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        }
      }
    }
    // Progress must also tick on the skip path: on a re-run most bundles are
    // already extracted and a `continue` used to swallow every log line —
    // minutes of silence while the loop was actually busy stat-ing 30k files.
    if ((i + 1) % 200 === 0 || i + 1 === cardFiles.length) {
      console.log(
        `  cards ${i + 1}/${cardFiles.length} written=${written} manifests=${rows.length} skipped=${skipped} errors=${errors}`,
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
