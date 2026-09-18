import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { packProductsIndexPath, packSealedProductsDir } from "@/lib/packPaths";

import { writeLocalSealedProducts } from "./localWrite";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
  vi.unstubAllEnvs();
});

function tmpDataRoot(): string {
  const root = mkdtempSync(path.join(os.tmpdir(), "local-sealed-"));
  roots.push(root);
  vi.stubEnv("PLACARR_DATA_DIR", root);
  return root;
}

const TINY = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);

describe("writeLocalSealedProducts", () => {
  it("copies packshots into products/ and skips a SKU without art", () => {
    tmpDataRoot();
    const staging = mkdtempSync(path.join(os.tmpdir(), "sealed-staging-"));
    roots.push(staging);
    const wrapper = path.join(staging, "wrap.jpg");
    writeFileSync(wrapper, TINY);
    writeFileSync(path.join(staging, "logo.jpg"), TINY);

    const report = writeLocalSealedProducts({
      packId: "naruto/ninja-ranks",
      source: "inkworks",
      products: [
        {
          slug: "booster",
          kind: "booster",
          category: "boosters",
          name: "Ninja Ranks booster pack",
          setCode: "nr",
          lang: "EN",
          releaseDate: "2006-03",
          declaredCardCount: 9,
          path: "http://www.inkworks.com/products/naruto/ninjaranks/naruto.html",
          artPath: wrapper,
          logoPath: path.join(staging, "logo.jpg"),
        },
        {
          slug: "missing",
          kind: "display",
          category: "displays",
          name: "Ghost",
          setCode: "nr",
          lang: "EN",
          releaseDate: "2006-03",
          declaredCardCount: null,
          artPath: path.join(staging, "nope.jpg"),
        },
      ],
    });

    expect(report).toMatchObject({ written: 1, skipped: 1 });
    expect(
      existsSync(
        path.join(
          packSealedProductsDir("naruto/ninja-ranks"),
          "booster",
          "en",
          "art.inkworks.jpg",
        ),
      ),
    ).toBe(true);
    const index = JSON.parse(
      readFileSync(packProductsIndexPath("naruto/ninja-ranks"), "utf8"),
    ) as {
      products: Record<
        string,
        { kind: string; image: string; setLogo: string }
      >;
    };
    const entry = index.products["naruto/ninja-ranks::booster"];
    expect(entry.kind).toBe("booster");
    expect(entry.image).toBe(
      "/assets/naruto/ninja-ranks/products/booster/en/art.inkworks.jpg",
    );
    expect(entry.setLogo).toBe(
      "/assets/naruto/ninja-ranks/products/booster/en/logo.inkworks.jpg",
    );
    expect(index.products["naruto/ninja-ranks::missing"]).toBeUndefined();
  });

  it("does not treat a product dump as a card face", () => {
    tmpDataRoot();
    const staging = mkdtempSync(path.join(os.tmpdir(), "sealed-staging-"));
    roots.push(staging);
    const wrapper = path.join(staging, "wrap.jpg");
    writeFileSync(wrapper, TINY);
    writeLocalSealedProducts({
      packId: "naruto/ninja-ranks",
      source: "inkworks",
      products: [
        {
          slug: "booster",
          kind: "booster",
          category: "boosters",
          name: "Ninja Ranks booster pack",
          setCode: "nr",
          lang: "EN",
          releaseDate: "2006-03",
          declaredCardCount: 9,
          artPath: wrapper,
        },
      ],
    });
    expect(
      existsSync(
        path.join(packSealedProductsDir("naruto/ninja-ranks"), "..", "cards"),
      ),
    ).toBe(false);
  });

  it("keeps extra host dumps beside the displayed packshot", () => {
    tmpDataRoot();
    const staging = mkdtempSync(path.join(os.tmpdir(), "sealed-staging-"));
    roots.push(staging);
    const primary = path.join(staging, "wrap.jpg");
    const extra = path.join(staging, "fan.jpg");
    writeFileSync(primary, TINY);
    writeFileSync(extra, TINY);
    writeLocalSealedProducts({
      packId: "naruto/ultra-challenge",
      source: "reconstructed",
      products: [
        {
          slug: "booster",
          kind: "booster",
          category: "boosters",
          name: "Ultra Challenge booster",
          setCode: null,
          lang: "fr",
          releaseDate: "2007-09",
          declaredCardCount: 8,
          artPath: primary,
          extraDumps: [{ source: "coleka", artPath: extra }],
        },
      ],
    });
    const dest = path.join(
      packSealedProductsDir("naruto/ultra-challenge"),
      "booster",
      "fr",
    );
    expect(existsSync(path.join(dest, "art.reconstructed.jpg"))).toBe(true);
    expect(existsSync(path.join(dest, "art.coleka.jpg"))).toBe(true);
    const index = JSON.parse(
      readFileSync(packProductsIndexPath("naruto/ultra-challenge"), "utf8"),
    ) as { products: Record<string, { image: string }> };
    expect(index.products["naruto/ultra-challenge::booster"]?.image).toBe(
      "/assets/naruto/ultra-challenge/products/booster/fr/art.reconstructed.jpg",
    );
  });
});
