/**
 * Texture2D bytes from UnityFS typetree + ``.resS`` (ADR-021 phase B).
 *
 * Hardcoded Texture2D readers in npm libs break on Unity 2022.3; typetree +
 * stream path is stable. Compressed formats via ``@arkntools/unity-js-tools``
 * (ASTC / ETC1 / BC1) — Live CDN ships ETC for some shared plates
 * (``TEX_StitchedRings``), Mac/desktop dumps use DXT1 for the same asset.
 */

import {
  decodeAstc,
  decodeBc1,
  decodeBc3,
  decodeBc7,
  decodeEtc1,
} from "@arkntools/unity-js-tools";

import {
  iterClassTrees,
  loadUnityFs,
  resolveBlobFromMap,
  resolveResourceBlob,
  type LoadedUnityFs,
  type UnityTypeTree,
} from "@/lib/unity/loadUnityFs";

/** Unity ``TextureFormat`` values we decode. */
export const TextureFormat = {
  /** BC1 / S3TC — Mac Live shadersbundle. */
  DXT1: 10,
  /** BC3 / DXT5 — desktop masks and most card faces. */
  DXT5: 12,
  /** Uncompressed RGB8 — desktop sleeves and the default card back. */
  RGB24: 3,
  /** Uncompressed RGBA8. */
  RGBA32: 4,
  /** BC7 — a few desktop plates. */
  BC7: 25,
  /** ETC1 RGB — Android Live CDN shadersbundle. */
  ETC_RGB4: 34,
  ASTC_RGB_4x4: 48,
  ASTC_RGB_5x5: 49,
  ASTC_RGB_6x6: 50,
  ASTC_RGB_8x8: 51,
  ASTC_RGB_10x10: 52,
  ASTC_RGB_12x12: 53,
  ASTC_RGBA_4x4: 54,
  ASTC_RGBA_5x5: 55,
  ASTC_RGBA_6x6: 56,
  ASTC_RGBA_8x8: 57,
  ASTC_RGBA_10x10: 58,
  ASTC_RGBA_12x12: 59,
} as const;

const ASTC_BLOCK: Record<number, number> = {
  [TextureFormat.ASTC_RGB_4x4]: 4,
  [TextureFormat.ASTC_RGB_5x5]: 5,
  [TextureFormat.ASTC_RGB_6x6]: 6,
  [TextureFormat.ASTC_RGB_8x8]: 8,
  [TextureFormat.ASTC_RGB_10x10]: 10,
  [TextureFormat.ASTC_RGB_12x12]: 12,
  [TextureFormat.ASTC_RGBA_4x4]: 4,
  [TextureFormat.ASTC_RGBA_5x5]: 5,
  [TextureFormat.ASTC_RGBA_6x6]: 6,
  [TextureFormat.ASTC_RGBA_8x8]: 8,
  [TextureFormat.ASTC_RGBA_10x10]: 10,
  [TextureFormat.ASTC_RGBA_12x12]: 12,
};

/** Block edge length for a Unity ASTC ``TextureFormat`` id, or null. */
export function astcBlockSize(format: number): number | null {
  return ASTC_BLOCK[format] ?? null;
}

/** True when {@link decodeTextureFormat} can expand this Unity format id. */
export function canDecodeTextureFormat(format: number): boolean {
  return (
    format === TextureFormat.DXT1 ||
    format === TextureFormat.DXT5 ||
    format === TextureFormat.RGB24 ||
    format === TextureFormat.RGBA32 ||
    format === TextureFormat.BC7 ||
    format === TextureFormat.ETC_RGB4 ||
    ASTC_BLOCK[format] != null
  );
}

/** WebGL2 compressed-texture enum name for an ASTC format id. */
export function webglAstcFormat(format: number): string | null {
  const block = ASTC_BLOCK[format];
  if (block == null) return null;
  return `COMPRESSED_RGBA_ASTC_${block}x${block}_KHR`;
}

/**
 * Preferred WebGL S3TC format name for a Unity TextureFormat + color space.
 * Caller still probes extensions — sRGB name needs `s3tc_srgb`.
 */
export function webglS3tcFormat(
  format: number,
  srgb: boolean,
): string | null {
  if (format === TextureFormat.DXT1) {
    return srgb
      ? "COMPRESSED_SRGB_ALPHA_S3TC_DXT1_EXT"
      : "COMPRESSED_RGBA_S3TC_DXT1_EXT";
  }
  if (format === TextureFormat.DXT5) {
    return srgb
      ? "COMPRESSED_SRGB_ALPHA_S3TC_DXT5_EXT"
      : "COMPRESSED_RGBA_S3TC_DXT5_EXT";
  }
  return null;
}

export type DecodedTexture2D = {
  name: string;
  width: number;
  height: number;
  format: number;
  /** sRGB when ``m_ColorSpace === 1``. */
  srgb: boolean;
  /** RGBA8, Unity/top-left (vertical flip; BCn/ASTC via BGRA→RGBA). */
  rgba: Buffer;
};

function streamInfo(tree: UnityTypeTree): {
  offset: number;
  size: number;
  path: string;
} | null {
  const sd = tree.m_StreamData;
  if (!sd || typeof sd !== "object") return null;
  const rec = sd as Record<string, unknown>;
  const offset = Number(rec.offset ?? 0);
  const size = Number(rec.size ?? 0);
  const path = typeof rec.path === "string" ? rec.path : "";
  if (!size || !path) return null;
  return { offset, size, path };
}

function inlineImageData(tree: UnityTypeTree): Uint8Array | null {
  const data = tree["image data"] ?? tree.image_data ?? tree.m_ImageData;
  if (data instanceof Uint8Array) return data;
  if (Array.isArray(data) && data.length > 0 && typeof data[0] === "number") {
    return Uint8Array.from(data as number[]);
  }
  return null;
}

/** BGRA → RGBA in place (arkntools ``decodeTexture`` convention). */
export function bgraToRgba(data: Buffer): Buffer {
  for (let i = 0; i + 3 < data.length; i += 4) {
    const b = data[i]!;
    data[i] = data[i + 2]!;
    data[i + 2] = b;
  }
  return data;
}

/** Flip vertically (UnityPy/Pillow origin vs ASTC block dump). */
export function flipRgbaVertical(rgba: Buffer, width: number, height: number): Buffer {
  const stride = width * 4;
  const out = Buffer.allocUnsafe(rgba.length);
  for (let y = 0; y < height; y++) {
    rgba.copy(out, (height - 1 - y) * stride, y * stride, (y + 1) * stride);
  }
  return out;
}

export function decodeTextureFormat(
  data: Uint8Array,
  width: number,
  height: number,
  format: number,
  name = "",
): Buffer {
  // ETC1: arkntools returns RGBA8 — flip only.
  if (format === TextureFormat.ETC_RGB4) {
    return flipRgbaVertical(
      Buffer.from(decodeEtc1(data, width, height)),
      width,
      height,
    );
  }
  // BCn (DXT1/5, BC7): arkntools / texture2ddecoder expand to BGRA8.
  if (format === TextureFormat.DXT1) {
    return flipRgbaVertical(
      bgraToRgba(Buffer.from(decodeBc1(data, width, height))),
      width,
      height,
    );
  }
  if (format === TextureFormat.DXT5) {
    return flipRgbaVertical(
      bgraToRgba(Buffer.from(decodeBc3(data, width, height))),
      width,
      height,
    );
  }
  if (format === TextureFormat.BC7) {
    return flipRgbaVertical(
      bgraToRgba(Buffer.from(decodeBc7(data, width, height))),
      width,
      height,
    );
  }
  if (format === TextureFormat.RGB24) {
    const pixels = width * height;
    const rgba = Buffer.alloc(pixels * 4);
    const view = data.subarray(0, pixels * 3);
    for (let i = 0; i < pixels; i++) {
      rgba[i * 4] = view[i * 3] ?? 0;
      rgba[i * 4 + 1] = view[i * 3 + 1] ?? 0;
      rgba[i * 4 + 2] = view[i * 3 + 2] ?? 0;
      rgba[i * 4 + 3] = 255;
    }
    return flipRgbaVertical(rgba, width, height);
  }
  if (format === TextureFormat.RGBA32) {
    const bytes = width * height * 4;
    return flipRgbaVertical(Buffer.from(data.subarray(0, bytes)), width, height);
  }
  const block = ASTC_BLOCK[format];
  if (block == null) {
    throw new Error(`Texture2D format ${format} not implemented (${name})`);
  }
  // ASTC: same BGRA8 convention as BCn.
  const decoded = Buffer.from(decodeAstc(data, width, height, block, block));
  return flipRgbaVertical(bgraToRgba(decoded), width, height);
}

function texturePayload(
  tree: UnityTypeTree,
  loaded: LoadedUnityFs,
): Uint8Array | null {
  const stream = streamInfo(tree);
  if (stream) {
    const blob = resolveResourceBlob(loaded, stream.path);
    if (!blob) return null;
    return blob.subarray(stream.offset, stream.offset + stream.size);
  }
  return inlineImageData(tree);
}

/** Byte length of one DXT1/DXT5/BC7 mip level. */
export function dxtMipByteSize(
  width: number,
  height: number,
  format: number,
): number {
  const block = Math.ceil(width / 4) * Math.ceil(height / 4);
  if (format === TextureFormat.DXT1) return block * 8;
  if (
    format === TextureFormat.DXT5 ||
    format === TextureFormat.BC7
  ) {
    return block * 16;
  }
  return 0;
}

/** Byte length of one uncompressed RGBA8 mip level. */
export function rgbaMipByteSize(width: number, height: number): number {
  return Math.max(1, width) * Math.max(1, height) * 4;
}

/**
 * Mip level `level` (≥ 1) of a Texture2D, already flipped to top-left.
 * The client builds these with a box filter; sampling them removes the
 * 4×4 stair the GPU hides. DXT plates, BC7 badges (`Blue_01_cost1`) and
 * RGBA32 rings (`Cost_01`) all ship a mip chain.
 */
export function decodeTextureMip(
  tree: UnityTypeTree,
  loaded: LoadedUnityFs,
  level: number,
): DecodedTexture2D | null {
  const name =
    (typeof tree.m_Name === "string" && tree.m_Name) ||
    (typeof tree.name === "string" && tree.name) ||
    "";
  const width = Number(tree.m_Width ?? 0);
  const height = Number(tree.m_Height ?? 0);
  const format = Number(tree.m_TextureFormat ?? 0);
  const mips = Number(tree.m_MipCount ?? 1);
  if (!name || width < 8 || height < 8 || level < 1 || mips <= level) {
    return null;
  }
  const payload = texturePayload(tree, loaded);
  if (!payload?.byteLength) return null;

  const compressed =
    format === TextureFormat.DXT1 ||
    format === TextureFormat.DXT5 ||
    format === TextureFormat.BC7;
  const rgba = format === TextureFormat.RGBA32;
  if (!compressed && !rgba) return null;

  let offset = 0;
  let levelWidth = width;
  let levelHeight = height;
  for (let i = 0; i < level; i += 1) {
    const bytes = compressed
      ? dxtMipByteSize(levelWidth, levelHeight, format)
      : rgbaMipByteSize(levelWidth, levelHeight);
    if (!bytes || payload.byteLength < offset + bytes) return null;
    offset += bytes;
    levelWidth = Math.max(1, levelWidth >> 1);
    levelHeight = Math.max(1, levelHeight >> 1);
  }
  const levelBytes = compressed
    ? dxtMipByteSize(levelWidth, levelHeight, format)
    : rgbaMipByteSize(levelWidth, levelHeight);
  if (!levelBytes || payload.byteLength < offset + levelBytes) return null;
  try {
    return {
      name,
      width: levelWidth,
      height: levelHeight,
      format,
      srgb: Number(tree.m_ColorSpace ?? 0) === 1,
      rgba: decodeTextureFormat(
        payload.subarray(offset, offset + levelBytes),
        levelWidth,
        levelHeight,
        format,
        name,
      ),
    };
  } catch {
    return null;
  }
}

/** Mip1 helper — see {@link decodeTextureMip}. */
export function decodeTextureMip1(
  tree: UnityTypeTree,
  loaded: LoadedUnityFs,
): DecodedTexture2D | null {
  return decodeTextureMip(tree, loaded, 1);
}

/** Decode one Texture2D typetree; null when format/resS path fails. */
export function decodeTextureTree(
  tree: UnityTypeTree,
  loaded: LoadedUnityFs,
): DecodedTexture2D | null {
  const name =
    (typeof tree.m_Name === "string" && tree.m_Name) ||
    (typeof tree.name === "string" && tree.name) ||
    "";
  const width = Number(tree.m_Width ?? 0);
  const height = Number(tree.m_Height ?? 0);
  const format = Number(tree.m_TextureFormat ?? 0);
  if (!name || width <= 0 || height <= 0) return null;
  if (!canDecodeTextureFormat(format)) return null;

  const payload = texturePayload(tree, loaded);
  if (!payload?.byteLength) return null;

  try {
    return {
      name,
      width,
      height,
      format,
      srgb: Number(tree.m_ColorSpace ?? 0) === 1,
      rgba: decodeTextureFormat(payload, width, height, format, name),
    };
  } catch {
    return null;
  }
}

type StreamDataRef = {
  offset?: number | bigint;
  size?: number | bigint;
  path?: string;
};

type UnityTextureObject = {
  name?: string;
  width?: number;
  height?: number;
  _width?: number;
  _height?: number;
  _textureFormat?: string | number;
  textureFormat?: string | number;
  _data?: Uint8Array;
  data?: Uint8Array | null;
  _streamData?: StreamDataRef;
  streamData?: StreamDataRef;
  decodeRgba?: (worker?: boolean) => Promise<Uint8Array | null>;
};

const FORMAT_BY_NAME: Record<string, number> = {
  RGB24: TextureFormat.RGB24,
  RGBA32: TextureFormat.RGBA32,
  DXT1: TextureFormat.DXT1,
  DXT5: TextureFormat.DXT5,
  BC7: TextureFormat.BC7,
  ETC_RGB4: TextureFormat.ETC_RGB4,
  ASTC_RGB_4x4: TextureFormat.ASTC_RGB_4x4,
  ASTC_RGB_5x5: TextureFormat.ASTC_RGB_5x5,
  ASTC_RGB_6x6: TextureFormat.ASTC_RGB_6x6,
  ASTC_RGB_8x8: TextureFormat.ASTC_RGB_8x8,
  ASTC_RGB_10x10: TextureFormat.ASTC_RGB_10x10,
  ASTC_RGB_12x12: TextureFormat.ASTC_RGB_12x12,
  ASTC_RGBA_4x4: TextureFormat.ASTC_RGBA_4x4,
  ASTC_RGBA_5x5: TextureFormat.ASTC_RGBA_5x5,
  ASTC_RGBA_6x6: TextureFormat.ASTC_RGBA_6x6,
  ASTC_RGBA_8x8: TextureFormat.ASTC_RGBA_8x8,
  ASTC_RGBA_10x10: TextureFormat.ASTC_RGBA_10x10,
  ASTC_RGBA_12x12: TextureFormat.ASTC_RGBA_12x12,
};

export function textureFormatId(tex: UnityTextureObject): number | null {
  const raw = tex._textureFormat ?? tex.textureFormat;
  if (typeof raw === "number") return raw;
  if (typeof raw === "string") return FORMAT_BY_NAME[raw] ?? null;
  return null;
}

/** Inline ``image data`` or ``m_StreamData`` slice from ``.resS``. */
export function pixelsFromTextureObject(
  tex: UnityTextureObject,
  resourceBlobs?: ReadonlyMap<string, Uint8Array>,
): Uint8Array | null {
  const inline = tex._data ?? tex.data;
  if (inline && inline.byteLength > 0) {
    return inline instanceof Uint8Array ? inline : new Uint8Array(inline);
  }
  if (!resourceBlobs?.size) return null;
  const sd = tex._streamData ?? tex.streamData;
  if (!sd?.path || sd.size == null) return null;
  const size = Number(sd.size);
  const offset = Number(sd.offset ?? 0);
  if (!Number.isFinite(size) || size <= 0 || !Number.isFinite(offset)) return null;
  const blob = resolveBlobFromMap(resourceBlobs, String(sd.path));
  if (!blob || offset + size > blob.byteLength) return null;
  return blob.subarray(offset, offset + size);
}

/**
 * Compressed formats via typetree + ``@arkntools/unity-js-tools``; other
 * formats fall back to unityfs-js ``decodeRgba``. Never call ``decodeRgba``
 * for formats we expand ourselves (TextureDecoderPool is stubbed → spam).
 */
export async function rgbaFromTexture2DObject(
  tex: UnityTextureObject,
  name = "",
  opts?: { resourceBlobs?: ReadonlyMap<string, Uint8Array> },
): Promise<{ rgba: Buffer; width: number; height: number } | null> {
  const width = Number(tex.width ?? tex._width ?? 0);
  const height = Number(tex.height ?? tex._height ?? 0);
  const format = textureFormatId(tex);
  const payload = pixelsFromTextureObject(tex, opts?.resourceBlobs);

  if (
    payload?.byteLength &&
    width > 0 &&
    height > 0 &&
    format != null &&
    canDecodeTextureFormat(format)
  ) {
    try {
      return {
        rgba: decodeTextureFormat(payload, width, height, format, name),
        width,
        height,
      };
    } catch {
      return null;
    }
  }

  if (format != null && canDecodeTextureFormat(format)) {
    return null;
  }

  const rgba = await tex.decodeRgba?.(false);
  if (!rgba?.length || !width || !height) return null;
  return { rgba: Buffer.from(rgba), width, height };
}

export function listTexture2D(loaded: LoadedUnityFs): DecodedTexture2D[] {
  const out: DecodedTexture2D[] = [];
  for (const tree of iterClassTrees(loaded, 28)) {
    const decoded = decodeTextureTree(tree, loaded);
    if (decoded) out.push(decoded);
  }
  return out;
}

export function decodeTexturesFromUnityFs(
  data: Uint8Array | ArrayBuffer | Buffer,
): DecodedTexture2D[] {
  return listTexture2D(loadUnityFs(data));
}
