/**
 * Rebuild the sealed-product dHash index for a catalogue dataPack.
 *
 * Walks `products/{slug}/{lang}/art.*` (face.json winner preferred). Full-frame
 * signals only — never CARD_ART_BAND. Incremental on face fingerprints.
 */
import { existsSync, statSync } from "node:fs";

import {
  buildProductVisualIndex,
  loadProductVisualIndex,
  PRODUCT_VISUAL_INDEX_VERSION,
  productVisualIndexPath,
  type ProductVisualIndexFile,
} from "@/core/identify/productVisualIndex";
import { packSealedProductsDir } from "@/lib/packPaths";

function indexLooksFresh(packId: string): ProductVisualIndexFile | null {
  const existing = loadProductVisualIndex(packId);
  if (!existing?.entries.length) return null;
  if (existing.version < PRODUCT_VISUAL_INDEX_VERSION) return null;
  if (!existing.entries.some((e) => e.aHash && e.color)) return null;

  const indexPath = productVisualIndexPath(packId);
  const productsRoot = packSealedProductsDir(packId);
  try {
    const indexMtime = statSync(indexPath).mtimeMs;
    if (existsSync(productsRoot) && statSync(productsRoot).mtimeMs > indexMtime) {
      return null;
    }
  } catch {
    return null;
  }
  return existing;
}

export async function runDataPackProductVisualIndex(
  packId: string,
  opts?: {
    langs?: readonly string[];
    limit?: number;
    force?: boolean;
    onLog?: (line: string) => void;
  },
): Promise<ProductVisualIndexFile> {
  if (!opts?.force && opts?.limit == null) {
    const fresh = indexLooksFresh(packId);
    if (fresh) {
      opts?.onLog?.(
        `── product visual index — fresh (${fresh.entries.length} face${fresh.entries.length === 1 ? "" : "s"}, skip)`,
      );
      return fresh;
    }
  }

  const preferred = opts?.langs?.[0]?.trim().toLowerCase();
  const prior = opts?.force ? null : undefined;
  const before = loadProductVisualIndex(packId);
  const file = await buildProductVisualIndex({
    packId,
    lang: preferred || undefined,
    limit: opts?.limit,
    prior: prior === null ? null : undefined,
  });
  const written = !before || before.builtAt !== file.builtAt;
  opts?.onLog?.(
    written
      ? `── product visual index — ${file.entries.length} face${file.entries.length === 1 ? "" : "s"}`
      : `── product visual index — ${file.entries.length} faces unchanged, not rewritten`,
  );
  return file;
}
