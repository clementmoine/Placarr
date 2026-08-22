import { describe, expect, it } from "vitest";

import {
  foilFaceReady,
  foilLookSuppressed,
  foilSurfacesReady,
  holoCssIdleEnabled,
} from "./foilFaceReady";

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

describe("holoCssIdleEnabled", () => {
  it("arms idle for Live gold full-card finishes without a shine mask", () => {
    // SvUltraGoldRainbow / Scodix / SwSecret drop the WP mask; the old
    // `&& shineMask` gate left them frozen after pointer leave.
    expect(
      holoCssIdleEnabled({
        hasFinish: true,
        isDriven: false,
        fullCardFinish: true,
        shineMask: null,
      }),
    ).toBe(true);
  });

  it("still requires a shine mask for masked finishes", () => {
    expect(
      holoCssIdleEnabled({
        hasFinish: true,
        isDriven: false,
        fullCardFinish: false,
        shineMask: null,
      }),
    ).toBe(false);
    expect(
      holoCssIdleEnabled({
        hasFinish: true,
        isDriven: false,
        fullCardFinish: false,
        shineMask: "blob:foil",
      }),
    ).toBe(true);
  });

  it("disables idle while pointer / device drives", () => {
    expect(
      holoCssIdleEnabled({
        hasFinish: true,
        isDriven: true,
        fullCardFinish: true,
        shineMask: null,
      }),
    ).toBe(false);
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

describe("foilLookSuppressed", () => {
  it("supprime la finition quand le matériau réclame un masque absent", () => {
    // Le cas de `36/P2` : une finition attestée, mais aucun masque publié.
    expect(
      foilLookSuppressed({
        hasMaterial: true,
        needsFoilMask: true,
        foilMaskUrl: null,
      }),
    ).toBe(true);
  });

  it("laisse passer dès qu'un masque existe, fût-il de repli", () => {
    expect(
      foilLookSuppressed({
        hasMaterial: true,
        needsFoilMask: true,
        foilMaskUrl: "/assets/lorcana/cards/6/en/25-p2/mask.jpg",
      }),
    ).toBe(false);
  });

  it("laisse passer un matériau qui n'échantillonne aucun masque", () => {
    expect(
      foilLookSuppressed({
        hasMaterial: true,
        needsFoilMask: false,
        foilMaskUrl: null,
      }),
    ).toBe(false);
  });

  it("ne se prononce pas sans matériau", () => {
    // Sans matériau il n'y a pas de look à supprimer, et le composant garde sa
    // retombée sur les identifiants pré-résolus d'un cache périmé.
    expect(
      foilLookSuppressed({
        hasMaterial: false,
        needsFoilMask: true,
        foilMaskUrl: null,
      }),
    ).toBe(false);
  });

  it("est l'exact complément de foilSurfacesReady quand un matériau existe", () => {
    for (const needsFoilMask of [true, false]) {
      for (const foilMaskUrl of [null, "/mask.jpg"]) {
        const input = { hasMaterial: true, needsFoilMask, foilMaskUrl };
        expect(foilLookSuppressed(input)).toBe(!foilSurfacesReady(input));
      }
    }
  });
});
