/**
 * Install curated sleeve back + generated full-face foil plate into `data/dbs/fw/`.
 * Same dbscards Masters verso as a placeholder — physical FW back is unverified.
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  statSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

import { foilPackDir } from "@/lib/runtimeData";
import { packCardsDir } from "@/lib/packPaths";

import { DBS_FW_PACK_ID } from "./indexStore";

const PROVIDER_DIR = path.dirname(fileURLToPath(import.meta.url));

export function dbsFwCuratedDir(): string {
  return path.join(PROVIDER_DIR, "curated");
}

function curatedDestStale(srcPath: string, destPath: string): boolean {
  if (!existsSync(destPath)) return true;
  return statSync(srcPath).mtimeMs > statSync(destPath).mtimeMs;
}

export async function installDbsFwCuratedBack(
  opts: { force?: boolean; dryRun?: boolean } = {},
): Promise<{ installed: boolean; dest: string | null }> {
  const src = path.join(dbsFwCuratedDir(), "back.webp");
  const dest = path.join(packCardsDir(DBS_FW_PACK_ID), "back.webp");
  if (!existsSync(src)) return { installed: false, dest: null };
  if (!opts.force && !curatedDestStale(src, dest)) {
    return { installed: false, dest };
  }
  if (opts.dryRun) return { installed: true, dest };
  mkdirSync(path.dirname(dest), { recursive: true });
  copyFileSync(src, dest);
  const mdSrc = path.join(dbsFwCuratedDir(), "BACK.md");
  if (existsSync(mdSrc)) {
    copyFileSync(mdSrc, path.join(packCardsDir(DBS_FW_PACK_ID), "BACK.md"));
  }
  return { installed: true, dest };
}

export async function installDbsFwFullFoilMask(
  opts: { force?: boolean; dryRun?: boolean } = {},
): Promise<{ installed: boolean; dest: string }> {
  const dest = path.join(foilPackDir(DBS_FW_PACK_ID), "full_foil_mask.webp");
  if (!opts.force && existsSync(dest)) return { installed: false, dest };
  if (opts.dryRun) return { installed: true, dest };
  mkdirSync(path.dirname(dest), { recursive: true });
  await sharp({
    create: {
      width: 64,
      height: 64,
      channels: 3,
      background: "#ffffff",
    },
  })
    .webp({ lossless: true })
    .toFile(dest);
  return { installed: true, dest };
}

export async function ensureDbsFwCuratedAssets(opts?: {
  dryRun?: boolean;
  force?: boolean;
}): Promise<void> {
  const back = await installDbsFwCuratedBack(opts);
  if (back.installed) {
    console.log(
      `   pack back → ${back.dest}${opts?.dryRun ? " (dry run)" : ""}`,
    );
  }
  const mask = await installDbsFwFullFoilMask(opts ?? {});
  if (mask.installed) {
    console.log(
      `   full foil mask → ${mask.dest}${opts?.dryRun ? " (dry run)" : ""}`,
    );
  }
}
