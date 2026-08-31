/**
 * Lorcana shared foil textures → WebP (+ optional ASTC sidecar).
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

import type { AssetManager } from "unityfs-js";

import { writeLosslessRgbaWebp } from "@/lib/media/losslessWebp";
import { cropRgbaRect } from "@/lib/unity/cardCrop";
import {
  resolveAssetManager,
  resourceBlobsFromAssetManager,
} from "@/lib/unity/loadUnityFs";
import {
  astcBlockSize,
  pixelsFromTextureObject,
  rgbaFromTexture2DObject,
  textureFormatId,
  webglAstcFormat,
} from "@/lib/unity/texture2d";
import { LORCANA_UNITY_REVISION } from "@/providers/lorcanatcg/unityRevision";

export type LorcanaUnityBundle = {
  am: AssetManager;
  resourceBlobs: Map<string, Uint8Array>;
};

type UnityTexture = Parameters<typeof textureFormatId>[0] & {
  name?: string;
  width?: number;
  height?: number;
};

export async function loadLorcanaUnityBundle(
  bundlePath: string,
): Promise<LorcanaUnityBundle> {
  const bytes = readFileSync(bundlePath);
  const am = await resolveAssetManager(bytes, {
    enableTypeTree: false,
    unityRevision: LORCANA_UNITY_REVISION,
  });
  return { am, resourceBlobs: resourceBlobsFromAssetManager(am) };
}

async function asBundle(
  bundle: string | LorcanaUnityBundle,
): Promise<LorcanaUnityBundle> {
  return typeof bundle === "string" ? loadLorcanaUnityBundle(bundle) : bundle;
}

function astcLevel0Bytes(
  tex: UnityTexture,
  resourceBlobs: ReadonlyMap<string, Uint8Array>,
): Buffer | null {
  const fmt = textureFormatId(tex);
  if (fmt == null) return null;
  const block = astcBlockSize(fmt);
  if (block == null) return null;
  const w = tex.width ?? 0;
  const h = tex.height ?? 0;
  const data = pixelsFromTextureObject(tex, resourceBlobs);
  if (!data?.byteLength || !w || !h) return null;
  const expected = Math.ceil(w / block) * Math.ceil(h / block) * 16;
  if (data.byteLength < expected) return null;
  return Buffer.from(data.subarray(0, expected));
}

function textureByPathId(
  am: AssetManager,
): Map<string, UnityTexture> {
  const out = new Map<string, UnityTexture>();
  for (const info of am.getObjectInfosByClass("Texture2D")) {
    try {
      out.set(String(info.pathID), info.object as UnityTexture);
    } catch {
      /* skip */
    }
  }
  return out;
}

type SpriteRect = { x: number; y: number; width: number; height: number };

function resolveCardBackSprite(
  am: AssetManager,
  texturesByPath: Map<string, UnityTexture>,
): { tex: UnityTexture; rect: SpriteRect } | null {
  for (const info of am.getObjectInfosByClass("Sprite")) {
    if (String(info.name ?? "").toLowerCase() !== "card_back") continue;
    const spr = info.object as {
      rect?: SpriteRect;
      renderData?: {
        texture?: { pathID?: bigint | number };
        textureRect?: SpriteRect;
      };
      spriteAtlas?: { pathID?: bigint | number };
    };

    const directPid = String(spr.renderData?.texture?.pathID ?? "");
    if (directPid && directPid !== "0") {
      const tex = texturesByPath.get(directPid);
      const rect = spr.renderData?.textureRect ?? spr.rect;
      if (tex && rect) return { tex, rect };
    }

    // Packed into SpriteAtlas — renderData.texture is often pathID 0.
    if (spr.spriteAtlas?.pathID == null) return null;
    const atlasPid = String(spr.spriteAtlas.pathID);
    for (const aInfo of am.getObjectInfosByClass("SpriteAtlas")) {
      if (String(aInfo.pathID) !== atlasPid) continue;
      const atlas = aInfo.object as {
        packedSpriteNamesToIndex?: string[];
        renderDatas?: {
          spriteAtlasData?: {
            texture?: { pathID?: bigint | number };
            textureRect?: SpriteRect;
          };
        }[];
      };
      const idx = (atlas.packedSpriteNamesToIndex ?? []).indexOf("card_back");
      if (idx < 0) return null;
      const sad = atlas.renderDatas?.[idx]?.spriteAtlasData;
      const texPid = String(sad?.texture?.pathID ?? "");
      if (!texPid || texPid === "0" || !sad?.textureRect) return null;
      const tex = texturesByPath.get(texPid);
      if (!tex) return null;
      return { tex, rect: sad.textureRect };
    }
    return null;
  }
  return null;
}

export async function dumpLorcanaTextures(
  bundle: string | LorcanaUnityBundle,
  wanted: Set<string>,
  texturesDir: string,
): Promise<{
  astcByName: Record<string, Record<string, unknown>>;
  astcFiles: number;
}> {
  mkdirSync(texturesDir, { recursive: true });
  const { am, resourceBlobs } = await asBundle(bundle);

  const remaining = new Set(wanted);
  const astcByName: Record<string, Record<string, unknown>> = {};
  let astcFiles = 0;

  for (const info of am.getObjectInfosByClass("Texture2D")) {
    const name = String(info.name ?? "");
    if (!remaining.has(name)) continue;
    try {
      const tex = info.object as UnityTexture;
      const decoded = await rgbaFromTexture2DObject(tex, name, {
        resourceBlobs,
      });
      if (!decoded) continue;

      const webpPath = path.join(texturesDir, `${name.toLowerCase()}.webp`);
      if (!existsSync(webpPath) || statSync(webpPath).size === 0) {
        await writeLosslessRgbaWebp(
          decoded.rgba,
          decoded.width,
          decoded.height,
          webpPath,
        );
      }
      remaining.delete(name);

      const raw = astcLevel0Bytes(tex, resourceBlobs);
      const fmt = textureFormatId(tex);
      const webglFmt = fmt != null ? webglAstcFormat(fmt) : null;
      if (raw && webglFmt) {
        const astcPath = path.join(texturesDir, `${name.toLowerCase()}.astc`);
        writeFileSync(astcPath, raw);
        astcFiles++;
        astcByName[name] = {
          file: path.basename(astcPath),
          width: tex.width,
          height: tex.height,
          format: webglFmt,
        };
      }
    } catch {
      continue;
    }
  }

  return { astcByName, astcFiles };
}

export async function dumpLorcanaCardBack(
  bundle: string | LorcanaUnityBundle,
  destPath: string,
): Promise<boolean> {
  const { am, resourceBlobs } = await asBundle(bundle);
  const resolved = resolveCardBackSprite(am, textureByPathId(am));
  if (!resolved) return false;

  try {
    const decoded = await rgbaFromTexture2DObject(resolved.tex, "card_back", {
      resourceBlobs,
    });
    if (!decoded) return false;

    const cropped = cropRgbaRect(
      decoded.rgba,
      decoded.width,
      decoded.height,
      resolved.rect,
      { origin: "bottom-left" },
    );
    if (!cropped) return false;

    await writeLosslessRgbaWebp(
      cropped.rgba,
      cropped.width,
      cropped.height,
      destPath,
    );
    const legacy = destPath.replace(/\.webp$/i, ".png");
    try {
      unlinkSync(legacy);
    } catch {
      /* ignore */
    }
    return true;
  } catch {
    return false;
  }
}
