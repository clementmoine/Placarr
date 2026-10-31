import { describe, expect, it } from "vitest";

import {
  decodeFloat16Matrix,
  encodeFloat16Matrix,
  float16BitsToFloat32,
  float32ToFloat16Bits,
} from "@/lib/shared/float16";

describe("float16", () => {
  it.each([0, 1, -1, 0.5, -0.25, 100, 1e-3])(
    "round-trips scalar %p within float16 precision",
    (v) => {
      const bits = float32ToFloat16Bits(v);
      const back = float16BitsToFloat32(bits);
      expect(back).toBeCloseTo(v, 2);
    },
  );

  it("encodes a matrix at half byte size", () => {
    const src = Float32Array.from([0.1, 0.2, 0.3, 0.4]);
    const buf = encodeFloat16Matrix(src);
    expect(buf.byteLength).toBe(src.length * 2);
    const back = decodeFloat16Matrix(buf, src.length);
    for (let i = 0; i < src.length; i++) {
      expect(back[i]).toBeCloseTo(src[i]!, 2);
    }
  });

  it("rejects odd-length buffers", () => {
    expect(() => decodeFloat16Matrix(new Uint8Array([1]).buffer)).toThrow(
      /even/,
    );
  });
});
