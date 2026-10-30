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
    ).toBe("/assets/naruto/carddass/products/booster-s1/fr/face");
  });

  it("returns null when nothing is on disk (no phantom filename URL)", () => {
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
    ).toBeNull();
  });

  it("keeps remote CDN fallbacks when no local dump exists", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "packshot-"));
    roots.push(root);
    vi.stubEnv("PLACARR_DATA_DIR", root);
    const remote =
      "https://static.pkmcards.fr/products/fr/boosters/booster-sv8.webp";
    expect(
      resolveSealedPackshotUrl({
        packId: "pokemon",
        slug: "booster-sv8",
        lang: "fr",
        fallback: remote,
      }),
    ).toBe(remote);
  });

  it("emits /face when an art.* dump exists (no basename in URL)", () => {
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
    ).toBe("/assets/naruto/carddass/products/booster-s24/fr/face");
  });
});

describe("backfillSealedProductPackshots", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("fills null image as /face from face.json", () => {
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
      "/assets/naruto/carddass/products/display-s7/en/face",
    );
    // No dump for `other` → stale filename URL left alone.
    expect(products.b.image).toBe(
      "/assets/naruto/carddass/products/other/fr/art.webp",
    );
  });

  it("rewrites mislabeled art.mercari to /face when face.json is art.reconstructed", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "packshot-mislabeled-"));
    vi.stubEnv("PLACARR_DATA_DIR", root);
    const products: Record<
      string,
      { slug: string; lang: string; image: string }
    > = {};
    for (const slug of [
      "tin-box-hobby",
      "pack-decouverte",
      "kana-dvd-naruto-vol3",
    ]) {
      const dir = path.join(root, "naruto", "carddass", "products", slug, "fr");
      mkdirSync(dir, { recursive: true });
      const art =
        slug === "tin-box-hobby"
          ? "art.reconstructed.png"
          : "art.reconstructed.jpg";
      writeFileSync(path.join(dir, art), "bytes");
      writeFileSync(
        path.join(dir, "face.json"),
        `${JSON.stringify({ art }, null, 2)}\n`,
      );
      products[slug] = {
        slug,
        lang: "fr",
        image: `/assets/naruto/carddass/products/${slug}/fr/art.mercari.${slug === "tin-box-hobby" ? "png" : "jpg"}`,
      };
    }
    expect(backfillSealedProductPackshots("naruto/carddass", products)).toBe(3);
    expect(products["tin-box-hobby"]!.image).toBe(
      "/assets/naruto/carddass/products/tin-box-hobby/fr/face",
    );
    expect(products["pack-decouverte"]!.image).toBe(
      "/assets/naruto/carddass/products/pack-decouverte/fr/face",
    );
    expect(products["kana-dvd-naruto-vol3"]!.image).toBe(
      "/assets/naruto/carddass/products/kana-dvd-naruto-vol3/fr/face",
    );
  });

  it("rewrites a 404 index URL to /face when face.json points at a real packshot", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "packshot-stale-"));
    vi.stubEnv("PLACARR_DATA_DIR", root);
    const dir = path.join(
      root,
      "naruto",
      "carddass",
      "products",
      "tin-box-hobby",
      "fr",
    );
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, "art.reconstructed.png"), "png");
    writeFileSync(
      path.join(dir, "face.json"),
      `${JSON.stringify({ art: "art.reconstructed.png" }, null, 2)}\n`,
    );

    const products = {
      hobby: {
        slug: "tin-box-hobby",
        lang: "FR",
        image:
          "/assets/naruto/carddass/products/tin-box-hobby/fr/art.mercari.png",
      },
    };
    expect(backfillSealedProductPackshots("naruto/carddass", products)).toBe(1);
    expect(products.hobby.image).toBe(
      "/assets/naruto/carddass/products/tin-box-hobby/fr/face",
    );
  });
});
