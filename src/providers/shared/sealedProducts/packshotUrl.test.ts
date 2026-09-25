import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  backfillSealedProductPackshots,
  resolveSealedPackshotUrl,
} from "./packshotUrl";

describe("resolveSealedPackshotUrl", () => {
  const roots: string[] = [];

  afterEach(() => {
    vi.unstubAllEnvs();
    void roots;
  });

  it("prefers face.json art over a stale index gif", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "packshot-"));
    roots.push(root);
    vi.stubEnv("PLACARR_DATA_DIR", root);
    const dir = path.join(
      root,
      "naruto",
      "carddass",
      "products",
      "booster-s1",
      "fr",
    );
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, "art.vialudibunda.jpg"), "jpg");
    writeFileSync(path.join(dir, "art.carddass.gif"), "gif");
    writeFileSync(
      path.join(dir, "face.json"),
      `${JSON.stringify({ art: "art.vialudibunda.jpg" }, null, 2)}\n`,
    );

    expect(
      resolveSealedPackshotUrl({
        packId: "naruto/carddass",
        slug: "booster-s1",
        lang: "fr",
        fallback:
          "/assets/naruto/carddass/products/booster-s1/fr/art.carddass.gif",
      }),
    ).toBe(
      "/assets/naruto/carddass/products/booster-s1/fr/art.vialudibunda.jpg",
    );
  });

  it("falls back to the index image when face.json is absent", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "packshot-"));
    roots.push(root);
    vi.stubEnv("PLACARR_DATA_DIR", root);
    expect(
      resolveSealedPackshotUrl({
        packId: "naruto/carddass",
        slug: "tin-box",
        lang: "fr",
        fallback: "/assets/naruto/carddass/products/tin-box/fr/art.jpeg",
      }),
    ).toBe("/assets/naruto/carddass/products/tin-box/fr/art.jpeg");
  });

  it("picks an art.* dump when index image is null and face.json is absent", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "packshot-"));
    roots.push(root);
    vi.stubEnv("PLACARR_DATA_DIR", root);
    const dir = path.join(
      root,
      "naruto",
      "carddass",
      "products",
      "booster-s24",
      "fr",
    );
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, "art.toywiz.jpg"), "jpg");

    expect(
      resolveSealedPackshotUrl({
        packId: "naruto/carddass",
        slug: "booster-s24",
        lang: "fr",
        fallback: null,
      }),
    ).toBe("/assets/naruto/carddass/products/booster-s24/fr/art.toywiz.jpg");
  });
});

describe("backfillSealedProductPackshots", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("fills null image from face.json without rewriting existing URLs", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "packshot-bf-"));
    vi.stubEnv("PLACARR_DATA_DIR", root);
    const dir = path.join(
      root,
      "naruto",
      "carddass",
      "products",
      "display-s7",
      "en",
    );
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, "art.bandai-drive.png"), "png");
    writeFileSync(
      path.join(dir, "face.json"),
      `${JSON.stringify({ art: "art.bandai-drive.png" }, null, 2)}\n`,
    );

    const products = {
      a: {
        slug: "display-s7",
        lang: "en",
        image: null as string | null,
      },
      b: {
        slug: "other",
        lang: "fr",
        image: "/assets/naruto/carddass/products/other/fr/art.webp",
      },
    };
    expect(backfillSealedProductPackshots("naruto/carddass", products)).toBe(1);
    expect(products.a.image).toBe(
      "/assets/naruto/carddass/products/display-s7/en/art.bandai-drive.png",
    );
    expect(products.b.image).toBe(
      "/assets/naruto/carddass/products/other/fr/art.webp",
    );
  });
});
