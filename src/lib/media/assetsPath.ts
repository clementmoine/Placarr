/**
 * Resolve `/assets/<pack>/…` URLs to disk, and copy them into uploads when an
 * edit (crop, etc.) needs a writable sibling next to the file.
 *
 * Pack corpora stay read-only: derivatives and sidecars live under uploads.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {
  ASSETS_URL_PREFIX,
  resolveAssetsDiskRoot,
  splitAssetsPackPath,
} from "@/lib/packPaths";
import { resolveUnderRoot } from "@/lib/media/streamDataFile";
import { UPLOADS_PREFIX } from "@/lib/media/uploadsPath";
import { uploadsDir } from "@/lib/runtimeData";

function cleanAssetUrl(url: string): string {
  return url.trim().split("?")[0]!.split("#")[0]!;
}

/**
 * Absolute path of a pack asset URL, or `null` if missing / escapes the pack
 * root / is not an `/assets/` URL.
 */
export function assetsFilePath(url: string): string | null {
  const clean = cleanAssetUrl(url);
  const prefix = `${ASSETS_URL_PREFIX}/`;
  if (!clean.startsWith(prefix)) return null;

  const segments = clean
    .slice(prefix.length)
    .split("/")
    .filter(Boolean)
    .map((s) => {
      try {
        return decodeURIComponent(s);
      } catch {
        return s;
      }
    });
  const split = splitAssetsPackPath(segments);
  if (!split || split.rest.length === 0) return null;
  const mapped = resolveAssetsDiskRoot(split.pack, split.rest);
  if (!mapped) return null;
  return resolveUnderRoot(mapped.root, mapped.relative);
}

/**
 * Copy a pack face into uploads (content-addressed by URL) so crop / sidecars
 * never write into `data/<pack>/`. Idempotent when the copy already exists.
 */
export function localizePackAssetToUploads(url: string): string | null {
  const filePath = assetsFilePath(url);
  if (!filePath) return null;

  const hash = crypto.createHash("md5").update(cleanAssetUrl(url)).digest("hex");
  const ext = path.extname(filePath).toLowerCase() || ".webp";
  const name = `${hash}${ext}`;
  const dest = path.join(uploadsDir(), name);
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(uploadsDir(), { recursive: true });
    fs.copyFileSync(filePath, dest);
  }
  return `${UPLOADS_PREFIX}${name}`;
}
