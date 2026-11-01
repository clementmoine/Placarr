/**
 * IEEE float16 ↔ float32 helpers (little-endian buffers).
 * Used for on-device embedding shards (~½ RAM vs f32).
 */

/** Pack one float32 into a uint16 float16 bit pattern. */
export function float32ToFloat16Bits(value: number): number {
  const f32 = new Float32Array(1);
  const u32 = new Uint32Array(f32.buffer);
  f32[0] = value;
  const x = u32[0]!;

  const sign = (x >>> 16) & 0x8000;
  const exp = ((x >>> 23) & 0xff) - 127 + 15;
  let mant = x & 0x7fffff;

  if (exp <= 0) {
    if (exp < -10) return sign;
    mant = (mant | 0x800000) >> (1 - exp);
    return sign | ((mant + 0x1000) >> 13);
  }
  if (exp >= 31) {
    // Inf / NaN
    return sign | 0x7c00 | (mant ? 0x200 : 0);
  }
  return sign | (exp << 10) | ((mant + 0x1000) >> 13);
}

/** Decode one uint16 float16 bit pattern to float32. */
export function float16BitsToFloat32(h: number): number {
  const sign = (h & 0x8000) << 16;
  let exp = (h >> 10) & 0x1f;
  let mant = h & 0x3ff;
  const u32 = new Uint32Array(1);
  const f32 = new Float32Array(u32.buffer);

  if (exp === 0) {
    if (mant === 0) {
      u32[0] = sign;
      return f32[0]!;
    }
    // Subnormal → normalize
    exp = 1;
    while (!(mant & 0x400)) {
      mant <<= 1;
      exp -= 1;
    }
    mant &= 0x3ff;
    exp = exp - 15 + 127;
    u32[0] = sign | (exp << 23) | (mant << 13);
    return f32[0]!;
  }
  if (exp === 31) {
    u32[0] = sign | 0x7f800000 | (mant << 13);
    return f32[0]!;
  }
  exp = exp - 15 + 127;
  u32[0] = sign | (exp << 23) | (mant << 13);
  return f32[0]!;
}

/** Encode a Float32Array into a little-endian Float16 ArrayBuffer. */
export function encodeFloat16Matrix(src: Float32Array): ArrayBuffer {
  const out = new Uint16Array(src.length);
  for (let i = 0; i < src.length; i++) {
    out[i] = float32ToFloat16Bits(src[i]!);
  }
  return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength);
}

/**
 * All 65 536 half values decoded once (256 KB). Decoding a 56 MB shard
 * through the scalar path allocated two typed arrays per element and froze
 * the camera for seconds; the table makes it a plain gather.
 */
let halfTable: Float32Array | null = null;
function float16Table(): Float32Array {
  if (!halfTable) {
    const t = new Float32Array(65536);
    for (let h = 0; h < 65536; h++) t[h] = float16BitsToFloat32(h);
    halfTable = t;
  }
  return halfTable;
}

function halfView(
  buffer: ArrayBuffer | ArrayBufferView,
  expectedLength?: number,
): Uint16Array {
  const bytes =
    buffer instanceof ArrayBuffer
      ? new Uint8Array(buffer)
      : new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  if (bytes.byteLength % 2 !== 0) {
    throw new Error("float16 buffer length must be even");
  }
  const n = bytes.byteLength / 2;
  if (expectedLength != null && n !== expectedLength) {
    throw new Error(
      `float16 length mismatch: got ${n}, expected ${expectedLength}`,
    );
  }
  if (bytes.byteOffset % 2 === 0) {
    return new Uint16Array(bytes.buffer, bytes.byteOffset, n);
  }
  // Unaligned view (rare: sliced buffers) — copy to an aligned one.
  const aligned = new Uint16Array(n);
  new Uint8Array(aligned.buffer).set(bytes);
  return aligned;
}

/** Decode a little-endian float16 buffer into Float32Array. */
export function decodeFloat16Matrix(
  buffer: ArrayBuffer | ArrayBufferView,
  expectedLength?: number,
): Float32Array {
  const halves = halfView(buffer, expectedLength);
  const table = float16Table();
  const out = new Float32Array(halves.length);
  for (let i = 0; i < halves.length; i++) out[i] = table[halves[i]!]!;
  return out;
}

/**
 * Same decode, but yielding to the event loop every `chunk` elements so a
 * large shard never blocks the camera loop (≈ 4 M halves per slice ≈ 10 ms).
 */
export async function decodeFloat16MatrixChunked(
  buffer: ArrayBuffer | ArrayBufferView,
  expectedLength?: number,
  opts?: { chunk?: number; yieldFn?: () => Promise<void> },
): Promise<Float32Array> {
  const halves = halfView(buffer, expectedLength);
  const table = float16Table();
  const out = new Float32Array(halves.length);
  const chunk = Math.max(1, opts?.chunk ?? 4_000_000);
  const yieldFn =
    opts?.yieldFn ?? (() => new Promise<void>((r) => setTimeout(r, 0)));
  for (let start = 0; start < halves.length; start += chunk) {
    const end = Math.min(halves.length, start + chunk);
    for (let i = start; i < end; i++) out[i] = table[halves[i]!]!;
    if (end < halves.length) await yieldFn();
  }
  return out;
}
