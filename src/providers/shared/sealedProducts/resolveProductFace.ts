/**
 * `/assets/<pack>/products/{slug}/{lang}/{face|thumb|back|logo}` — same
 * contract as print roles: basename stays on disk (`art.*` / `back.*` /
 * `logo.*`), URL never embeds the dump name. Ranking = catalogue criteria;
 * `face.json` is audit trail only.
 */
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

import { catalogueFaceRankScore } from "@/core/enrich/media/catalogueFaceRank";
import { resolveFaceArtMetaForDig } from "@/core/enrich/media/faceArtMeta";
import type { AssetsSealedProductRole } from "@/lib/packAssetUrls";
import { packSealedProductsDir } from "@/lib/packPaths";
import { resolveSealedLang } from "./lang";

export type SealedProductFaceHit = {
  filePath: string;
  artFile: string;
  role: AssetsSealedProductRole;
  disk: { slug: string; lang: string };
};

const ROLE_RE = /^(face|thumb|back|logo)$/;

function safeSegment(value: string): boolean {
  return Boolean(value) && !value.includes("..") && !value.includes("/");
}

/**
 * Preferred: `products / {slug} / {lang} / role`
 */
export function matchSealedProductsAssetRest(
  rest: readonly string[],
): { slug: string; lang: string; role: AssetsSealedProductRole } | null {
  if (rest[0] !== "products" || rest.length !== 4) return null;
  const slug = decodeURIComponent(rest[1] ?? "").trim();
  const lang = decodeURIComponent(rest[2] ?? "").trim().toLowerCase();
  const roleRaw = (rest[3] ?? "").trim().toLowerCase();
  if (!safeSegment(slug) || !safeSegment(lang) || !ROLE_RE.test(roleRaw)) {
    return null;
  }
  return { slug, lang, role: roleRaw as AssetsSealedProductRole };
}

function filesWithPrefix(dir: string, prefix: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.toLowerCase().startsWith(prefix.toLowerCase()))
    .sort((a, b) => {
      const metaA = resolveFaceArtMetaForDig({ artFile: a });
      const metaB = resolveFaceArtMetaForDig({ artFile: b });
      return (
        catalogueFaceRankScore({
          artFile: b,
          artKind: metaB.artKind,
          watermarked: metaB.watermarked,
        }) -
          catalogueFaceRankScore({
            artFile: a,
            artKind: metaA.artKind,
            watermarked: metaA.watermarked,
          }) || a.localeCompare(b)
      );
    });
}

/**
 * Pick on-disk file for a sealed SKU role by catalogue criteria.
 * - `face` / `thumb` → best `art.*` (thumb falls back to face)
 * - `back` → best `back.*`
 * - `logo` → best `logo.*`
 */
export function resolveSealedProductFace(input: {
  packId: string;
  slug: string;
  /** Index rows may keep `lang: null` (locale inferred from slug). */
  lang?: string | null;
  role: AssetsSealedProductRole;
  productsDir?: string;
}): SealedProductFaceHit | null {
  const slug = (input.slug ?? "").trim();
  if (!slug) return null;
  const lang =
    resolveSealedLang({ lang: input.lang, slug })?.trim().toLowerCase() || "fr";
  const productsDir =
    input.productsDir ?? packSealedProductsDir(input.packId);
  const dir = path.join(productsDir, slug, lang);
  if (!existsSync(dir)) return null;

  const role = input.role;
  let artFile: string | null = null;
  if (role === "face" || role === "thumb") {
    artFile = filesWithPrefix(dir, "art.")[0] ?? null;
  } else if (role === "back") {
    artFile = filesWithPrefix(dir, "back.")[0] ?? null;
  } else if (role === "logo") {
    artFile = filesWithPrefix(dir, "logo.")[0] ?? null;
  }

  if (!artFile) return null;
  return {
    filePath: path.join(dir, artFile),
    artFile,
    role,
    disk: { slug, lang },
  };
}

