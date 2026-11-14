import { describe, expect, it } from "vitest";

import {
  decodeFloat16Matrix,
  decodeFloat16MatrixChunked,
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

  it("table decode equals the scalar decode on every half pattern", () => {
    const halves = new Uint16Array(65536);
    for (let h = 0; h < 65536; h++) halves[h] = h;
    const out = decodeFloat16Matrix(halves.buffer, 65536);
    for (let h = 0; h < 65536; h++) {
      const ref = float16BitsToFloat32(h);
      if (Number.isNaN(ref)) expect(Number.isNaN(out[h])).toBe(true);
      else expect(Object.is(out[h], ref)).toBe(true);
    }
  });

  it("decodes unaligned views (sliced buffers) correctly", () => {
    const src = Float32Array.from([0.1, -0.2, 0.3]);
    const buf = encodeFloat16Matrix(src);
    const padded = new Uint8Array(buf.byteLength + 1);
    padded.set(new Uint8Array(buf), 1);
    const view = new Uint8Array(padded.buffer, 1, buf.byteLength);
    const back = decodeFloat16Matrix(view, 3);
    for (let i = 0; i < 3; i++) expect(back[i]).toBeCloseTo(src[i]!, 2);
  });

  it("chunked decode yields between slices and matches the sync decode", async () => {
    const src = new Float32Array(1000).map((_, i) => Math.sin(i));
    const buf = encodeFloat16Matrix(src);
    let yields = 0;
    const out = await decodeFloat16MatrixChunked(buf, 1000, {
      chunk: 300,
      yieldFn: async () => {
        yields += 1;
      },
    });
    expect(yields).toBe(3);
    expect(Array.from(out)).toEqual(Array.from(decodeFloat16Matrix(buf)));
  });

  it("rejects odd-length buffers", () => {
    expect(() => decodeFloat16Matrix(new Uint8Array([1]).buffer)).toThrow(
      /even/,
    );
  });
});
