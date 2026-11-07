import { describe, expect, it } from "vitest";

import {
  malieCardLayerUrls,
  parsePokemonBundleStem,
} from "./malieCardLayers";

describe("malieCardLayerUrls", () => {
  it("parses Live bundle stems", () => {
    expect(parsePokemonBundleStem("me1_fr_073")).toEqual({
      set: "me1",
      lang: "fr",
      num: "073",
    });
    expect(parsePokemonBundleStem("sv3-5_en_193")).toEqual({
      set: "sv3-5",
      lang: "en",
      num: "193",
    });
  });

  it("builds Malie front / foil / etch for the same print", () => {
    const urls = malieCardLayerUrls("sv3-5_en_193", "std");
    expect(urls?.front).toBe(
      "https://cdn.malie.io/file/malie-io/tcgl/cards/png/en/sv3-5/sv3-5_en_193_std.png",
    );
    expect(urls?.foil).toBe(
      "https://cdn.malie.io/file/malie-io/tcgl/cards/png/en/sv3-5/sv3-5_en_193_std.foil.png",
    );
    expect(urls?.etch).toBe(
      "https://cdn.malie.io/file/malie-io/tcgl/cards/png/en/sv3-5/sv3-5_en_193_std.etch.png",
    );
  });

  it("uses ph variant when asked", () => {
    expect(malieCardLayerUrls("me1_fr_073", "ph")?.foil).toContain(
      "me1_fr_073_ph.foil.png",
    );
  });
});
