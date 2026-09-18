/**
 * Packshot URL for a sealed SKU — prefer `face.json`, then index URL, then any
 * `art.*` still on disk (recovery often left `image: null` while dumps stayed).
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { assetsPackFileUrl } from "@/lib/packAssetUrls";
import { packSealedProductsDir } from "@/lib/packPaths";
import { CARD_FACE_DECISION_FILE } from "@/providers/shared/cardFaces";

import { resolveSealedLang } from "./lang";

type FaceDecision = {
  art?: string | null;
};

function langFolder(lang: string | null | undefined, slug: string): string {
  return resolveSealedLang({ lang, slug })?.trim().toLowerCase() || "fr";
}

function artFilesIn(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => /^art\./i.test(name))
    .sort((a, b) => a.localeCompare(b));
}

/**
 * Absolute `/assets/…` URL for the displayed packshot, or `fallback` /
 * `null` when nothing is on disk.
 */
export function resolveSealedPackshotUrl(input: {
  packId: string;
  slug: string;
  lang?: string | null;
  /** Index / listing image — used when face.json is missing or stale. */
  fallback?: string | null;
  productsDir?: string;
}): string | null {
  const slug = input.slug.trim();
  if (!slug) return input.fallback?.trim() || null;
  const lang = langFolder(input.lang, slug);
  const dir = path.join(
    input.productsDir ?? packSealedProductsDir(input.packId),
    slug,
    lang,
  );

  try {
    const facePath = path.join(dir, CARD_FACE_DECISION_FILE);
    if (existsSync(facePath)) {
      const raw: unknown = JSON.parse(readFileSync(facePath, "utf8"));
      const art =
        raw && typeof raw === "object" && "art" in raw
          ? String((raw as FaceDecision).art ?? "").trim()
          : "";
      if (art && existsSync(path.join(dir, art))) {
        return assetsPackFileUrl(input.packId, "products", slug, lang, art);
      }
    }
  } catch {
    /* fall through */
  }

  const fallback = input.fallback?.trim() || null;
  if (fallback) return fallback;

  const arts = artFilesIn(dir);
  if (arts[0]) {
    return assetsPackFileUrl(input.packId, "products", slug, lang, arts[0]);
  }
  return null;
}

/**
 * Remplit `entry.image` depuis face.json / dumps disque quand l'index a perdu
 * l'URL (réinsertion SKU, merge, …). Mutates `products` in place.
 */
export function backfillSealedProductPackshots(
  packId: string,
  products: Record<string, { slug: string; lang?: string | null; image?: string | null }>,
  opts?: { productsDir?: string },
): number {
  let filled = 0;
  for (const entry of Object.values(products)) {
    const next = resolveSealedPackshotUrl({
      packId,
      slug: entry.slug,
      lang: entry.lang,
      fallback: entry.image,
      productsDir: opts?.productsDir,
    });
    if (!next) continue;
    if (entry.image === next) continue;
    // Only fill holes — don't rewrite a working index URL during backfill.
    if (entry.image?.trim()) continue;
    entry.image = next;
    filled += 1;
  }
  return filled;
}
