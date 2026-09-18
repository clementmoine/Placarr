import fs from "node:fs";
import path from "node:path";

import { uploadsDir } from "@/lib/runtimeData";

export const UPLOADS_PREFIX = "/uploads/";

/** Rasters an uploads URL may name, whatever extension it was written with. */
const SIBLING_EXTENSIONS = [".webp", ".png", ".jpg", ".jpeg", ".gif"];

/**
 * Resolve an uploads URL to a file on disk, refusing anything that escapes the
 * directory. The URL arrives from the client, so `..` and absolute paths have
 * to die here rather than at `readFileSync`.
 *
 * The extension is a hint, not a fact. Everything the app writes is WebP now,
 * while URLs stored before the migration — and the `<name>.webp` that stripping
 * a `_edited.webp` suffix yields for a source that is still `<name>.png` — name a
 * file that was never written under that name. Trying the siblings is what lets
 * a crop find the original it came from across that boundary.
 */
export function uploadsFilePath(url: string): string | null {
  if (!url.startsWith(UPLOADS_PREFIX)) return null;
  const fileName = path.basename(url.split("?")[0].split("#")[0]);
  if (!fileName || fileName === "." || fileName === "..") return null;

  const root = uploadsDir();
  const filePath = path.join(root, fileName);
  if (path.dirname(filePath) !== root) return null;
  if (fs.existsSync(filePath)) return filePath;

  const ext = path.extname(fileName);
  if (!ext) return null;
  const base = path.basename(fileName, ext);
  for (const candidate of SIBLING_EXTENSIONS) {
    if (candidate === ext.toLowerCase()) continue;
    const sibling = path.join(root, `${base}${candidate}`);
    if (fs.existsSync(sibling)) return sibling;
  }
  return null;
}
