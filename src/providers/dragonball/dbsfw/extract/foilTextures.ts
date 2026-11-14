/**
 * Dump shared Fusion World foil plates as WebP + S3TC (DXT) sidecars.
 * Mac StandaloneOSX ships DXT1/DXT5 — same pattern as Lorcana ASTC sidecars.
 * BC7 (CardHologram) stays raster-only: WebGL has no portable BC7 upload here.
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

import type { FoilS3tcBinding } from "@/core/render/foil/types";
import { writeLosslessRgbaWebp } from "@/lib/media/losslessWebp";
import {
  resolveAssetManager,
  resourceBlobsFromAssetManager,
} from "@/lib/unity/loadUnityFs";
import {
  TextureFormat,
  dxtMipByteSize,
  pixelsFromTextureObject,
  rgbaFromTexture2DObject,
  textureFormatId,
  webglS3tcFormat,
} from "@/lib/unity/texture2d";

export type DbsFwFoilTextureTarget = {
  /** Unity Texture2D name in the bundle. */
  unityName: string;
  /** Raster filename under `foil/textures/` (existing client-* naming). */
  webp: string;
  /** Prefer this bundle when the name appears in several. */
  preferBundle?: "shader" | "materials" | "premiumtex";
};

/** WebP basename under `foil/textures/` for a Unity Texture2D name. */
export function clientFoilWebpName(unityName: string): string {
  const slug = unityName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `client-${slug}.webp`;
}

/**
 * Shared-bundle names that are foil / holo / effects-layer plates (not UI chrome).
 * Used when discovering beyond the hand-listed playroom seeds.
 */
export function isSharedFoilPlateName(unityName: string): boolean {
  const n = unityName.trim().toLowerCase();
  if (!n) return false;
  return /holo|foil|pakipaki|rainbow|hologram|tabac|energy_holo|ef_mask|holomap|cardframemask|uv_|ef_flash|ef_flame|ef_fire|ef_cloud|ef_ocian|ef_petal|ef_rock|ef_thunder|ef_tubu|ef_uzu|uv_dist|uv_line|uv_pattern|uv_shine|uv_smoke|uv_water/.test(
    n,
  );
}

/**
 * Plates already listed in {@link DBS_FW_CLIENT_RENDERS} + shared Frost maps.
 * Extract also dump-discovers premiumtex + other shared foil-named plates.
 */
export const DBS_FW_FOIL_TEXTURE_TARGETS: readonly DbsFwFoilTextureTarget[] = [
  { unityName: "HoloMap", webp: "client-holomap.webp", preferBundle: "shader" },
  {
    unityName: "HoloMap_PARA",
    webp: "client-holomap-para.webp",
    preferBundle: "shader",
  },
  {
    unityName: "HoloRainbow",
    webp: "client-holorainbow.webp",
    preferBundle: "shader",
  },
  {
    unityName: "PakipakiFoil",
    webp: "client-pakipakifoil.webp",
    preferBundle: "shader",
  },
  {
    unityName: "CardFrameMask",
    webp: "client-cardframemask.webp",
    preferBundle: "shader",
  },
  {
    unityName: "CardHologram",
    webp: "client-cardhologram.webp",
    preferBundle: "shader",
  },
  {
    unityName: "Tabac_Holo",
    webp: "client-tabac-holo.webp",
    preferBundle: "materials",
  },
  {
    unityName: "Energy_holo_map",
    webp: "client-energy-holo-map.webp",
    preferBundle: "materials",
  },
  {
    unityName: "Energy_holo_Texture",
    webp: "client-energy-holo-texture.webp",
    preferBundle: "materials",
  },
  {
    unityName: "HoloMap_main",
    webp: "client-holomap-main.webp",
    preferBundle: "materials",
  },
  {
    unityName: "HoloMap_main2",
    webp: "client-holomap-main2.webp",
    preferBundle: "materials",
  },
  {
    unityName: "HoloMap_main3",
    webp: "client-holomap-main3.webp",
    preferBundle: "materials",
  },
  {
    unityName: "ef_mask00",
    webp: "client-ef-mask00.webp",
    preferBundle: "materials",
  },
  {
    unityName: "ef_mask01",
    webp: "client-ef-mask01.webp",
    preferBundle: "materials",
  },
  {
    unityName: "ef_mask02",
    webp: "client-ef-mask02.webp",
    preferBundle: "materials",
  },
  {
    unityName: "ef_mask03",
    webp: "client-ef-mask03.webp",
    preferBundle: "materials",
  },
  {
    unityName: "ef_mask02_CF",
    webp: "client-ef-mask02-cf.webp",
    preferBundle: "materials",
  },
  {
    unityName: "ef_mask03_CF",
    webp: "client-ef-mask03-cf.webp",
    preferBundle: "materials",
  },
  {
    unityName: "ST01-004_PARA_Front",
    webp: "client-st01-004-para-front.webp",
    preferBundle: "materials",
  },
  {
    unityName: "ST01-004_PARA_Holo",
    webp: "client-st01-004-para-holo.webp",
    preferBundle: "materials",
  },
  {
    unityName: "ST01-004_PARA_Holo_Field",
    webp: "client-st01-004-para-holo-field.webp",
    preferBundle: "materials",
  },
  {
    unityName: "ST01-004_PARA_Foil_En",
    webp: "client-st01-004-para-foil-en.webp",
    preferBundle: "materials",
  },
  {
    unityName: "ST01-020_Card",
    webp: "client-st01-020-card.webp",
    preferBundle: "materials",
  },
  {
    unityName: "E-111_PARA_Front",
    webp: "client-e-111-para-front.webp",
    preferBundle: "materials",
  },
  {
    unityName: "E-111_PARA_Holo",
    webp: "client-e-111-para-holo.webp",
    preferBundle: "materials",
  },
  {
    unityName: "E-106_PARA_Front",
    webp: "client-e-106-para-front.webp",
    preferBundle: "materials",
  },
  {
    unityName: "FW_E-106_PARA_Holo",
    webp: "client-fw-e-106-para-holo.webp",
    preferBundle: "materials",
  },
  {
    unityName: "FB01-139_SUPERPARA_Front",
    webp: "client-fb01-139-superpara-front.webp",
    preferBundle: "materials",
  },
  {
    unityName: "FB01-139_SUPERPARA_Foil_En",
    webp: "client-fb01-139-superpara-foil-en.webp",
    preferBundle: "materials",
  },
];

const BUNDLE_FILES = {
  shader: "packdata_assets_shader.bundle",
  materials: "packdata_assets_card_materials.bundle",
  premiumtex: "packdata_assets_card_premiumtex.bundle",
} as const;

type TexHit = {
  bundleKey: keyof typeof BUNDLE_FILES;
  tex: {
    name?: string;
    width?: number;
    height?: number;
    m_ColorSpace?: number;
  };
  resourceBlobs: Map<string, Uint8Array>;
};

export type DbsFwFoilTextureExtractStats = {
  targets: number;
  webpWritten: number;
  s3tcWritten: number;
  skippedBc7: number;
  /** Shared plates discovered beyond the hand-listed seed targets. */
  discovered: number;
  missing: string[];
};

function s3tcExt(format: number): string | null {
  if (format === TextureFormat.DXT1) return "dxt1";
  if (format === TextureFormat.DXT5) return "dxt5";
  return null;
}

function generateSidecarModule(
  byWebp: Record<string, FoilS3tcBinding>,
): string {
  const body = JSON.stringify(byWebp, null, 2);
  return `/**
 * AUTO-GENERATED by extractFusionWorldFoilTextures — do not edit by hand.
 * Mac StandaloneOSX DXT dumps for FoilTextureBinding.s3tc (Lorcana ASTC twin).
 */
import type { FoilS3tcBinding } from "@/core/render/foil/types";

export const DBS_FW_S3TC_BY_WEBP: Record<string, FoilS3tcBinding> = ${body};
`;
}

async function loadBundleFile(
  bundlesDir: string,
  fileName: string,
  bundleKey: TexHit["bundleKey"] | "series",
): Promise<Map<string, TexHit>> {
  const path = join(bundlesDir, fileName);
  if (!existsSync(path)) return new Map();
  const am = await resolveAssetManager(readFileSync(path), {
    enableTypeTree: false,
  });
  const resourceBlobs = resourceBlobsFromAssetManager(am);
  const byName = new Map<string, TexHit>();
  for (const info of am.getObjectInfosByClass("Texture2D")) {
    const tex = info.object as TexHit["tex"];
    const name = String(info.name ?? tex.name ?? "");
    if (!name) continue;
    byName.set(name, {
      bundleKey: bundleKey === "series" ? "materials" : bundleKey,
      tex,
      resourceBlobs,
    });
  }
  return byName;
}

async function loadBundle(
  bundlesDir: string,
  key: keyof typeof BUNDLE_FILES,
): Promise<{
  byName: Map<string, TexHit>;
}> {
  return {
    byName: await loadBundleFile(bundlesDir, BUNDLE_FILES[key], key),
  };
}

/** Card-series bundles that hold per-print foil plates (E-111, FB01-139, …). */
function seriesBundleHints(unityName: string): string[] {
  const lower = unityName.toLowerCase().replace(/_/g, "-");
  const hints: string[] = [];
  if (lower.includes("e-111")) hints.push("e-111");
  if (lower.includes("e-106")) hints.push("e-106");
  if (lower.includes("fb01-139")) hints.push("fb01-139");
  if (lower.includes("st01-004")) hints.push("st01-004");
  if (lower.includes("st01-020")) hints.push("st01-020");
  // Shared ef_mask* live on superpara / para card series, not card_materials.
  if (lower.startsWith("ef-mask") || lower.startsWith("ef_mask")) {
    hints.push("fb01-139_superpara", "fb01-139");
  }
  return hints;
}

function mergeFoilTargets(
  seeds: readonly DbsFwFoilTextureTarget[],
  bundles: Record<keyof typeof BUNDLE_FILES, { byName: Map<string, TexHit> }>,
): { targets: DbsFwFoilTextureTarget[]; discovered: number } {
  const byUnity = new Map<string, DbsFwFoilTextureTarget>();
  for (const seed of seeds) {
    byUnity.set(seed.unityName, seed);
  }
  let discovered = 0;
  const discover = (
    key: keyof typeof BUNDLE_FILES,
    filter: (name: string) => boolean,
  ) => {
    for (const name of bundles[key].byName.keys()) {
      if (!filter(name) || byUnity.has(name)) continue;
      byUnity.set(name, {
        unityName: name,
        webp: clientFoilWebpName(name),
        preferBundle: key,
      });
      discovered += 1;
    }
  };
  // Entire premiumtex library feeds Frost _EffectsLayer* slots.
  discover("premiumtex", () => true);
  discover("shader", isSharedFoilPlateName);
  discover("materials", isSharedFoilPlateName);
  return { targets: [...byUnity.values()], discovered };
}

/**
 * Write raster (+ S3TC when DXT) for every known + discovered foil plate,
 * and regenerate `src/effects/dbsfw/s3tcSidecars.generated.ts`.
 */
export async function extractFusionWorldFoilTextures(opts: {
  bundlesDir: string;
  texturesDir: string;
  sidecarModulePath: string;
  force?: boolean;
}): Promise<DbsFwFoilTextureExtractStats> {
  mkdirSync(opts.texturesDir, { recursive: true });
  const bundles = {
    shader: await loadBundle(opts.bundlesDir, "shader"),
    materials: await loadBundle(opts.bundlesDir, "materials"),
    premiumtex: await loadBundle(opts.bundlesDir, "premiumtex"),
  };
  const seriesCache = new Map<string, Map<string, TexHit>>();
  const seriesFiles = readdirSync(opts.bundlesDir).filter((n) =>
    n.startsWith("packdata_assets_card_series_"),
  );

  const { targets, discovered } = mergeFoilTargets(
    DBS_FW_FOIL_TEXTURE_TARGETS,
    bundles,
  );

  const stats: DbsFwFoilTextureExtractStats = {
    targets: targets.length,
    webpWritten: 0,
    s3tcWritten: 0,
    skippedBc7: 0,
    discovered,
    missing: [],
  };
  const byWebp: Record<string, FoilS3tcBinding> = {};

  for (const target of targets) {
    const order: (keyof typeof BUNDLE_FILES)[] = target.preferBundle
      ? [
          target.preferBundle,
          ...(["shader", "materials", "premiumtex"] as const).filter(
            (k) => k !== target.preferBundle,
          ),
        ]
      : ["shader", "materials", "premiumtex"];
    let hit: TexHit | undefined;
    for (const key of order) {
      hit = bundles[key].byName.get(target.unityName);
      if (hit) break;
    }
    if (!hit) {
      for (const hint of seriesBundleHints(target.unityName)) {
        const matches = seriesFiles.filter((n) =>
          n.toLowerCase().includes(hint),
        );
        for (const file of matches) {
          let map = seriesCache.get(file);
          if (!map) {
            map = await loadBundleFile(opts.bundlesDir, file, "series");
            seriesCache.set(file, map);
          }
          hit = map.get(target.unityName);
          if (hit) break;
        }
        if (hit) break;
      }
    }
    if (!hit) {
      stats.missing.push(target.unityName);
      continue;
    }

    const w = Number(hit.tex.width ?? 0);
    const h = Number(hit.tex.height ?? 0);
    const fmt = textureFormatId(hit.tex as never);
    const webpPath = join(opts.texturesDir, target.webp);

    if (opts.force || !existsSync(webpPath)) {
      const decoded = await rgbaFromTexture2DObject(
        hit.tex as never,
        target.unityName,
        { resourceBlobs: hit.resourceBlobs },
      );
      if (decoded) {
        await writeLosslessRgbaWebp(
          decoded.rgba,
          decoded.width,
          decoded.height,
          webpPath,
        );
        stats.webpWritten += 1;
        // Frost Card does `1.0 - HoloMask.x`. PARA_Holo dumps are sparse white
        // on black (foil accents); write an inverted sibling for HoloMask bind.
        if (/_PARA_Holo$/i.test(target.unityName)) {
          const invPath = join(
            opts.texturesDir,
            target.webp.replace(/\.webp$/i, "mask.webp"),
          );
          if (opts.force || !existsSync(invPath)) {
            const inv = Buffer.from(decoded.rgba);
            for (let i = 0; i < inv.length; i += 4) {
              inv[i] = 255 - inv[i]!;
              inv[i + 1] = 255 - inv[i + 1]!;
              inv[i + 2] = 255 - inv[i + 2]!;
            }
            await writeLosslessRgbaWebp(
              inv,
              decoded.width,
              decoded.height,
              invPath,
            );
            stats.webpWritten += 1;
          }
        }
      }
    }

    if (fmt === TextureFormat.BC7) {
      stats.skippedBc7 += 1;
      continue;
    }
    const ext = fmt != null ? s3tcExt(fmt) : null;
    const srgb = Number(hit.tex.m_ColorSpace ?? 0) === 1;
    const glFmt = fmt != null ? webglS3tcFormat(fmt, srgb) : null;
    if (!ext || !glFmt || !w || !h) continue;

    const payload = pixelsFromTextureObject(
      hit.tex as never,
      hit.resourceBlobs,
    );
    const mip0 = dxtMipByteSize(w, h, fmt!);
    if (!payload || payload.byteLength < mip0 || mip0 <= 0) continue;

    const s3tcFile = target.webp.replace(/\.webp$/i, `.${ext}`);
    const s3tcPath = join(opts.texturesDir, s3tcFile);
    writeFileSync(s3tcPath, Buffer.from(payload.subarray(0, mip0)));
    stats.s3tcWritten += 1;
    byWebp[target.webp] = {
      file: s3tcFile,
      width: w,
      height: h,
      format: glFmt,
    };
  }

  writeFileSync(opts.sidecarModulePath, generateSidecarModule(byWebp), "utf8");
  return stats;
}
