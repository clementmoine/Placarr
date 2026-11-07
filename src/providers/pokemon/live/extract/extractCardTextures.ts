/**
 * Extract Live card-bundle Texture2D faces/masks → lossless WebP (ADR-021 B).
 * Mirrors ``extract_card_bundle`` texture path in ``unity/extract.py``.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import {
  cropCardRgba,
  loadUvRectFromJson,
  type UvRect,
} from "@/lib/unity/cardCrop";
import { writeLosslessRgbaWebp } from "@/lib/media/losslessWebp";
import { parseMaterialManifests } from "@/lib/unity/materialManifest";
import { decodeTexturesFromUnityFs } from "@/lib/unity/texture2d";

export type TextureMode = "cards" | "masks" | "all" | "none";

export type MaterialManifestRow = {
  bundle: string;
  variant: "std" | "ph";
  shaderPath: string;
  foil: string;
  cardTex: string;
  maskTex: string;
  matPath: string;
  coldFoil: string;
  etch: string;
};

const BUNDLE_STEM_RE =
  /^([a-z0-9.-]+)_([a-z]{2,4})_(\d{3})(?:_[a-z]+)?$/i;

/** ``cards/{set}/{lang}/{num}`` — mirrors Python ``card_face_dir``. */
export function cardFaceDir(cardsRoot: string, bundleName: string): string {
  const m = BUNDLE_STEM_RE.exec(bundleName);
  if (!m) return path.join(cardsRoot, "_unparsed", bundleName);
  return path.join(
    cardsRoot,
    m[1]!.toLowerCase(),
    m[2]!.toLowerCase(),
    m[3]!,
  );
}

/** Mirrors ``canonical_face_filename`` in ``extract.py``. */
export function canonicalFaceFilename(
  bundleStem: string,
  texName: string,
  opts: { asArt?: boolean; asMask?: boolean } = {},
): string {
  const base = path.parse(texName).name.toLowerCase();
  const stem = bundleStem.toLowerCase();
  if (base.includes("_etch_")) return "etch.webp";
  if (base.includes("_wp_mph_")) return "mask-mph.webp";
  if (base.includes("_wp_sph_")) return "mask-sph.webp";
  if (base.includes("_wp_ph_")) return "mask-ph.webp";
  if (base.includes("_wp_")) return "mask.webp";
  if (opts.asArt || base === stem) return "art.webp";
  if (opts.asMask) return "mask.webp";
  return `extra-${path.parse(texName).name}.webp`;
}

export function canonicalMaskTexName(name: string): string {
  return (name || "").trim().replace(/_pcd_wp_/g, "_wp_pcd_");
}

export function reconcileMaskTex(
  maskTex: string,
  available: ReadonlySet<string>,
): string {
  const m = (maskTex || "").trim();
  if (!m) return "";
  if (available.has(m)) return m;
  const alt = canonicalMaskTexName(m);
  if (alt !== m && available.has(alt)) return alt;
  const rev = m.replace(/_wp_pcd_/g, "_pcd_wp_");
  if (rev !== m && available.has(rev)) return rev;
  return "";
}

function textureKeyCi(
  textures: ReadonlyMap<string, unknown>,
  name: string,
): string | null {
  if (textures.has(name)) return name;
  const lower = name.toLowerCase();
  for (const key of textures.keys()) {
    if (key.toLowerCase() === lower) return key;
  }
  return null;
}

function migratePngBeside(webpDest: string): boolean {
  try {
    if (existsSync(webpDest) && readFileSync(webpDest).byteLength > 0) {
      return true;
    }
  } catch {
    /* fall through */
  }
  const png = webpDest.replace(/\.webp$/i, ".png");
  if (!existsSync(png)) return false;
  // Leave PNG migration to a later pass — rare; force re-dump.
  return false;
}

export function loadUvRectFile(packFoilDir: string): UvRect | null {
  const p = path.join(packFoilDir, "card-uv-rect.json");
  if (!existsSync(p)) return null;
  try {
    return loadUvRectFromJson(JSON.parse(readFileSync(p, "utf8")));
  } catch {
    return null;
  }
}

export type ExtractCardBundleResult = {
  rows: MaterialManifestRow[];
  written: string[];
};

/**
 * Decode one card UnityFS → MaterialManifest rows + optional WebP faces.
 */
export async function extractCardBundleTextures(
  bundlePath: string,
  texturesDir: string,
  opts: {
    textureMode?: TextureMode;
    cropRect?: UvRect | null;
  } = {},
): Promise<ExtractCardBundleResult> {
  const textureMode = opts.textureMode ?? "cards";
  const data = readFileSync(bundlePath);
  const bundleStem = path.basename(bundlePath);
  const manifests = parseMaterialManifests(data);
  const rows: MaterialManifestRow[] = manifests.map((m) => ({
    bundle: bundleStem,
    variant: m.name.endsWith("_ph") ? "ph" : "std",
    shaderPath: m._s ?? "",
    foil: m._f ?? "",
    cardTex: m._c ?? "",
    maskTex: m._w ?? "",
    matPath: m._p ?? "",
    coldFoil: m._cf ?? "",
    etch: m._e ?? "",
  }));

  const textures = decodeTexturesFromUnityFs(data);
  const byName = new Map(textures.map((t) => [t.name, t]));
  const textureNames = new Set(byName.keys());

  for (const row of rows) {
    row.maskTex = reconcileMaskTex(row.maskTex, textureNames);
    row.etch = reconcileMaskTex(row.etch, textureNames);
    row.coldFoil = reconcileMaskTex(row.coldFoil, textureNames);
  }

  if (textureMode === "none") {
    return { rows, written: [] };
  }

  const artTexes = new Set<string>();
  const maskTexes = new Set<string>();
  let wanted: Set<string> | null = null;
  if (textureMode === "masks" || textureMode === "cards") {
    wanted = new Set();
    const keys =
      textureMode === "masks"
        ? (["maskTex", "etch", "coldFoil"] as const)
        : (["maskTex", "etch", "coldFoil", "cardTex"] as const);
    for (const row of rows) {
      for (const key of keys) {
        const value = String(row[key] || "").trim();
        if (!value) continue;
        wanted.add(value);
        const resolved = textureKeyCi(byName, value);
        if (resolved) wanted.add(resolved);
        const alt = canonicalMaskTexName(value);
        if (alt !== value) {
          wanted.add(alt);
          const altResolved = textureKeyCi(byName, alt);
          if (altResolved) wanted.add(altResolved);
        }
        if (key === "maskTex") {
          maskTexes.add(value.toLowerCase());
          if (resolved) maskTexes.add(resolved.toLowerCase());
          if (alt !== value) {
            maskTexes.add(alt.toLowerCase());
            if (textureKeyCi(byName, alt)) {
              maskTexes.add(textureKeyCi(byName, alt)!.toLowerCase());
            }
          }
        }
        if (textureMode === "cards" && key === "cardTex") {
          artTexes.add(value.toLowerCase());
          if (resolved) artTexes.add(resolved.toLowerCase());
        }
      }
    }
    if (textureMode === "cards" && wanted.size === 0) {
      const stemKey = textureKeyCi(byName, bundleStem);
      if (stemKey) {
        wanted.add(stemKey);
        artTexes.add(stemKey.toLowerCase());
      } else if (byName.size === 1) {
        const only = [...byName.keys()][0]!;
        wanted.add(only);
        artTexes.add(only.toLowerCase());
      } else {
        return { rows, written: [] };
      }
    }
  }

  mkdirSync(texturesDir, { recursive: true });
  const written: string[] = [];
  const cropRect = opts.cropRect ?? null;

  for (const [name, tex] of byName) {
    if (wanted && !wanted.has(name)) continue;
    const dest = path.join(
      texturesDir,
      canonicalFaceFilename(bundleStem, name, {
        asArt: artTexes.has(name.toLowerCase()),
        asMask: maskTexes.has(name.toLowerCase()),
      }),
    );
    if (migratePngBeside(dest)) {
      written.push(dest);
      continue;
    }
    const cropped = cropCardRgba(tex.rgba, tex.width, tex.height, cropRect);
    await writeLosslessRgbaWebp(cropped.rgba, cropped.width, cropped.height, dest);
    written.push(dest);
  }

  return { rows, written };
}

export const EXTRACT_SIDECAR = ".extract-manifest.json";

export type ExtractSidecar = {
  bundleMtime: number;
  textureMode: string;
  rows: MaterialManifestRow[];
  /** CDN AssetManifest Hash128 recorded when faces were last written. */
  bundleHash?: string;
  /** Byte size of the UnityFS bundle at extract time. */
  bundleSize?: number;
};

export function writeExtractSidecar(
  faceDir: string,
  bundleMtime: number,
  textureMode: string,
  rows: MaterialManifestRow[],
  opts?: { bundleHash?: string | null; bundleSize?: number },
): void {
  mkdirSync(faceDir, { recursive: true });
  const payload: ExtractSidecar = {
    bundleMtime,
    textureMode,
    rows,
    ...(opts?.bundleHash ? { bundleHash: opts.bundleHash } : {}),
    ...(opts?.bundleSize != null && Number.isFinite(opts.bundleSize)
      ? { bundleSize: opts.bundleSize }
      : {}),
  };
  writeFileSync(
    path.join(faceDir, EXTRACT_SIDECAR),
    `${JSON.stringify(payload)}\n`,
    "utf8",
  );
}

export function readExtractSidecarMeta(faceDir: string): ExtractSidecar | null {
  const dest = path.join(faceDir, EXTRACT_SIDECAR);
  if (!existsSync(dest)) return null;
  try {
    const parsed = JSON.parse(readFileSync(dest, "utf8")) as Partial<ExtractSidecar>;
    if (!Array.isArray(parsed.rows)) return null;
    return {
      bundleMtime: Number(parsed.bundleMtime) || 0,
      textureMode: String(parsed.textureMode ?? ""),
      rows: parsed.rows,
      ...(parsed.bundleHash ? { bundleHash: String(parsed.bundleHash) } : {}),
      ...(parsed.bundleSize != null && Number.isFinite(Number(parsed.bundleSize))
        ? { bundleSize: Number(parsed.bundleSize) }
        : {}),
    };
  } catch {
    return null;
  }
}

export function readExtractSidecar(
  faceDir: string,
): MaterialManifestRow[] | null {
  return readExtractSidecarMeta(faceDir)?.rows ?? null;
}

/**
 * Whether on-disk faces still match the UnityFS bundle.
 *
 * Order of trust:
 * 1. CDN AssetManifest Hash128 recorded on the sidecar (stable across
 *    re-downloads of the same bytes).
 * 2. Sidecar stamped for this exact bundle mtime — an extract may keep an
 *    existing `art.webp` (`migratePngBeside`) without bumping its mtime, so
 *    comparing art→bundle clocks alone falsely re-decodes tens of thousands
 *    of cards on every Sync.
 * 3. Art file newer than the bundle (legacy heuristic).
 */
export function isCardTextureExtractFresh(input: {
  artPath: string;
  bundleMtimeSec: number;
  bundleSize: number;
  textureMode: TextureMode;
  sidecar: ExtractSidecar | null;
  /** Current AssetManifest Hash128 for this stem, when known. */
  bundleHash?: string | null;
}): boolean {
  if (input.textureMode === "none") return false;
  if (!existsSync(input.artPath)) return false;
  const hash = input.bundleHash?.trim() || null;
  if (hash && input.sidecar?.bundleHash === hash) return true;
  if (
    input.sidecar?.rows?.length &&
    Number.isFinite(input.sidecar.bundleMtime) &&
    Math.abs(input.sidecar.bundleMtime - input.bundleMtimeSec) < 0.01
  ) {
    return true;
  }
  try {
    if (statSync(input.artPath).mtimeMs / 1000 >= input.bundleMtimeSec) {
      return true;
    }
  } catch {
    return false;
  }
  return false;
}
