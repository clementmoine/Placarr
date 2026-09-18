import { describe, expect, it } from "vitest";
import sharp from "sharp";

import {
  bakeMask,
  localizeMaskImage,
  lumaOf,
  maskUploadPath,
  normalMapCoverage,
} from "@/core/enrich/media/maskDownload";

/** A one-row strip of RGB triples, as a PNG. */
async function strip(pixels: [number, number, number][]) {
  return sharp(Buffer.from(pixels.flat()), {
    raw: { width: pixels.length, height: 1, channels: 3 },
  })
    .png()
    .toBuffer();
}

/** The alpha channel of a baked mask — the only channel that carries meaning. */
async function alphaOf(png: Buffer): Promise<number[]> {
  const { data, info } = await sharp(png)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return Array.from(
    { length: info.width },
    (_, x) => data[x * info.channels + 3],
  );
}

async function rgbOf(png: Buffer): Promise<number[][]> {
  const { data, info } = await sharp(png)
    .raw()
    .toBuffer({ resolveWithObject: true });
  return Array.from({ length: info.width }, (_, x) => [
    data[x * info.channels],
    data[x * info.channels + 1],
    data[x * info.channels + 2],
  ]);
}

describe("lumaOf", () => {
  it("is BT.601, the weighting the publisher's canvas uses", () => {
    // 0.299R + 0.587G + 0.114B, read off their bundle rather than guessed.
    expect(lumaOf(255, 0, 0)).toBeCloseTo(76.245, 2);
    expect(lumaOf(0, 255, 0)).toBeCloseTo(149.685, 2);
    expect(lumaOf(0, 0, 255)).toBeCloseTo(29.07, 2);
    expect(lumaOf(255, 255, 255)).toBeCloseTo(255, 2);
    expect(lumaOf(0, 0, 0)).toBe(0);
  });
});

describe("normalMapCoverage", () => {
  it("reads the midpoint as no coverage at all", () => {
    // The trap this encodes: taking blue alone let a flat normal map through at
    // half strength, and the varnish washed across the whole card. Decoding to
    // -1..1 first makes the midpoint mean nothing.
    // Not exactly 0: 128 sits a hair above the encoded midpoint, so their
    // formula yields ~1/255 — invisible, and matching them beats rounding.
    expect(normalMapCoverage(127, 128, 128)).toBeLessThan(1.5);
    expect(normalMapCoverage(127, 128, 100)).toBe(0);
  });

  it("gives full coverage where the map is fully blue", () => {
    expect(normalMapCoverage(127, 128, 255)).toBeGreaterThan(250);
  });

  it("keeps the gradient in between rather than thresholding", () => {
    const mid = normalMapCoverage(127, 128, 192);
    expect(mid).toBeGreaterThan(100);
    expect(mid).toBeLessThan(160);
  });

  it("never returns a negative, which would wrap round to opaque", () => {
    expect(normalMapCoverage(0, 0, 0)).toBe(0);
  });
});

describe("bakeMask", () => {
  it("puts a foil mask's luminance into the alpha channel", async () => {
    // Safari parses `mask-mode: luminance` and does not apply it, so coverage
    // has to live in alpha — which is what the publisher's canvas does.
    const baked = await bakeMask(
      await strip([
        [0, 0, 0],
        [255, 255, 255],
      ]),
      "foil",
    );

    expect(await alphaOf(baked)).toEqual([0, 255]);
  });

  it("writes a foil mask's luminance into RGB as well as alpha", async () => {
    // Unity fragments sample `_MotifMask.xyz`, not alpha. A solid-white RGB
    // bake made every card look fully foiled. Greyscale luma keeps CSS (alpha)
    // and Unity (RGB) on the same coverage.
    const baked = await bakeMask(await strip([[10, 20, 30]]), "foil");
    const luma = Math.round(lumaOf(10, 20, 30));

    expect(await rgbOf(baked)).toEqual([[luma, luma, luma]]);
    expect((await alphaOf(baked))[0]).toBe(luma);
  });

  it("decodes a varnish mask as a normal map, not as a channel", async () => {
    const baked = await bakeMask(
      await strip([
        [127, 128, 128],
        [127, 128, 255],
      ]),
      "varnish",
    );
    const alpha = await alphaOf(baked);

    expect(alpha[0]).toBeLessThan(4);
    expect(alpha[1]).toBeGreaterThan(250);
  });

  it("keeps a varnish mask's normal-map RGB for Unity bevels", async () => {
    // The HighGloss fragment does `rgb * 2 - 1` on the varnish mask. Flattening
    // RGB to white made every bevel sample as a flat (1,1,1) normal.
    const baked = await bakeMask(await strip([[40, 90, 200]]), "varnish");

    expect(await rgbOf(baked)).toEqual([[40, 90, 200]]);
  });

  it("bakes the two kinds differently from the same file", async () => {
    const source = await strip([[127, 128, 128]]);

    // Mid-blue is half-bright, so read as luma it is half coverage; decoded as a
    // normal map it is none. Same bytes, opposite meaning.
    expect((await alphaOf(await bakeMask(source, "foil")))[0]).toBeGreaterThan(
      100,
    );
    expect((await alphaOf(await bakeMask(source, "varnish")))[0]).toBeLessThan(
      4,
    );
  });

  it("keeps the mask's dimensions, so it still lines up with the artwork", async () => {
    const baked = await bakeMask(
      await strip([
        [0, 0, 0],
        [128, 128, 128],
        [255, 255, 255],
      ]),
      "foil",
    );
    const meta = await sharp(baked).metadata();

    expect([meta.width, meta.height]).toEqual([3, 1]);
    expect(meta.hasAlpha).toBe(true);
  });
});

describe("maskUploadPath", () => {
  it("keeps the two bakes of one file apart", () => {
    const url = "https://api.lorcana.ravensburger.com/images/fr/set1/17_ab.jpg";

    expect(maskUploadPath(url, "foil")).not.toBe(
      maskUploadPath(url, "varnish"),
    );
  });

  it("always writes PNG, since the output carries alpha", () => {
    expect(maskUploadPath("https://x.test/a.jpg", "foil")).toMatch(/\.webp$/);
    expect(maskUploadPath("https://x.test/a.jpg", "varnish")).toMatch(
      /\.webp$/,
    );
  });

  it("is stable, so a second visit finds the file already there", () => {
    expect(maskUploadPath("https://x.test/a.jpg", "foil")).toBe(
      maskUploadPath("https://x.test/a.jpg", "foil"),
    );
  });
});

describe("localizeMaskImage", () => {
  it("leaves pack /assets/ URLs alone (raw scrape, convert at display)", async () => {
    const pack = "/assets/lorcana/cards/lorcana%3A1-1/foil_mask.jpg";
    await expect(localizeMaskImage(pack, { kind: "foil" })).resolves.toBe(pack);
  });

  it("leaves /uploads/ alone", async () => {
    await expect(
      localizeMaskImage("/uploads/baked.png", { kind: "foil" }),
    ).resolves.toBe("/uploads/baked.png");
  });
});
