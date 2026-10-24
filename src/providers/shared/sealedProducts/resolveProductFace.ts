/**
 * `/assets/<pack>/products/{slug}/{lang}/{face|thumb|back|logo}` — same
 * contract as print roles: basename stays on disk (`art.*` / `back.*` /
 * `logo.*` + `face.json`), URL never embeds the dump name.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { AssetsSealedProductRole } from "@/lib/packAssetUrls";
import { packSealedProductsDir } from "@/lib/packPaths";
import {
  CARD_FACE_DECISION_FILE,
  type FaceDecision,
} from "@/providers/shared/cardFaces";
import { catalogueFaceSourceRank } from "@/lib/admin/catalogueFacePick";

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
      const rankDiff =
        catalogueFaceSourceRank(b) - catalogueFaceSourceRank(a);
      return rankDiff !== 0 ? rankDiff : a.localeCompare(b);
    });
}

function readDecision(dir: string): FaceDecision {
  try {
    const raw: unknown = JSON.parse(
      readFileSync(path.join(dir, CARD_FACE_DECISION_FILE), "utf8"),
    );
    return raw && typeof raw === "object" ? (raw as FaceDecision) : {};
  } catch {
    return {};
  }
}

/**
 * Pick on-disk file for a sealed SKU role.
 * - `face` / `thumb` → `face.json.art` else best `art.*` (thumb falls back to face)
 * - `back` → `face.json.back` else best `back.*`
 * - `logo` → `face.json.logo` else best `logo.*`
 */
export function resolveSealedProductFace(input: {
  packId: string;
  slug: string;
  lang: string;
  role: AssetsSealedProductRole;
  productsDir?: string;
}): SealedProductFaceHit | null {
  const slug = input.slug.trim();
  const lang = input.lang.trim().toLowerCase() || "fr";
  if (!slug) return null;
  const productsDir =
    input.productsDir ?? packSealedProductsDir(input.packId);
  const dir = path.join(productsDir, slug, lang);
  if (!existsSync(dir)) return null;

  const decision = readDecision(dir);
  const role = input.role;

  const pickNamed = (named: string | undefined, prefix: string) => {
    const file = named?.trim();
    if (!file) return null;
    const full = path.join(dir, file);
    if (!existsSync(full)) return null;
    if (!file.toLowerCase().startsWith(prefix)) return null;
    return file;
  };

  let artFile: string | null = null;
  if (role === "face" || role === "thumb") {
    artFile =
      pickNamed(decision.art, "art.") ?? filesWithPrefix(dir, "art.")[0] ?? null;
  } else if (role === "back") {
    artFile =
      pickNamed(decision.back, "back.") ??
      filesWithPrefix(dir, "back.")[0] ??
      null;
  } else if (role === "logo") {
    artFile =
      pickNamed(decision.logo, "logo.") ??
      filesWithPrefix(dir, "logo.")[0] ??
      null;
  }

  if (!artFile) return null;
  return {
    filePath: path.join(dir, artFile),
    artFile,
    role,
    disk: { slug, lang },
  };
}

/** Record winners next to dumps — same sidecar as card faces. */
export function writeSealedProductFaceDecision(
  destDir: string,
  decision: { art?: string | null; back?: string | null; logo?: string | null },
): void {
  const next: FaceDecision = {};
  if (decision.art?.trim()) next.art = decision.art.trim();
  if (decision.back?.trim()) next.back = decision.back.trim();
  if (decision.logo?.trim()) next.logo = decision.logo.trim();
  if (!Object.keys(next).length) return;

  const file = path.join(destDir, CARD_FACE_DECISION_FILE);
  let current: FaceDecision = {};
  let previous = "";
  try {
    previous = readFileSync(file, "utf8");
    current = JSON.parse(previous) as FaceDecision;
  } catch {
    /* first decision */
  }
  const merged = { ...current, ...next };
  const body = `${JSON.stringify(merged, null, 2)}\n`;
  if (previous === body) return;
  writeFileSync(file, body, "utf8");
}
