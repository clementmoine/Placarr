/**
 * Texture2D bytes from UnityFS typetree + ``.resS`` (ADR-021 phase B).
 *
 * Hardcoded Texture2D readers in npm libs break on Unity 2022.3; typetree +
 * stream path is stable. ASTC decode via ``@arkntools/unity-js-tools``.
 */

import { decodeAstc } from "@arkntools/unity-js-tools";

import {
  iterClassTrees,
  loadUnityFs,
  resolveBlobFromMap,
  resolveResourceBlob,
  type LoadedUnityFs,
  type UnityTypeTree,
} from "@/lib/unity/loadUnityFs";

/** Unity ``TextureFormat`` values we decode (Live CDN = ASTC_RGB_8x8 = 51). */
export const TextureFormat = {
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

/** WebGL2 compressed-texture enum name for an ASTC format id. */
export function webglAstcFormat(format: number): string | null {
  const block = ASTC_BLOCK[format];
  if (block == null) return null;
  return `COMPRESSED_RGBA_ASTC_${block}x${block}_KHR`;
}

export type DecodedTexture2D = {
  name: string;
  width: number;
  height: number;
  format: number;
  /** sRGB when ``m_ColorSpace === 1``. */
  srgb: boolean;
  /** RGBA8, Unity/top-left (after BGRA swap + vertical flip to match UnityPy/Pillow). */
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
  const block = ASTC_BLOCK[format];
  if (block == null) {
    throw new Error(`Texture2D format ${format} not implemented (${name})`);
  }
  const decoded = Buffer.from(decodeAstc(data, width, height, block, block));
  return flipRgbaVertical(bgraToRgba(decoded), width, height);
}

/** Decode one Texture2D typetree; null when ASTC/resS path fails. */
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

  const stream = streamInfo(tree);
  let payload: Uint8Array | null = null;
  if (stream) {
    const blob = resolveResourceBlob(loaded, stream.path);
    if (!blob) return null;
    payload = blob.subarray(stream.offset, stream.offset + stream.size);
  } else {
    payload = inlineImageData(tree);
  }
  if (!payload?.byteLength) return null;
  if (!ASTC_BLOCK[format]) return null;

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
 * ASTC via inline/resS + ``@arkntools/unity-js-tools``; other formats via
 * unityfs-js ``decodeRgba``. Never call ``decodeRgba`` for known ASTC
 * (TextureDecoderPool is stubbed → log spam + fail).
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
    ASTC_BLOCK[format]
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

  if (format != null && ASTC_BLOCK[format]) {
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
