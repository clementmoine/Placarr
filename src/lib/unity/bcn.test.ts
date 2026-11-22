import { describe, expect, it } from "vitest";

import { decodeBc1Rgba, decodeBc3Rgba } from "./bcn";

/** Bloc couleur BC1 / partie couleur BC3 : c0, c1 (RGB565 LE) + 16 index 2 bits. */
function colorBlock(c0: number, c1: number, indices: number[]): number[] {
  let bits = 0;
  indices.forEach((v, k) => {
    bits |= v << (2 * k);
  });
  return [
    c0 & 0xff,
    c0 >> 8,
    c1 & 0xff,
    c1 >> 8,
    bits & 0xff,
    (bits >>> 8) & 0xff,
    (bits >>> 16) & 0xff,
    (bits >>> 24) & 0xff,
  ];
}

/** Bloc alpha BC3 : a0, a1 + 16 index 3 bits (48 bits LE). */
function alphaBlock(a0: number, a1: number, indices: number[]): number[] {
  const bytes = [a0, a1, 0, 0, 0, 0, 0, 0];
  indices.forEach((v, k) => {
    const bit = 3 * k;
    for (let b = 0; b < 3; b++) {
      if ((v >> b) & 1) bytes[2 + ((bit + b) >> 3)] |= 1 << ((bit + b) & 7);
    }
  });
  return bytes;
}

const RED = 0xf800;
const BLUE = 0x001f;
const pixel = (rgba: Buffer, w: number, x: number, y: number) => [
  ...rgba.subarray((y * w + x) * 4, (y * w + x) * 4 + 4),
];

describe("decodeBc1Rgba", () => {
  it("mode 4 couleurs (c0 > c1) : extrémités et tiers interpolés", () => {
    const data = Uint8Array.from(
      colorBlock(RED, BLUE, [0, 1, 2, 3, ...Array(12).fill(0)]),
    );
    const out = decodeBc1Rgba(data, 4, 4);
    expect(pixel(out, 4, 0, 0)).toEqual([255, 0, 0, 255]);
    expect(pixel(out, 4, 1, 0)).toEqual([0, 0, 255, 255]);
    expect(pixel(out, 4, 2, 0)).toEqual([170, 0, 85, 255]);
    expect(pixel(out, 4, 3, 0)).toEqual([85, 0, 170, 255]);
  });

  it("mode 3 couleurs (c0 <= c1) : milieu, puis noir opaque (DXT1 Unity = RGB)", () => {
    const data = Uint8Array.from(
      colorBlock(BLUE, RED, [2, 3, ...Array(14).fill(0)]),
    );
    const out = decodeBc1Rgba(data, 4, 4);
    expect(pixel(out, 4, 0, 0)).toEqual([128, 0, 128, 255]);
    expect(pixel(out, 4, 1, 0)).toEqual([0, 0, 0, 255]);
  });
});

describe("decodeBc3Rgba", () => {
  it("alpha 8 valeurs (a0 > a1) et couleur toujours en mode 4 couleurs", () => {
    const alpha = alphaBlock(255, 0, [0, 1, 2, 7, ...Array(12).fill(0)]);
    // c0 <= c1 : BC3 ignore le mode 3 couleurs de BC1.
    const color = colorBlock(BLUE, RED, [3, ...Array(15).fill(0)]);
    const out = decodeBc3Rgba(Uint8Array.from([...alpha, ...color]), 4, 4);
    expect(out[3]).toBe(255);
    expect(out[4 + 3]).toBe(0);
    expect(out[8 + 3]).toBe(219); // (6·255 + 0) / 7
    expect(out[12 + 3]).toBe(36); // (1·255 + 6·0) / 7
    expect(pixel(out, 4, 0, 0).slice(0, 3)).toEqual([170, 0, 85]);
  });

  it("alpha 6 valeurs (a0 <= a1) : index 6 = 0, index 7 = 255", () => {
    const alpha = alphaBlock(10, 200, [6, 7, 2, ...Array(13).fill(0)]);
    const out = decodeBc3Rgba(
      Uint8Array.from([...alpha, ...colorBlock(RED, BLUE, Array(16).fill(0))]),
      4,
      4,
    );
    expect(out[3]).toBe(0);
    expect(out[4 + 3]).toBe(255);
    expect(out[8 + 3]).toBe(48); // (4·10 + 1·200) / 5
  });

  it("lit les index alpha au-delà du 32e bit (pixels 10–15) — régression unity-js-tools", () => {
    // Bloc réel (Fusion World ja/fb09/026, texte) : le paquet rendait 4 au pixel 11.
    const block = [
      0x04, 0x01, 0x49, 0x92, 0x24, 0xb6, 0x3d, 0x00, 0, 0, 0, 0, 0xaa, 0xaa,
      0xaa, 0xaa,
    ];
    const out = decodeBc3Rgba(Uint8Array.from(block), 4, 4);
    const alphas = Array.from({ length: 16 }, (_, k) => out[k * 4 + 3]);
    expect(alphas).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 3, 4, 4, 4]);
  });

  it("gère une taille qui n'est pas multiple de 4 (blocs coupés)", () => {
    const alpha = alphaBlock(255, 255, Array(16).fill(0));
    const color = colorBlock(RED, RED, Array(16).fill(0));
    const out = decodeBc3Rgba(Uint8Array.from([...alpha, ...color]), 3, 2);
    expect(out.length).toBe(3 * 2 * 4);
    expect(pixel(out, 3, 2, 1)).toEqual([255, 0, 0, 255]);
  });
});
