/**
 * Read-only extract of Fusion World card faces from the installed client.
 * The game tree is never written. Each language plate is scaled onto the
 * illustration and stored beside the catalogue print.
 */

import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import sharp from "sharp";

import { writeLosslessRgbaWebp } from "@/lib/media/losslessWebp";
import { packCardDir } from "@/lib/packPaths";

import {
  decodeTextureFormat,
  decodeTextureTree,
  rawS3tcMip0FromTree,
  webglS3tcFormat,
  TextureFormat,
  type RawS3tcMip0,
} from "@/lib/unity/texture2d";
import {
  iterClassTrees,
  loadUnityFs,
  type UnityTypeTree,
} from "@/lib/unity/loadUnityFs";

import {
  CLIENT_FACE_LAYOUT_ID,
  CLIENT_FACE_TONE_ID,
  clientBattleFrameName,
  clientCostFillName,
  clientCostNumberSpriteName,
  clientCostRingName,
  clientCostRingOffset,
  specifiedCostPipCount,
  clientFacePixels,
  clientFrameArrayCandidates,
  DBS_FW_CLIENT_FACE_FILES,
  DBS_FW_CLIENT_LAYER_FILES,
  DBS_FW_LAYERS_COMPOSE_META,
  DBS_FW_LAYERS_S3TC_META,
  deriveCostRingGeometry,
  deriveCostRingHoleCenters,
  fusionWorldFaceLayer,
  isolateCostRingDisc,
  isClientFaceExtractCurrent,
  type CostRingGeometry,
  type FwFaceSide,
} from "../clientFaces";
import {
  FRAME_ARRAY_DXT5_GRAPHICS,
  FRAME_ARRAY_SLICE_OVER,
  FRAME_ARRAY_SLICE_UNDER,
  FRAME_BUNDLE_NAME,
  CLIENT_FACE_BAKE_ID,
  FROST_COST_FILL_SLOT,
  PASTE_SPRITE_SUPERSAMPLE,
  UNITY_TEXTURE2D_ARRAY_CLASS,
  UNITY_TEXTURE2D_CLASS,
} from "../clientFacePolicy";
import { bakeCostNumberBadge, bakeCostRingFill } from "../costRingBake";
import {
  composeClientFaceRgba,
  resizeClientFaceLayer,
} from "./composeClientFace";
import {
  frostCardMaterialFallback,
  frostCatalogueComposeOrder,
  parseFrostCardMaterial,
  type FrostCardMaterial,
  type FrostCatalogueLayer,
} from "../frostCardMaterial";
import { dbsFwFactsFor } from "../harvest/factsStore";
import { DBS_FW_PACK_ID } from "../indexStore";
import { fusionWorldCardBundle, fusionWorldMaterialsParaPrint } from "../masks";

export type FwFaceExtractStats = {
  bundles: number;
  faces: number;
  written: number;
  skipped: number;
  failed: number;
};

type DecodedLayer = {
  rgba: Buffer;
  width: number;
  height: number;
};

type S3tcPlate = {
  data: Buffer;
  width: number;
  height: number;
  format: string;
};

type NamedPlate = {
  name: string;
  pixels: DecodedLayer;
  s3tc: S3tcPlate | null;
};

type SideLayers = {
  /** All face-relevant Texture2D plates keyed by Unity name. */
  plates: Map<string, NamedPlate>;
  picture: DecodedLayer | null;
  pictureName: string;
  pictureS3tc: S3tcPlate | null;
  middle: DecodedLayer | null;
  middleName: string;
  middleS3tc: S3tcPlate | null;
  text: Partial<Record<"en" | "ja", DecodedLayer>>;
  textS3tc: Partial<Record<"en" | "ja", S3tcPlate>>;
  material: FrostCardMaterial | null;
};

function emptySide(): SideLayers {
  return {
    plates: new Map(),
    picture: null,
    pictureName: "",
    pictureS3tc: null,
    middle: null,
    middleName: "",
    middleS3tc: null,
    text: {},
    textS3tc: {},
    material: null,
  };
}

function plateFromTree(
  name: string,
  tree: Parameters<typeof decodeTextureTree>[0],
  loaded: Parameters<typeof decodeTextureTree>[1],
): NamedPlate | null {
  const decoded = decodeTextureTree(tree, loaded);
  if (!decoded) return null;
  const rawS3tc = rawS3tcMip0FromTree(tree, loaded);
  return {
    name,
    pixels: {
      rgba: decoded.rgba,
      width: decoded.width,
      height: decoded.height,
    },
    s3tc: rawS3tc ? s3tcPlateFromRaw(rawS3tc) : null,
  };
}

/** Resolve Front / Middle plates from Material Card (or name heuristic). */
function bindMaterialPlates(side: SideLayers): void {
  const mat =
    side.material ??
    frostCardMaterialFallback(
      [...side.plates.values()].find((p) => {
        const layer = fusionWorldFaceLayer(p.name);
        return layer?.kind === "picture" && layer.side === "front";
      })?.name ?? "",
    );
  side.material = mat;

  const frontName = mat.useFront ? mat.frontTex : null;
  if (frontName) {
    const plate = side.plates.get(frontName);
    if (plate) {
      side.picture = plate.pixels;
      side.pictureName = plate.name;
      side.pictureS3tc = plate.s3tc;
    }
  }
  if (!side.picture) {
    // Heuristic: first picture-kind plate for this side.
    for (const plate of side.plates.values()) {
      const layer = fusionWorldFaceLayer(plate.name);
      if (layer?.kind === "picture") {
        side.picture = plate.pixels;
        side.pictureName = plate.name;
        side.pictureS3tc = plate.s3tc;
        break;
      }
    }
  }

  if (mat.showMiddle && mat.middleTex) {
    const plate = side.plates.get(mat.middleTex);
    if (plate) {
      side.middle = plate.pixels;
      side.middleName = plate.name;
      side.middleS3tc = plate.s3tc;
    }
  }
}

const FRAME_BUNDLE = FRAME_BUNDLE_NAME;

type FrameLibrary = {
  badge: (name: string) => DecodedLayer | null;
  frame: (name: string) => DecodedLayer[] | null;
  /** Raw FrameTex mip0 DXT — slice 0 (under) / slice 2 (over / frameTop). */
  frameS3tc: (name: string, slice?: number) => S3tcPlate | null;
  ring: (
    color: string,
    specifiedCost?: string | null,
  ) => Promise<DecodedLayer | null>;
  ringGeometry: () => CostRingGeometry | null;
};

function s3tcPlateFromRaw(raw: RawS3tcMip0): S3tcPlate {
  return {
    data: Buffer.from(raw.data),
    width: raw.width,
    height: raw.height,
    format: raw.glFormat,
  };
}

function writeS3tcPlate(dir: string, file: string, plate: S3tcPlate): void {
  writeFileSync(path.join(dir, file), plate.data);
}

function dxt5LevelBytes(width: number, height: number): number {
  return Math.ceil(width / 4) * Math.ceil(height / 4) * 16;
}

function dxt5MipChainBytes(
  width: number,
  height: number,
  mips: number,
): number {
  let total = 0;
  let w = width;
  let h = height;
  for (let i = 0; i < mips; i += 1) {
    total += dxt5LevelBytes(w, h);
    w = Math.max(1, w >> 1);
    h = Math.max(1, h >> 1);
  }
  return total;
}

/**
 * Frame Texture2DArray slices. Frost samples z=0 under Middle and z=2 over
 * (footer chrome). Layout: [slice0 mips…][slice1 mips…]… Catalogue keeps
 * 512-wide mip0; RGBA layer sidecars use CPU bilinear. Product `art.client`
 * is composed from these full-resolution slices (composeClientFace, Lanczos3).
 */
function decodeFrameArray(tree: UnityTypeTree): {
  slices: DecodedLayer[];
  /** mip0 DXT per array slice (z=0 under, z=2 frameTop). */
  s3tcBySlice: Map<number, S3tcPlate>;
} | null {
  // m_Format is Unity GraphicsFormat (e.g. 100 = BC3_SRGB), not TextureFormat.
  const format = Number(tree.m_Format ?? 0);
  if (!FRAME_ARRAY_DXT5_GRAPHICS.has(format)) return null;
  const width = Number(tree.m_Width ?? 0);
  const height = Number(tree.m_Height ?? 0);
  const depth = Number(tree.m_Depth ?? 0);
  const mips = Number(tree.m_MipCount ?? 1);
  const data = tree["image data"];
  if (
    !(data instanceof Uint8Array) ||
    width <= 0 ||
    height <= 0 ||
    depth <= 0
  ) {
    return null;
  }
  const chain = dxt5MipChainBytes(width, height, Math.max(1, mips));
  const mip0 = dxt5LevelBytes(width, height);
  if (data.byteLength < mip0) return null;
  const srgb = format === 100; // BC3_SRGB GraphicsFormat
  const glFormat = webglS3tcFormat(TextureFormat.DXT5, srgb);
  const s3tcBySlice = new Map<number, S3tcPlate>();
  const slices: DecodedLayer[] = [];
  for (let s = 0; s < depth; s += 1) {
    const off = s * chain;
    if (data.byteLength < off + mip0) break;
    if (glFormat) {
      s3tcBySlice.set(s, {
        data: Buffer.from(data.subarray(off, off + mip0)),
        width,
        height,
        format: glFormat,
      });
    }
    slices.push({
      rgba: decodeTextureFormat(
        data.subarray(off, off + mip0),
        width,
        height,
        TextureFormat.DXT5,
      ),
      width,
      height,
    });
  }
  if (slices.length === 0) return null;
  return { slices, s3tcBySlice };
}

const emptyLibrary: FrameLibrary = {
  badge: () => null,
  frame: () => null,
  frameS3tc: () => null,
  ring: async () => null,
  ringGeometry: () => null,
};

/** Cost badges and the chrome arrays, decoded once. */
function openFrameLibrary(bundlesDir: string): FrameLibrary {
  const file = path.join(bundlesDir, FRAME_BUNDLE);
  if (!existsSync(file)) return emptyLibrary;
  let loaded;
  try {
    loaded = loadUnityFs(readFileSync(file));
  } catch {
    return emptyLibrary;
  }
  const textures = new Map<string, UnityTypeTree>();
  for (const tree of iterClassTrees(loaded, UNITY_TEXTURE2D_CLASS)) {
    const name = String(tree.m_Name ?? "");
    if (name) textures.set(name, tree);
  }
  const arrays = new Map<string, UnityTypeTree>();
  for (const tree of iterClassTrees(loaded, UNITY_TEXTURE2D_ARRAY_CLASS)) {
    const name = String(tree.m_Name ?? "");
    if (name) arrays.set(name, tree);
  }
  const badges = new Map<string, DecodedLayer | null>();
  const frames = new Map<string, DecodedLayer[] | null>();
  const frameS3tcs = new Map<string, Map<number, S3tcPlate>>();
  const rings = new Map<string, Promise<DecodedLayer | null>>();
  let ringGeom: CostRingGeometry | null = null;
  return {
    badge(name) {
      const hit = badges.get(name);
      if (hit !== undefined) return hit;
      const tree = textures.get(name);
      let decoded = null;
      try {
        // CostNumber badges are BC7 — no DXT deblock; SS happens at resize.
        decoded = tree ? decodeTextureTree(tree, loaded) : null;
      } catch {
        decoded = null;
      }
      const layer = decoded
        ? {
            rgba: decoded.rgba,
            width: decoded.width,
            height: decoded.height,
          }
        : null;
      badges.set(name, layer);
      return layer;
    },
    frame(name) {
      const hit = frames.get(name);
      if (hit !== undefined) return hit;
      // Prefer inventory hit; builders may list names absent from this dump.
      const tree = arrays.get(name);
      const decoded = tree ? decodeFrameArray(tree) : null;
      frames.set(name, decoded?.slices ?? null);
      frameS3tcs.set(name, decoded?.s3tcBySlice ?? new Map());
      return decoded?.slices ?? null;
    },
    frameS3tc(name, slice = FRAME_ARRAY_SLICE_UNDER) {
      if (!frameS3tcs.has(name)) {
        // Populate via frame() so cured + raw stay in sync.
        this.frame(name);
      }
      return frameS3tcs.get(name)?.get(slice) ?? null;
    },
    ring(color, specifiedCost = null) {
      const fillName = clientCostFillName(color);
      if (!fillName) return Promise.resolve(null);
      const ringName = clientCostRingName(specifiedCost);
      const pipCount = specifiedCostPipCount(specifiedCost);
      const cacheKey = `${ringName}:${fillName}`;
      const hit = rings.get(cacheKey);
      if (hit) return hit;
      const pending = (async (): Promise<DecodedLayer | null> => {
        const ringTree = textures.get(ringName);
        const fillTree = textures.get(fillName);
        try {
          // Cost_0N (RGBA32 chrome, N specified-cost holes) + CostFrame_{Color}.
          // Bake at PASTE_SPRITE_SUPERSAMPLE×; fillSize stays Frost slot 32
          // (not CostFrame atlas 226). Fill every hole; anchor on the first.
          const ring = ringTree ? decodeTextureTree(ringTree, loaded) : null;
          const fillMip0 = fillTree
            ? decodeTextureTree(fillTree, loaded)
            : null;
          if (!ring || !fillMip0) return null;
          const holes = deriveCostRingHoleCenters(
            ring.rgba,
            ring.width,
            ring.height,
            pipCount,
          );
          ringGeom = deriveCostRingGeometry(
            ring.rgba,
            ring.width,
            ring.height,
            FROST_COST_FILL_SLOT,
          );
          if (holes[0]) {
            ringGeom = { ...ringGeom, center: holes[0] };
          }
          const filled = await bakeCostRingFill(
            ring.rgba,
            ring.width,
            ring.height,
            fillMip0.rgba,
            fillMip0.width,
            fillMip0.height,
            ringGeom,
            undefined,
            undefined,
            holes.length > 0 ? holes : undefined,
          );
          return {
            rgba: isolateCostRingDisc(
              filled,
              ring.width,
              ring.height,
              ringGeom.outerCenter.x,
              ringGeom.outerCenter.y,
              ringGeom.outerDiam / 2,
            ),
            width: ring.width,
            height: ring.height,
          };
        } catch {
          return null;
        }
      })();
      rings.set(cacheKey, pending);
      return pending;
    },
    ringGeometry: () => ringGeom,
  };
}

type ResizeKernel = "lanczos3" | "mitchell" | "cubic";

/**
 * Shared minify path for costRing blit (RGBA32 SS).
 * Layer WebPs and the product face use {@link resizeClientFaceLayer}.
 */
async function supersampleResize(
  rgba: Buffer,
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
  kernel: ResizeKernel = "lanczos3",
  supersample = PASTE_SPRITE_SUPERSAMPLE,
): Promise<Buffer> {
  if (srcW === dstW && srcH === dstH) return rgba;
  const minScale = Math.min(dstW / srcW, dstH / srcH);
  if (minScale >= 1 || supersample <= 1) {
    return sharp(rgba, { raw: { width: srcW, height: srcH, channels: 4 } })
      .resize(dstW, dstH, { fit: "fill", kernel })
      .ensureAlpha()
      .raw()
      .toBuffer();
  }
  const superW = Math.max(dstW, dstW * supersample);
  const superH = Math.max(dstH, dstH * supersample);
  const hi = await sharp(rgba, {
    raw: { width: srcW, height: srcH, channels: 4 },
  })
    .resize(superW, superH, { fit: "fill", kernel })
    .ensureAlpha()
    .raw()
    .toBuffer();
  return sharp(hi, { raw: { width: superW, height: superH, channels: 4 } })
    .resize(dstW, dstH, { fit: "fill", kernel })
    .ensureAlpha()
    .raw()
    .toBuffer();
}

/**
 * Blit a sprite onto the card (costRing). Minifies share
 * {@link supersampleResize} with badge / face layers.
 */
async function pasteSprite(
  base: Buffer,
  width: number,
  height: number,
  sprite: DecodedLayer,
  left: number,
  top: number,
  scale = 1,
): Promise<Buffer> {
  let source = sprite;
  if (scale !== 1) {
    const scaledWidth = Math.max(1, Math.round(sprite.width * scale));
    const scaledHeight = Math.max(1, Math.round(sprite.height * scale));
    source = {
      rgba: await supersampleResize(
        sprite.rgba,
        sprite.width,
        sprite.height,
        scaledWidth,
        scaledHeight,
      ),
      width: scaledWidth,
      height: scaledHeight,
    };
  }
  const srcLeft = Math.max(0, -left);
  const srcTop = Math.max(0, -top);
  const destLeft = Math.max(0, left);
  const destTop = Math.max(0, top);
  const cropWidth = Math.min(source.width - srcLeft, width - destLeft);
  const cropHeight = Math.min(source.height - srcTop, height - destTop);
  if (cropWidth <= 0 || cropHeight <= 0) return base;
  const cropped = await sharp(source.rgba, {
    raw: { width: source.width, height: source.height, channels: 4 },
  })
    .extract({
      left: srcLeft,
      top: srcTop,
      width: cropWidth,
      height: cropHeight,
    })
    .png()
    .toBuffer();
  return sharp(base, { raw: { width, height, channels: 4 } })
    .composite([
      { input: cropped, left: destLeft, top: destTop, blend: "over" },
    ])
    .ensureAlpha()
    .raw()
    .toBuffer();
}

function bundleNames(dir: string): string[] {
  return readdirSync(dir)
    .filter((name) => fusionWorldCardBundle(name))
    .sort((a, b) => a.localeCompare(b));
}

/**
 * One resample onto the printed card — the same Lanczos3 as the product face
 * ({@link resizeClientFaceLayer}), so `layer.*.webp` and `art.client` agree.
 */
function resizeRgba(
  layer: DecodedLayer,
  width: number,
  height: number,
): Promise<Buffer> {
  return resizeClientFaceLayer(layer, width, height);
}

/** Texture names the Material Card may bind as Front/Middle (incl. bare Back). */
function isMaterialPlateName(name: string): boolean {
  if (fusionWorldFaceLayer(name)) return true;
  const n = name.trim().toLowerCase();
  if (!n || /holo|foil|ef_mask|thumb|alp/.test(n)) return false;
  return /_(back|front)$/.test(n);
}

async function extractBundle(
  bundlesDir: string,
  fileName: string,
  force: boolean,
  stats: FwFaceExtractStats,
  frames: FrameLibrary,
): Promise<void> {
  const card = fusionWorldCardBundle(fileName);
  if (!card) return;
  let loaded;
  try {
    loaded = loadUnityFs(readFileSync(path.join(bundlesDir, fileName)));
  } catch {
    stats.failed += 1;
    return;
  }

  const material = parseFrostCardMaterial(loaded);
  const sides: Record<FwFaceSide, SideLayers> = {
    front: emptySide(),
    back: emptySide(),
  };
  sides.front.material = material;
  // Double-faced prints live in separate `_front` / `_back` bundles; each
  // bundle's Card material describes that face.

  for (const tree of iterClassTrees(loaded, 28)) {
    const name = String(tree.m_Name ?? tree.name ?? "");
    const layer = fusionWorldFaceLayer(name);
    const wanted =
      Boolean(layer) ||
      material?.frontTex === name ||
      material?.middleTex === name ||
      isMaterialPlateName(name);
    if (!wanted) continue;
    const plate = plateFromTree(name, tree, loaded);
    if (!plate) {
      stats.failed += 1;
      continue;
    }
    const faceSide: FwFaceSide = layer?.side === "back" ? "back" : "front";
    const slot = sides[faceSide];
    slot.plates.set(name, plate);
    if (layer?.kind === "text") {
      slot.text[layer.lang] = plate.pixels;
      if (plate.s3tc) slot.textS3tc[layer.lang] = plate.s3tc;
    }
  }

  bindMaterialPlates(sides.front);
  bindMaterialPlates(sides.back);
  await writeCardFaceSides(card, sides, force, stats, frames);
}

async function writeCardFaceSides(
  card: {
    set: string;
    number: string;
    folder: string;
  },
  sides: Record<FwFaceSide, SideLayers>,
  force: boolean,
  stats: FwFaceExtractStats,
  frames: FrameLibrary,
): Promise<void> {
  for (const side of ["front", "back"] as const) {
    const slot = sides[side];
    if (!slot.picture) continue;
    const langs = (["en", "ja"] as const).filter((lang) => slot.text[lang]);
    if (langs.length === 0) continue;
    stats.faces += langs.length;
    const expectsMiddle = Boolean(slot.middle);
    for (const lang of langs) {
      const cardDir = packCardDir(DBS_FW_PACK_ID, {
        set: card.set,
        lang,
        card: card.folder,
      });
      const dest = path.join(cardDir, DBS_FW_CLIENT_FACE_FILES[side]);
      const facts = dbsFwFactsFor(card.set, card.number);
      const badgeLayoutName = clientBattleFrameName(
        facts?.cardType ?? null,
        facts?.color ?? null,
        facts?.cost ?? null,
        facts?.specifiedCost ?? null,
      );
      const badgeSpriteName = clientCostNumberSpriteName(
        facts?.cardType ?? null,
        facts?.color ?? null,
        facts?.cost ?? null,
      );
      const badgeName = badgeSpriteName ?? badgeLayoutName;
      if (!force) {
        const onDisk = existsSync(cardDir)
          ? new Set(readdirSync(cardDir))
          : new Set<string>();
        let composeOrder: string[] | null = null;
        let bakeMode: string | null = null;
        let layoutId: string | null = null;
        let toneId: string | null = null;
        const composePath = path.join(cardDir, DBS_FW_LAYERS_COMPOSE_META);
        if (existsSync(composePath)) {
          try {
            const raw = JSON.parse(readFileSync(composePath, "utf8")) as {
              order?: string[];
              bake?: string;
              layout?: string;
              tone?: string;
            };
            composeOrder = Array.isArray(raw.order) ? raw.order : null;
            bakeMode = typeof raw.bake === "string" ? raw.bake : null;
            layoutId = typeof raw.layout === "string" ? raw.layout : null;
            toneId = typeof raw.tone === "string" ? raw.tone : null;
          } catch {
            composeOrder = null;
            bakeMode = null;
            layoutId = null;
            toneId = null;
          }
        }
        if (
          isClientFaceExtractCurrent(
            onDisk,
            side,
            badgeName != null,
            expectsMiddle,
            composeOrder,
            // Front product face must carry CLIENT_FACE_BAKE_ID; omit for back.
            side === "front" ? bakeMode : undefined,
            side === "front" ? layoutId : undefined,
            side === "front" ? toneId : undefined,
          )
        ) {
          stats.skipped += 1;
          continue;
        }
      }
      const text = slot.text[lang];
      if (!text) continue;
      try {
        const picture = slot.picture;
        const sized = clientFacePixels(picture.width, picture.height);
        const layers = DBS_FW_CLIENT_LAYER_FILES[side];
        const cardDirName = path.dirname(dest);
        const s3tcMeta: Record<
          string,
          { file: string; width: number; height: number; format: string }
        > = {};

        const pictureSized = await resizeRgba(
          picture,
          sized.width,
          sized.height,
        );
        await writeLosslessRgbaWebp(
          pictureSized,
          sized.width,
          sized.height,
          path.join(cardDirName, layers.picture),
        );
        if (slot.pictureS3tc) {
          writeS3tcPlate(cardDirName, layers.pictureS3tc, slot.pictureS3tc);
          s3tcMeta.picture = {
            file: layers.pictureS3tc,
            width: slot.pictureS3tc.width,
            height: slot.pictureS3tc.height,
            format: slot.pictureS3tc.format,
          };
        }

        let middleSized: Buffer | null = null;
        if (slot.middle) {
          middleSized = await resizeRgba(
            slot.middle,
            sized.width,
            sized.height,
          );
          await writeLosslessRgbaWebp(
            middleSized,
            sized.width,
            sized.height,
            path.join(cardDirName, layers.middle),
          );
          if (slot.middleS3tc) {
            writeS3tcPlate(cardDirName, layers.middleS3tc, slot.middleS3tc);
            s3tcMeta.middle = {
              file: layers.middleS3tc,
              width: slot.middleS3tc.width,
              height: slot.middleS3tc.height,
              format: slot.middleS3tc.format,
            };
          }
        }

        const textS3tc = slot.textS3tc[lang];
        if (textS3tc) {
          writeS3tcPlate(cardDirName, layers.textS3tc, textS3tc);
          s3tcMeta.text = {
            file: layers.textS3tc,
            width: textS3tc.width,
            height: textS3tc.height,
            format: textS3tc.format,
          };
        }

        const useFrame = slot.material?.useFrame ?? true;
        const frameCard = {
          cardType: facts?.cardType ?? null,
          color: facts?.color ?? null,
          rarity: facts?.rarity ?? null,
          setCode: card.set,
          parallel: card.folder !== card.number,
          side,
        };
        let chrome: DecodedLayer[] | null = null;
        let chromeS3tc: S3tcPlate | null = null;
        let chromeTopS3tc: S3tcPlate | null = null;
        let frameSized: Buffer | null = null;
        let frameTopSized: Buffer | null = null;
        if (useFrame) {
          for (const name of clientFrameArrayCandidates(frameCard)) {
            chrome = frames.frame(name);
            if (chrome) {
              chromeS3tc = frames.frameS3tc(name, FRAME_ARRAY_SLICE_UNDER);
              chromeTopS3tc = frames.frameS3tc(name, FRAME_ARRAY_SLICE_OVER);
              break;
            }
          }
          if (chromeS3tc) {
            writeS3tcPlate(cardDirName, layers.frameS3tc, chromeS3tc);
            s3tcMeta.frame = {
              file: layers.frameS3tc,
              width: chromeS3tc.width,
              height: chromeS3tc.height,
              format: chromeS3tc.format,
            };
          }
          if (chromeTopS3tc) {
            writeS3tcPlate(cardDirName, layers.frameTopS3tc, chromeTopS3tc);
            s3tcMeta.frameTop = {
              file: layers.frameTopS3tc,
              width: chromeTopS3tc.width,
              height: chromeTopS3tc.height,
              format: chromeTopS3tc.format,
            };
          }
          const under = chrome?.[FRAME_ARRAY_SLICE_UNDER];
          if (under) {
            frameSized = await resizeRgba(
              under,
              sized.width,
              sized.height,
            );
            await writeLosslessRgbaWebp(
              frameSized,
              sized.width,
              sized.height,
              path.join(cardDirName, layers.frame),
            );
          }
          // Frost samples FrameTex z=2 after Middle (footer over character).
          // RGBA WebP = foil/debug sidecar; product bake uses frameTop.dxt5.
          const over = chrome?.[FRAME_ARRAY_SLICE_OVER];
          if (over) {
            frameTopSized = await resizeRgba(
              over,
              sized.width,
              sized.height,
            );
            await writeLosslessRgbaWebp(
              frameTopSized,
              sized.width,
              sized.height,
              path.join(cardDirName, layers.frameTop),
            );
          }
        }

        const ring = badgeName
          ? await frames.ring(facts?.color ?? "", facts?.specifiedCost ?? null)
          : null;
        const ringAt = ring
          ? clientCostRingOffset(
              sized.width,
              sized.height,
              frames.ringGeometry() ?? undefined,
            )
          : null;
        let ringLayer: Buffer | null = null;
        if (ring && ringAt) {
          const blank = Buffer.alloc(sized.width * sized.height * 4, 0);
          ringLayer = await pasteSprite(
            blank,
            sized.width,
            sized.height,
            ring,
            ringAt.left,
            ringAt.top,
            ringAt.scale,
          );
          await writeLosslessRgbaWebp(
            ringLayer,
            sized.width,
            sized.height,
            path.join(cardDirName, layers.costRing),
          );
        }

        const textSized = await resizeRgba(
          text,
          sized.width,
          sized.height,
        );
        await writeLosslessRgbaWebp(
          textSized,
          sized.width,
          sized.height,
          path.join(cardDirName, layers.text),
        );

        const badgeSprite = badgeSpriteName
          ? frames.badge(badgeSpriteName)
          : null;
        const badgeLayout = badgeLayoutName
          ? frames.badge(badgeLayoutName)
          : null;
        let badgeSized: Buffer | null = null;
        if (badgeSprite && badgeLayout) {
          badgeSized = await bakeCostNumberBadge(
            badgeSprite.rgba,
            badgeSprite.width,
            badgeSprite.height,
            badgeLayout.rgba,
            badgeLayout.width,
            badgeLayout.height,
            sized.width,
            sized.height,
          );
          await writeLosslessRgbaWebp(
            badgeSized,
            sized.width,
            sized.height,
            path.join(cardDirName, layers.badge),
          );
        } else if (badgeSprite) {
          // No BC7 layout atlas — stretch sprite (legacy fallback).
          badgeSized = await resizeRgba(
            badgeSprite,
            sized.width,
            sized.height,
          );
          await writeLosslessRgbaWebp(
            badgeSized,
            sized.width,
            sized.height,
            path.join(cardDirName, layers.badge),
          );
        } else if (badgeLayout) {
          badgeSized = await resizeRgba(
            badgeLayout,
            sized.width,
            sized.height,
          );
          await writeLosslessRgbaWebp(
            badgeSized,
            sized.width,
            sized.height,
            path.join(cardDirName, layers.badge),
          );
        }

        const order = frostCatalogueComposeOrder({
          material: slot.material,
          hasText: true,
          hasCostRing: ringLayer != null,
          hasBadge: badgeSized != null,
          hasFrameTop: frameTopSized != null,
        });
        // Face produit : calques en pleine résolution (décodeur conforme),
        // réduits en Lanczos3 et empilés comme le shader Frost — plus de
        // Chrome / WebGL. Les sidecars `layer.*.webp` restent bilinéaires.
        const fullRes: Partial<
          Record<
            FrostCatalogueLayer,
            { rgba: Buffer; width: number; height: number }
          >
        > = {
          picture,
          frame: chrome?.[FRAME_ARRAY_SLICE_UNDER] ?? undefined,
          middle: slot.middle ?? undefined,
          frameTop: chrome?.[FRAME_ARRAY_SLICE_OVER] ?? undefined,
          text,
          costRing: ringLayer
            ? { rgba: ringLayer, width: sized.width, height: sized.height }
            : undefined,
          badge: badgeSized
            ? { rgba: badgeSized, width: sized.width, height: sized.height }
            : undefined,
        };
        const stack = order
          .map((kind) => fullRes[kind])
          .filter((layer): layer is NonNullable<typeof layer> =>
            Boolean(layer),
          );
        if (stack.length === 0) continue;
        const face = await composeClientFaceRgba(
          stack,
          sized.width,
          sized.height,
        );
        await writeLosslessRgbaWebp(face, sized.width, sized.height, dest);
        const bake = CLIENT_FACE_BAKE_ID;
        if (side === "front") {
          writeFileSync(
            path.join(cardDirName, DBS_FW_LAYERS_COMPOSE_META),
            `${JSON.stringify(
              {
                order,
                bake,
                layout: CLIENT_FACE_LAYOUT_ID,
                tone: CLIENT_FACE_TONE_ID,
                pixels: { width: sized.width, height: sized.height },
                material: slot.material
                  ? {
                      frontTex: slot.material.frontTex,
                      middleTex: slot.material.middleTex,
                      useFront: slot.material.useFront,
                      useFrame: slot.material.useFrame,
                      showMiddle: slot.material.showMiddle,
                    }
                  : null,
              },
              null,
              2,
            )}\n`,
            "utf8",
          );
          if (s3tcMeta.picture) {
            writeFileSync(
              path.join(cardDirName, DBS_FW_LAYERS_S3TC_META),
              `${JSON.stringify(s3tcMeta, null, 2)}\n`,
              "utf8",
            );
          }
        }
        stats.written += 1;
      } catch {
        stats.failed += 1;
      }
    }
  }
}

/**
 * Energy-marker PARA plates (`E-106_PARA_*`) live in card_materials only —
 * there is no `e_e-106_para.bundle`. Pull Front+Text into `{n}-p1`.
 */
async function extractMaterialsParaFaces(
  bundlesDir: string,
  force: boolean,
  stats: FwFaceExtractStats,
  frames: FrameLibrary,
  match?: string,
): Promise<void> {
  const materials = "packdata_assets_card_materials.bundle";
  const materialsPath = path.join(bundlesDir, materials);
  if (!existsSync(materialsPath)) return;
  // Skip when a dedicated series PARA bundle already covers that print.
  const seriesPara = new Set(
    bundleNames(bundlesDir)
      .map((name) => fusionWorldCardBundle(name))
      .filter((c): c is NonNullable<typeof c> =>
        Boolean(c?.folder.endsWith("-p1")),
      )
      .map((c) => `${c.set}/${c.folder}`),
  );
  let loaded;
  try {
    loaded = loadUnityFs(readFileSync(materialsPath));
  } catch {
    stats.failed += 1;
    return;
  }
  const byKey = new Map<
    string,
    {
      card: { set: string; number: string; folder: string };
      sides: Record<FwFaceSide, SideLayers>;
    }
  >();
  for (const tree of iterClassTrees(loaded, 28)) {
    const name = String(tree.m_Name ?? tree.name ?? "");
    const print = fusionWorldMaterialsParaPrint(name);
    if (!print) continue;
    if (
      match &&
      !`${print.set}-${print.number}`.includes(match.toLowerCase())
    ) {
      continue;
    }
    const key = `${print.set}/${print.folder}`;
    if (seriesPara.has(key)) continue;
    const layer = fusionWorldFaceLayer(name);
    if (!layer && !isMaterialPlateName(name)) continue;
    const plate = plateFromTree(name, tree, loaded);
    if (!plate) {
      stats.failed += 1;
      continue;
    }
    let entry = byKey.get(key);
    if (!entry) {
      entry = {
        card: print,
        sides: { front: emptySide(), back: emptySide() },
      };
      byKey.set(key, entry);
    }
    const faceSide: FwFaceSide = layer?.side === "back" ? "back" : "front";
    const slot = entry.sides[faceSide];
    slot.plates.set(name, plate);
    if (layer?.kind === "text") {
      slot.text[layer.lang] = plate.pixels;
      if (plate.s3tc) slot.textS3tc[layer.lang] = plate.s3tc;
    } else if (layer?.kind === "picture") {
      slot.picture = plate.pixels;
      slot.pictureName = plate.name;
      slot.pictureS3tc = plate.s3tc;
    }
  }
  stats.bundles += byKey.size > 0 ? 1 : 0;
  for (const entry of byKey.values()) {
    bindMaterialPlates(entry.sides.front);
    bindMaterialPlates(entry.sides.back);
    await writeCardFaceSides(entry.card, entry.sides, force, stats, frames);
  }
}

export async function extractFusionWorldCardFaces(opts: {
  bundlesDir: string;
  force?: boolean;
  limit?: number;
  match?: string;
  onProgress?: (done: number, total: number, stats: FwFaceExtractStats) => void;
}): Promise<FwFaceExtractStats> {
  let names = bundleNames(opts.bundlesDir);
  if (opts.match) {
    const needle = opts.match.toLowerCase();
    names = names.filter((name) => name.toLowerCase().includes(needle));
  }
  const frames = openFrameLibrary(opts.bundlesDir);
  const selected = opts.limit ? names.slice(0, opts.limit) : names;
  const stats: FwFaceExtractStats = {
    bundles: selected.length,
    faces: 0,
    written: 0,
    skipped: 0,
    failed: 0,
  };
  let done = 0;
  for (const fileName of selected) {
    await extractBundle(
      opts.bundlesDir,
      fileName,
      opts.force === true,
      stats,
      frames,
    );
    done += 1;
    if (done % 50 === 0 || done === selected.length) {
      opts.onProgress?.(done, selected.length, stats);
    }
  }
  // Materials-only PARA (e.g. E-106) — not matched by card_series bundle names.
  await extractMaterialsParaFaces(
    opts.bundlesDir,
    opts.force === true,
    stats,
    frames,
    opts.match,
  );
  return stats;
}

const CLIENT_FACE_NAMES = new Set<string>(
  Object.values(DBS_FW_CLIENT_FACE_FILES),
);

function clientFaceFiles(cardsDir: string): string[] {
  const files: string[] = [];
  for (const lang of ["en", "ja"]) {
    const langDir = path.join(cardsDir, lang);
    if (!existsSync(langDir)) continue;
    for (const set of readdirSync(langDir)) {
      const setDir = path.join(langDir, set);
      let cards: string[];
      try {
        cards = readdirSync(setDir);
      } catch {
        continue;
      }
      for (const card of cards) {
        const cardDir = path.join(setDir, card);
        let names: string[];
        try {
          names = readdirSync(cardDir);
        } catch {
          continue;
        }
        for (const name of names) {
          if (CLIENT_FACE_NAMES.has(name)) files.push(path.join(cardDir, name));
        }
      }
    }
  }
  return files;
}

/** Widen already extracted client faces from the 1:2 texture onto a 63×88 card. */
export async function reflowFusionWorldClientFaces(opts: {
  cardsDir: string;
  onProgress?: (done: number, total: number, widened: number) => void;
}): Promise<{ files: number; widened: number; skipped: number }> {
  const files = clientFaceFiles(opts.cardsDir);
  let widened = 0;
  let skipped = 0;
  let done = 0;
  for (const file of files) {
    const meta = await sharp(file).metadata();
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;
    const sized = clientFacePixels(width, height);
    if (sized.width === width && sized.height === height) {
      skipped += 1;
    } else {
      const rgba = await sharp(file)
        .resize(sized.width, sized.height, { fit: "fill" })
        .ensureAlpha()
        .raw()
        .toBuffer();
      await writeLosslessRgbaWebp(rgba, sized.width, sized.height, file);
      widened += 1;
    }
    done += 1;
    if (done % 200 === 0 || done === files.length) {
      opts.onProgress?.(done, files.length, widened);
    }
  }
  return { files: files.length, widened, skipped };
}
