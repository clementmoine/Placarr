import { describe, expect, it } from "vitest";

import { foilFaceReady, foilSurfacesReady } from "./foilFaceReady";

describe("foilFaceReady", () => {
  it("stays hidden until art is ready", () => {
    expect(
      foilFaceReady({
        artReady: false,
        wantsFoil: false,
        foilMask: null,
        varnishMask: null,
        secondVarnishMask: null,
      }),
    ).toBe(false);
  });

  it("shows a plain face once art is ready", () => {
    expect(
      foilFaceReady({
        artReady: true,
        wantsFoil: false,
        foilMask: null,
        varnishMask: null,
        secondVarnishMask: null,
      }),
    ).toBe(true);
  });

  it("waits for foil + varnish blobs when foil is wanted", () => {
    expect(
      foilFaceReady({
        artReady: true,
        wantsFoil: true,
        maskUrl: "/foil.png",
        foilMask: null,
        varnishMaskUrl: "/varnish.png",
        varnishMask: null,
        secondVarnishMask: null,
      }),
    ).toBe(false);

    expect(
      foilFaceReady({
        artReady: true,
        wantsFoil: true,
        maskUrl: "/foil.png",
        foilMask: "blob:foil",
        varnishMaskUrl: "/varnish.png",
        varnishMask: null,
        secondVarnishMask: null,
      }),
    ).toBe(false);

    expect(
      foilFaceReady({
        artReady: true,
        wantsFoil: true,
        maskUrl: "/foil.png",
        foilMask: "blob:foil",
        varnishMaskUrl: "/varnish.png",
        varnishMask: "blob:varnish",
        secondVarnishMaskUrl: "/second.png",
        secondVarnishMask: null,
      }),
    ).toBe(false);

    expect(
      foilFaceReady({
        artReady: true,
        wantsFoil: true,
        maskUrl: "/foil.png",
        foilMask: "blob:foil",
        varnishMaskUrl: "/varnish.png",
        varnishMask: "blob:varnish",
        secondVarnishMaskUrl: "/second.png",
        secondVarnishMask: "blob:second",
      }),
    ).toBe(true);
  });
});

describe("foilSurfacesReady", () => {
  it("refuse sans matériau", () => {
    expect(
      foilSurfacesReady({
        hasMaterial: false,
        needsFoilMask: true,
        foilMaskUrl: "/mask.webp",
      }),
    ).toBe(false);
  });

  it("exige le foil mask quand le material le sample", () => {
    expect(
      foilSurfacesReady({
        hasMaterial: true,
        needsFoilMask: true,
        foilMaskUrl: null,
      }),
    ).toBe(false);
    expect(
      foilSurfacesReady({
        hasMaterial: true,
        needsFoilMask: true,
        foilMaskUrl: "/mask.webp",
      }),
    ).toBe(true);
  });

  it("n'attend pas d'etch / cold-foil (fallback noir du renderer)", () => {
    // Pokémon declare `_CardEtch` on every leaf; SvHolo dumps have no etch —
    // blocking on varnishMaskUrl kept the playroom on CSS forever.
    expect(
      foilSurfacesReady({
        hasMaterial: true,
        needsFoilMask: true,
        foilMaskUrl: "/mask.webp",
      }),
    ).toBe(true);
  });
});
