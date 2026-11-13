/**
 * Read-only extract of Fusion World card faces from the installed client.
 * The game tree is never written. Each language plate is scaled onto the
 * illustration and stored beside the catalogue print.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import sharp from "sharp";

import { writeLosslessRgbaWebp } from "@/lib/media/losslessWebp";
import { packCardDir } from "@/lib/packPaths";
import { decodeBc3 } from "@arkntools/unity-js-tools";

import {
  bgraToRgba,
  decodeTextureTree,
  flipRgbaVertical,
} from "@/lib/unity/texture2d";
import {
  iterClassTrees,
  loadUnityFs,
  type UnityTypeTree,
} from "@/lib/unity/loadUnityFs";

import {
  clientBattleFrameName,
  clientCostFillName,
  clientCostRingOffset,
  clientFacePixels,
  clientFrameArrayCandidates,
  DBS_FW_CLIENT_FACE_FILES,
  DBS_FW_CLIENT_LAYER_FILES,
  DBS_FW_COST_RING,
  deriveCostRingGeometry,
  fusionWorldFaceLayer,
  isolateCostRingDisc,
  isClientFaceExtractCurrent,
  premultiplyStraight,
  solidifyPlateInk,
  unpremultiplyStraight,
  type CostRingGeometry,
  type FwFaceSide,
} from "../clientFaces";
import {
  FRAME_ARRAY_DXT5_GRAPHICS,
  FRAME_BUNDLE_NAME,
  FROST_COST_FILL_SLOT,
  PASTE_SPRITE_SUPERSAMPLE,
  UNITY_TEXTURE2D_ARRAY_CLASS,
  UNITY_TEXTURE2D_CLASS,
} from "../clientFacePolicy";
import { bakeCostRingFill } from "../costRingBake";
import { dbsFwFactsFor } from "../harvest/factsStore";
import { DBS_FW_PACK_ID } from "../indexStore";
import {
  fusionWorldCardBundle,
  fusionWorldMaterialsParaPrint,
} from "../masks";

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

type SideLayers = {
  picture: DecodedLayer | null;
  pictureName: string;
  text: Partial<Record<"en" | "ja", DecodedLayer>>;
};

const FRAME_BUNDLE = FRAME_BUNDLE_NAME;

type FrameLibrary = {
  badge: (name: string) => DecodedLayer | null;
  frame: (name: string) => DecodedLayer[] | null;
  ring: (color: string) => Promise<DecodedLayer | null>;
  ringGeometry: () => CostRingGeometry | null;
};

function dxt5LevelBytes(width: number, height: number): number {
  return Math.ceil(width / 4) * Math.ceil(height / 4) * 16;
}

function dxt5MipChainBytes(width: number, height: number, mips: number): number {
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
 * Slice 0 of a frame Texture2DArray. Catalogue faces keep the 512-wide
 * mip0 (height shrinks to 63×88); Unity bilinear-filters the Y minify.
 * Mip data after slice 0 is ignored — stacking other slices cuts text.
 */
function decodeFrameArray(tree: UnityTypeTree): DecodedLayer[] | null {
  // m_Format is Unity GraphicsFormat (e.g. 100 = BC3_SRGB), not TextureFormat.
  const format = Number(tree.m_Format ?? 0);
  if (!FRAME_ARRAY_DXT5_GRAPHICS.has(format)) return null;
  const width = Number(tree.m_Width ?? 0);
  const height = Number(tree.m_Height ?? 0);
  const depth = Number(tree.m_Depth ?? 0);
  const mips = Number(tree.m_MipCount ?? 1);
  const data = tree["image data"];
  if (!(data instanceof Uint8Array) || width <= 0 || height <= 0 || depth <= 0) {
    return null;
  }
  // Layout is [slice0 mips…][slice1 mips…]… — only slice 0 is the border.
  const chain = dxt5MipChainBytes(width, height, Math.max(1, mips));
  const mip0 = dxt5LevelBytes(width, height);
  if (data.byteLength < mip0 || (chain > 0 && data.byteLength < chain && data.byteLength < mip0 * depth)) {
    return null;
  }
  const raw = bgraToRgba(
    Buffer.from(decodeBc3(data.subarray(0, mip0), width, height)),
  );
  return [
    {
      rgba: flipRgbaVertical(raw, width, height),
      width,
      height,
    },
  ];
}

const emptyLibrary: FrameLibrary = {
  badge: () => null,
  frame: () => null,
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
  const rings = new Map<string, Promise<DecodedLayer | null>>();
  let ringGeom: CostRingGeometry | null = null;
  return {
    badge(name) {
      const hit = badges.get(name);
      if (hit !== undefined) return hit;
      const tree = textures.get(name);
      let decoded = null;
      try {
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
      const slices = tree ? decodeFrameArray(tree) : null;
      frames.set(name, slices);
      return slices;
    },
    ring(color) {
      const fillName = clientCostFillName(color);
      if (!fillName) return Promise.resolve(null);
      const hit = rings.get(fillName);
      if (hit) return hit;
      const pending = (async (): Promise<DecodedLayer | null> => {
        const ringTree = textures.get(DBS_FW_COST_RING);
        const fillTree = textures.get(fillName);
        try {
          // Cost_01 (RGBA32 chrome) + CostFrame_{Color} (RGBA32 disc).
          // Bake at PASTE_SPRITE_SUPERSAMPLE×; fillSize stays Frost slot 32
          // (not CostFrame atlas 226). Mass-centre on the inner rim.
          const ring = ringTree ? decodeTextureTree(ringTree, loaded) : null;
          const fillMip0 = fillTree ? decodeTextureTree(fillTree, loaded) : null;
          if (!ring || !fillMip0) return null;
          ringGeom = deriveCostRingGeometry(
            ring.rgba,
            ring.width,
            ring.height,
            FROST_COST_FILL_SLOT,
          );
          const filled = await bakeCostRingFill(
            ring.rgba,
            ring.width,
            ring.height,
            fillMip0.rgba,
            fillMip0.width,
            fillMip0.height,
            ringGeom,
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
      rings.set(fillName, pending);
      return pending;
    },
    ringGeometry: () => ringGeom,
  };
}

type ResizeKernel = "lanczos3" | "mitchell" | "cubic";

/**
 * Shared minify path for costRing blit, badge, picture, frame, text.
 * Same recipe as {@link bakeCostRingFill}: up to SS× target, then lanczos down.
 * Upscales stay single-pass.
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
    .extract({ left: srcLeft, top: srcTop, width: cropWidth, height: cropHeight })
    .png()
    .toBuffer();
  return sharp(base, { raw: { width, height, channels: 4 } })
    .composite([{ input: cropped, left: destLeft, top: destTop, blend: "over" }])
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
 * One resample onto the printed card. Minifies use the same SS path as
 * costRing ({@link supersampleResize}); upscales stay single-pass.
 */
async function resizeRgba(
  layer: DecodedLayer,
  width: number,
  height: number,
  kernel: ResizeKernel,
  covered = false,
): Promise<Buffer> {
  if (layer.width === width && layer.height === height) {
    return covered ? premultiplyStraight(layer.rgba) : layer.rgba;
  }
  const source = covered ? premultiplyStraight(layer.rgba) : layer.rgba;
  return supersampleResize(
    source,
    layer.width,
    layer.height,
    width,
    height,
    kernel,
  );
}

/** `overlay` is straight alpha unless `premultiplied` is set. */
async function compositeOver(
  base: Buffer,
  width: number,
  height: number,
  overlay: Buffer,
  premultiplied = false,
): Promise<Buffer> {
  return sharp(base, { raw: { width, height, channels: 4 } })
    .composite([
      {
        input: overlay,
        raw: { width, height, channels: 4 },
        blend: "over",
        premultiplied,
      },
    ])
    .ensureAlpha()
    .raw()
    .toBuffer();
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

  const sides: Record<FwFaceSide, SideLayers> = {
    front: { picture: null, pictureName: "", text: {} },
    back: { picture: null, pictureName: "", text: {} },
  };
  for (const tree of iterClassTrees(loaded, 28)) {
    const name = String(tree.m_Name ?? tree.name ?? "");
    const layer = fusionWorldFaceLayer(name);
    if (!layer) continue;
    const decoded = decodeTextureTree(tree, loaded);
    if (!decoded) {
      stats.failed += 1;
      continue;
    }
    const slot = sides[layer.side];
    const pixels = {
      rgba: decoded.rgba,
      width: decoded.width,
      height: decoded.height,
    };
    if (layer.kind === "picture") {
      slot.picture = pixels;
      slot.pictureName = name;
    } else {
      slot.text[layer.lang] = pixels;
    }
  }

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
    for (const lang of langs) {
      const cardDir = packCardDir(DBS_FW_PACK_ID, {
        set: card.set,
        lang,
        card: card.folder,
      });
      const dest = path.join(cardDir, DBS_FW_CLIENT_FACE_FILES[side]);
      const facts = dbsFwFactsFor(card.set, card.number);
      const badgeName = clientBattleFrameName(
        facts?.cardType ?? null,
        facts?.color ?? null,
        facts?.cost ?? null,
      );
      if (!force) {
        const onDisk = existsSync(cardDir)
          ? new Set(readdirSync(cardDir))
          : new Set<string>();
        if (
          isClientFaceExtractCurrent(onDisk, side, badgeName != null)
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
        // Lanczos in sRGB byte space (Unity FilterMode.Bilinear ≈ cubic was
        // softer on glyphs; linear filtering cut gem edge energy ~40%).
        const pictureSized = await resizeRgba(
          picture,
          sized.width,
          sized.height,
          "lanczos3",
        );
        let composed = pictureSized;
        await writeLosslessRgbaWebp(
          pictureSized,
          sized.width,
          sized.height,
          path.join(path.dirname(dest), layers.picture),
        );
        const frameCard = {
          cardType: facts?.cardType ?? null,
          color: facts?.color ?? null,
          rarity: facts?.rarity ?? null,
          setCode: card.set,
          parallel: card.folder !== card.number,
          side,
        };
        let chrome: DecodedLayer[] | null = null;
        for (const name of clientFrameArrayCandidates(frameCard)) {
          chrome = frames.frame(name);
          if (chrome) break;
        }
        const ring = badgeName
          ? await frames.ring(facts?.color ?? "")
          : null;
        const ringAt = ring
          ? clientCostRingOffset(
              sized.width,
              sized.height,
              frames.ringGeometry() ?? undefined,
            )
          : null;
        // Frame chrome only — costRing is a separate layer (not baked into
        // `_FrameTex`), Frost-like: Front→Frame→disc→Chara→CostNumber.
        if (chrome) {
          for (const slice of chrome) {
            const frameSized = await resizeRgba(
              slice,
              sized.width,
              sized.height,
              "lanczos3",
            );
            await writeLosslessRgbaWebp(
              frameSized,
              sized.width,
              sized.height,
              path.join(path.dirname(dest), layers.frame),
            );
            composed = await compositeOver(
              composed,
              sized.width,
              sized.height,
              frameSized,
            );
          }
        }
        if (ring && ringAt) {
          const blank = Buffer.alloc(sized.width * sized.height * 4, 0);
          const ringLayer = await pasteSprite(
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
            path.join(path.dirname(dest), layers.costRing),
          );
          composed = await compositeOver(
            composed,
            sized.width,
            sized.height,
            ringLayer,
          );
        }
        // Glyph repair at native, then one lanczos (sRGB) minify to the
        // catalogue face. A prior half-box mip crushed FB01-044's collector
        // number in the BR corner; keep coverage for that stroke.
        const solidified = solidifyPlateInk(
          text.rgba,
          text.width,
          text.height,
        );
        const textPremul = await resizeRgba(
          { rgba: solidified, width: text.width, height: text.height },
          sized.width,
          sized.height,
          "lanczos3",
          true,
        );
        await writeLosslessRgbaWebp(
          unpremultiplyStraight(textPremul),
          sized.width,
          sized.height,
          path.join(path.dirname(dest), layers.text),
        );
        composed = await compositeOver(
          composed,
          sized.width,
          sized.height,
          textPremul,
          true,
        );
        const badge = badgeName ? frames.badge(badgeName) : null;
        if (badge) {
          composed = await compositeOver(
            composed,
            sized.width,
            sized.height,
            await resizeRgba(
              badge,
              sized.width,
              sized.height,
              "lanczos3",
              true,
            ),
            true,
          );
        }
        await writeLosslessRgbaWebp(composed, sized.width, sized.height, dest);
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
      .filter((c): c is NonNullable<typeof c> => Boolean(c?.folder.endsWith("-p1")))
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
    if (match && !`${print.set}-${print.number}`.includes(match.toLowerCase())) {
      continue;
    }
    const key = `${print.set}/${print.folder}`;
    if (seriesPara.has(key)) continue;
    const layer = fusionWorldFaceLayer(name);
    if (!layer) continue;
    const decoded = decodeTextureTree(tree, loaded);
    if (!decoded) {
      stats.failed += 1;
      continue;
    }
    let entry = byKey.get(key);
    if (!entry) {
      entry = {
        card: print,
        sides: {
          front: { picture: null, pictureName: "", text: {} },
          back: { picture: null, pictureName: "", text: {} },
        },
      };
      byKey.set(key, entry);
    }
    const pixels = {
      rgba: decoded.rgba,
      width: decoded.width,
      height: decoded.height,
    };
    const slot = entry.sides[layer.side];
    if (layer.kind === "picture") {
      slot.picture = pixels;
      slot.pictureName = name;
    } else {
      slot.text[layer.lang] = pixels;
    }
  }
  stats.bundles += byKey.size > 0 ? 1 : 0;
  for (const entry of byKey.values()) {
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

const CLIENT_FACE_NAMES = new Set<string>(Object.values(DBS_FW_CLIENT_FACE_FILES));

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
