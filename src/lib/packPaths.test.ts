import { describe, expect, it } from "vitest";

import {
  assetsCardUrl,
  cardDiskIdFromBundleStem,
  cardDiskIdFromPrintKey,
  pokemonCardTextureUrl,
  pokemonFaceFileFromTex,
} from "./packPaths";

describe("packPaths", () => {
  it("maps Lorcana printKey to set/lang/card", () => {
    expect(cardDiskIdFromPrintKey("lorcana:q2-14", "fr")).toEqual({
      set: "q2",
      lang: "fr",
      card: "14",
    });
    expect(cardDiskIdFromPrintKey("lorcana:1-20-p1", "en")).toEqual({
      set: "1",
      lang: "en",
      card: "20-p1",
    });
  });

  it("maps Live bundle stems", () => {
    expect(cardDiskIdFromBundleStem("me5_fr_045")).toEqual({
      set: "me5",
      lang: "fr",
      card: "045",
    });
    expect(cardDiskIdFromBundleStem("swsh10-5_fr_011")).toEqual({
      set: "swsh10-5",
      lang: "fr",
      card: "011",
    });
  });

  it("builds assets card URLs and canonical face names", () => {
    expect(
      assetsCardUrl("lorcana", { set: "1", lang: "fr", card: "1" }, "art.jpg"),
    ).toBe("/assets/lorcana/cards/1/fr/1/art.jpg");
    expect(pokemonFaceFileFromTex("me5_fr_045", "me5_wp_fr_045")).toBe(
      "mask.webp",
    );
    expect(pokemonFaceFileFromTex("bw10_fr_001", "bw10_wp_ph_fr_001")).toBe(
      "mask-ph.webp",
    );
    expect(pokemonCardTextureUrl("me5_fr_045", "me5_fr_045")).toBe(
      "/assets/pokemon/cards/me5/fr/045/art.webp",
    );
  });

  it("splits nested franchise/line pack paths", async () => {
    const { splitAssetsPackPath } = await import("./packPaths");
    expect(splitAssetsPackPath(["lorcana", "cards", "s1", "en", "1"])).toEqual({
      pack: "lorcana",
      rest: ["cards", "s1", "en", "1"],
    });
    expect(
      splitAssetsPackPath(["naruto", "carddass", "cards", "s1", "fr", "ni001"]),
    ).toEqual({
      pack: "naruto/carddass",
      rest: ["cards", "s1", "fr", "ni001"],
    });
    expect(
      splitAssetsPackPath(["naruto", "ccg", "cards", "s1", "fr", "ni001"]),
    ).toEqual({
      pack: "naruto/ccg",
      rest: ["cards", "s1", "fr", "ni001"],
    });
    expect(splitAssetsPackPath(["naruto", "carddass"])).toBeNull();
  });

  it("serves the render kit, which clients address without a foil segment", async () => {
    const { splitAssetsPackPath, resolveAssetsDiskRoot } =
      await import("./packPaths");
    // `/assets/lorcana/web/calc.jpg` and `/assets/pokemon/shaders/x.frag` are
    // what holoShaders / cssRecipes build. Accepting only `cards` and `foil`
    // here 404'd every shader and web texture of every pack.
    for (const root of ["web", "shaders", "textures", "products"]) {
      expect(splitAssetsPackPath(["lorcana", root, "x.jpg"])).toEqual({
        pack: "lorcana",
        rest: [root, "x.jpg"],
      });
      expect(
        splitAssetsPackPath(["naruto", "carddass", root, "x.jpg"]),
      ).toEqual({
        pack: "naruto/carddass",
        rest: [root, "x.jpg"],
      });
    }
    const split = splitAssetsPackPath(["lorcana", "web", "calc.jpg"])!;
    const mapped = resolveAssetsDiskRoot(split.pack, split.rest)!;
    // Kit paths land under `data/<pack>/foil/`, catalogue paths under `cards/`.
    expect(mapped.root.endsWith("/lorcana/foil")).toBe(true);
    expect(mapped.relative).toEqual(["web", "calc.jpg"]);
    const products = resolveAssetsDiskRoot("naruto/carddass", [
      "products",
      "booster-s1.gif",
    ])!;
    expect(products.root.endsWith("/naruto/carddass/products")).toBe(true);
    expect(products.relative).toEqual(["booster-s1.gif"]);
  });

  it("still refuses a segment that names neither a pack root nor a nest", async () => {
    const { splitAssetsPackPath } = await import("./packPaths");
    expect(splitAssetsPackPath(["lorcana", "etc", "passwd"])).toBeNull();
  });

  it("resolves pack back.webp or back.png", async () => {
    const { assetsPackBackUrl, resolvePackBackPath } =
      await import("./packPaths");
    // Naruto ships back.{lang}.webp under data/naruto/carddass/cards/.
    const naruto = resolvePackBackPath("naruto/carddass", "fr");
    if (naruto) {
      expect(naruto.endsWith("back.fr.webp")).toBe(true);
      expect(assetsPackBackUrl("naruto/carddass", "fr")).toBe(
        "/assets/naruto/carddass/cards/back.fr.webp",
      );
    }
  });

  it("resolves optional set-level back under cards/{set}/", async () => {
    const { resolveSetBackPath, assetsSetBackUrl } =
      await import("./packPaths");
    // No set verso is required; helpers must reject path traversal and stay null.
    expect(resolveSetBackPath("naruto/carddass", "../etc")).toBeNull();
    expect(resolveSetBackPath("naruto/carddass", "s1/../s2")).toBeNull();
    expect(assetsSetBackUrl("naruto/carddass", "s1/../s2")).toBeNull();
  });
});

/**
 * `fallbackFoilMaskUrl` on every pack points at a file sitting directly in
 * `data/<pack>/foil/`. Requiring a directory root made those URLs unresolvable,
 * so no pack fallback mask was ever served.
 */
describe("loose file at the pack foil root", () => {
  it("serves a pack-root file, flat pack and nested alike", async () => {
    const { splitAssetsPackPath, resolveAssetsDiskRoot } =
      await import("./packPaths");
    expect(splitAssetsPackPath(["pokemon", "full_foil_mask.webp"])).toEqual({
      pack: "pokemon",
      rest: ["full_foil_mask.webp"],
    });
    const nested = splitAssetsPackPath([
      "naruto",
      "carddass",
      "full_foil_mask.webp",
    ]);
    expect(nested).toEqual({
      pack: "naruto/carddass",
      rest: ["full_foil_mask.webp"],
    });
    const legacy = splitAssetsPackPath([
      "naruto",
      "ccg",
      "full_foil_mask.webp",
    ]);
    expect(legacy).toEqual({
      pack: "naruto/ccg",
      rest: ["full_foil_mask.webp"],
    });
    expect(
      resolveAssetsDiskRoot(legacy!.pack, legacy!.rest)!.root.endsWith(
        "naruto/carddass/foil",
      ),
    ).toBe(true);
    const enCcg = splitAssetsPackPath([
      "naruto",
      "en-ccg",
      "full_foil_mask.webp",
    ]);
    expect(enCcg).toEqual({
      pack: "naruto/en-ccg",
      rest: ["full_foil_mask.webp"],
    });
    expect(
      resolveAssetsDiskRoot(enCcg!.pack, enCcg!.rest)!.root.endsWith(
        "naruto/carddass/foil",
      ),
    ).toBe(true);
    // The `foil` segment is implicit in the disk root — it must not be doubled.
    const mapped = resolveAssetsDiskRoot(nested!.pack, nested!.rest)!;
    expect(mapped.root.endsWith("naruto/carddass/foil")).toBe(true);
    expect(mapped.relative).toEqual(["full_foil_mask.webp"]);
  });

  it("still refuses a bare segment, which is a pack name or a traversal", async () => {
    const { splitAssetsPackPath } = await import("./packPaths");
    // No extension: `carddass` is the product line, not a file.
    expect(splitAssetsPackPath(["naruto", "carddass"])).toBeNull();
    expect(splitAssetsPackPath(["lorcana", "passwd"])).toBeNull();
    expect(splitAssetsPackPath(["lorcana", "..", "secret.env"])).toBeNull();
  });
});
