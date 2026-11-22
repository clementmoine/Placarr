import { describe, expect, it } from "vitest";

import { composeClientFaceRgba } from "./composeClientFace";

function solid(w: number, h: number, rgba: [number, number, number, number]) {
  const buf = Buffer.alloc(w * h * 4);
  for (let i = 0; i < buf.length; i += 4) buf.set(rgba, i);
  return { rgba: buf, width: w, height: h };
}

const at = (rgba: Buffer, w: number, x: number, y: number) => [
  ...rgba.subarray((y * w + x) * 4, (y * w + x) * 4 + 4),
];

describe("composeClientFaceRgba", () => {
  it("part d'un fond blanc opaque quand aucun calque ne couvre", async () => {
    const out = await composeClientFaceRgba([solid(8, 8, [0, 0, 0, 0])], 4, 4);
    expect(at(out, 4, 1, 1)).toEqual([255, 255, 255, 255]);
  });

  it("applique la fusion `over` du shader (alpha droit) dans l'ordre donné", async () => {
    const out = await composeClientFaceRgba(
      [solid(4, 4, [0, 0, 255, 255]), solid(4, 4, [255, 0, 0, 128])],
      4,
      4,
    );
    // 128/255 de rouge sur bleu opaque.
    expect(at(out, 4, 0, 0)).toEqual([128, 0, 127, 255]);
  });

  it("réduit chaque calque à la taille de la carte (Lanczos), même s'il est anamorphosé", async () => {
    const out = await composeClientFaceRgba(
      [solid(512, 1024, [10, 200, 30, 255])],
      733,
      1024,
    );
    expect(out.length).toBe(733 * 1024 * 4);
    expect(at(out, 733, 366, 512)).toEqual([10, 200, 30, 255]);
  });

  it("ne noircit pas les bords d'un calque semi-transparent (alpha prémultiplié au redimensionnement)", async () => {
    // Damier rouge opaque / noir transparent : la couleur réduite doit rester rouge.
    const w = 8;
    const buf = Buffer.alloc(w * w * 4);
    for (let y = 0; y < w; y++) {
      for (let x = 0; x < w; x++) {
        if ((x + y) % 2 === 0) buf.set([255, 0, 0, 255], (y * w + x) * 4);
      }
    }
    const out = await composeClientFaceRgba(
      [{ rgba: buf, width: w, height: w }],
      2,
      2,
    );
    const [r, g, b] = at(out, 2, 0, 0);
    // ~50 % de rouge sur blanc : rose, jamais assombri vers le brun.
    expect(r).toBe(255);
    expect(g).toBeGreaterThan(110);
    expect(g).toBe(b);
  });
});
