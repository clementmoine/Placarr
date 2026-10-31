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
  let exp = ((x >>> 23) & 0xff) - 127 + 15;
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
  return out.buffer.slice(
    out.byteOffset,
    out.byteOffset + out.byteLength,
  );
}

/** Decode a little-endian float16 buffer into Float32Array. */
export function decodeFloat16Matrix(
  buffer: ArrayBuffer | ArrayBufferView,
  expectedLength?: number,
): Float32Array {
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
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = float16BitsToFloat32(view.getUint16(i * 2, true));
  }
  return out;
}
