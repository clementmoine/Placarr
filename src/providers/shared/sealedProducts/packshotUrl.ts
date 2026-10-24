/**
 * Packshot URL for a sealed SKU — role URLs (`…/face`), never embed `art.*`
 * basenames. Disk ranking stays in `face.json` + dumps.
 */
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

import {
  ASSETS_URL_PREFIX,
  assetsSealedProductRoleUrl,
  canonicalAssetPack,
  rewriteAssetPackUrl,
} from "@/lib/packAssetUrls";
import { packSealedProductsDir } from "@/lib/packPaths";

import { resolveSealedLang } from "./lang";
import { resolveSealedProductFace } from "./resolveProductFace";

function langFolder(lang: string | null | undefined, slug: string): string {
  return resolveSealedLang({ lang, slug })?.trim().toLowerCase() || "fr";
}

function hasArtDump(dir: string): boolean {
  if (!existsSync(dir)) return false;
  return readdirSync(dir).some((name) => /^art\./i.test(name));
}

/** True when a sealed product role (or legacy file URL) still resolves. */
function sealedProductAssetExists(
  packId: string,
  assetUrl: string,
  productsDir: string,
): boolean {
  const rewritten = rewriteAssetPackUrl(assetUrl);
  const prefix = `${ASSETS_URL_PREFIX}/${canonicalAssetPack(packId)}/products/`;
  if (!rewritten.startsWith(prefix)) return false;
  const rel = rewritten
    .slice(prefix.length)
    .split("/")
    .map((part) => {
      try {
        return decodeURIComponent(part);
      } catch {
        return part;
      }
    });
  if (!rel.length || rel.some((part) => !part || part === ".." || part === ".")) {
    return false;
  }
  // Role URL: products/{slug}/{lang}/face
  if (rel.length === 3 && /^(face|thumb|back|logo)$/i.test(rel[2]!)) {
    return Boolean(
      resolveSealedProductFace({
        packId,
        slug: rel[0]!,
        lang: rel[1]!,
        role: rel[2]!.toLowerCase() as "face" | "thumb" | "back" | "logo",
        productsDir,
      }),
    );
  }
  return existsSync(path.join(productsDir, ...rel));
}

/**
 * Absolute `/assets/…/products/{slug}/{lang}/face` URL, or `null` when
 * nothing is on disk.
 */
export function resolveSealedPackshotUrl(input: {
  packId: string;
  slug: string;
  lang?: string | null;
  /** Index / listing image — kept only to detect stale 404 filenames. */
  fallback?: string | null;
  productsDir?: string;
}): string | null {
  const slug = input.slug.trim();
  if (!slug) return null;
  const lang = langFolder(input.lang, slug);
  const productsDir = input.productsDir ?? packSealedProductsDir(input.packId);
  const dir = path.join(productsDir, slug, lang);

  const hit = resolveSealedProductFace({
    packId: input.packId,
    slug,
    lang,
    role: "face",
    productsDir,
  });
  if (hit) {
    return assetsSealedProductRoleUrl(input.packId, slug, lang, "face");
  }

  // No dump on disk — keep a still-valid legacy fallback URL if any.
  const fallback = input.fallback?.trim()
    ? rewriteAssetPackUrl(input.fallback)
    : null;
  if (
    fallback &&
    sealedProductAssetExists(input.packId, fallback, productsDir)
  ) {
    // Legacy filename URL that still exists → promote to role URL when art.* present
    if (hasArtDump(dir)) {
      return assetsSealedProductRoleUrl(input.packId, slug, lang, "face");
    }
    return fallback;
  }
  return null;
}

/**
 * Remplit `entry.image` avec l'URL rôle `/face` dès qu'un dump existe.
 * Mutates `products` in place.
 */
export function backfillSealedProductPackshots(
  packId: string,
  products: Record<
    string,
    {
      slug: string;
      lang?: string | null;
      image?: string | null;
      imageBack?: string | null;
      setLogo?: string | null;
    }
  >,
  opts?: { productsDir?: string },
): number {
  let filled = 0;
  const productsDir = opts?.productsDir;
  for (const entry of Object.values(products)) {
    const lang = langFolder(entry.lang, entry.slug);
    const face = resolveSealedPackshotUrl({
      packId,
      slug: entry.slug,
      lang: entry.lang,
      fallback: entry.image,
      productsDir,
    });
    if (face && entry.image !== face) {
      entry.image = face;
      filled += 1;
    }
    const backHit = resolveSealedProductFace({
      packId,
      slug: entry.slug,
      lang,
      role: "back",
      productsDir,
    });
    if (backHit) {
      const backUrl = assetsSealedProductRoleUrl(
        packId,
        entry.slug,
        lang,
        "back",
      );
      if (entry.imageBack !== backUrl) {
        entry.imageBack = backUrl;
        filled += 1;
      }
    }
    const logoHit = resolveSealedProductFace({
      packId,
      slug: entry.slug,
      lang,
      role: "logo",
      productsDir,
    });
    if (logoHit) {
      const logoUrl = assetsSealedProductRoleUrl(
        packId,
        entry.slug,
        lang,
        "logo",
      );
      if (entry.setLogo !== logoUrl) {
        entry.setLogo = logoUrl;
        filled += 1;
      }
    }
  }
  return filled;
}
