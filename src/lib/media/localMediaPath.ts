/**
 * Resolve a local media URL (`/uploads/…` or `/assets/…`) to a file under
 * `data/`. After the public/ → data/ move, hashing and metrics must not join
 * `public/` — those trees are empty and every perceptual rematch would no-op.
 */
import { assetsFilePath } from "@/lib/media/assetsPath";
import { uploadsFilePath } from "@/lib/media/uploadsPath";

export function localMediaFilePath(url: string): string | null {
  if (!url || !url.startsWith("/")) return null;
  return uploadsFilePath(url) ?? assetsFilePath(url);
}
