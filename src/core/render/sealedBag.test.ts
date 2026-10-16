import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SealedBagOverlay } from "@/components/SealedBagOverlay";
import {
  SEALED_BAG_PEEL_STRIP_URL,
  SEALED_BAG_URL,
  SEALED_BAG_ASPECT_RATIO,
  SEALED_BAG_PIXEL_SIZE,
  SEALED_BAG_CHROME_INSET,
  SEALED_BAG_SLICES,
  SEALED_CARD_INSET,
  SEALED_CARD_INSET_ADAPTIVE,
  SEALED_FINISH,
  isSealedFinish,
  materialWantsSealedBag,
  sealedAdaptiveFramePadding,
  sealedAdaptiveOuterAspectRatio,
  sealedBagBagUrl,
  sealedBagOuterAspect,
  sealedBagVariantFromMaterial,
  sealedCardInsetStyle,
  sealedCardWindowAspect,
} from "./sealedBag";

describe("sealedBag", () => {
  it("recognises the sealed finish id", () => {
    expect(isSealedFinish(SEALED_FINISH)).toBe(true);
    expect(isSealedFinish("Sealed")).toBe(true);
    expect(isSealedFinish("sealed-top")).toBe(true);
    expect(isSealedFinish("sealed-both")).toBe(true);
    expect(isSealedFinish("sealed-adaptive")).toBe(true);
    expect(isSealedFinish("normal")).toBe(false);
    expect(isSealedFinish(null)).toBe(false);
  });

  it("maps playroom material names to bag chrome", () => {
    expect(materialWantsSealedBag("sealed")).toBe(true);
    expect(materialWantsSealedBag("foil-sealed")).toBe(true);
    expect(materialWantsSealedBag("holo-sealed")).toBe(true);
    expect(materialWantsSealedBag("sealed-both")).toBe(true);
    expect(materialWantsSealedBag("sealed-adaptive")).toBe(true);
    expect(materialWantsSealedBag("foil-sealed-adaptive")).toBe(true);
    expect(materialWantsSealedBag("holo")).toBe(false);
  });

  it("defaults to adaptive; explicit *-full keeps the legacy PNG", () => {
    expect(sealedBagVariantFromMaterial(null)).toBe("adaptive");
    expect(sealedBagVariantFromMaterial("sealed")).toBe("adaptive");
    expect(sealedBagVariantFromMaterial("foil-sealed")).toBe("adaptive");
    expect(sealedBagVariantFromMaterial("sealed-adaptive")).toBe("adaptive");
    expect(sealedBagVariantFromMaterial("sealed-full")).toBe("full");
    expect(sealedBagVariantFromMaterial("foil-sealed-full")).toBe("full");
  });

  it("uses the double-pinch packaging asset", () => {
    expect(sealedBagBagUrl()).toBe(SEALED_BAG_URL);
    expect(SEALED_BAG_URL).toContain("card-bag-seal-both");
    expect(SEALED_BAG_PEEL_STRIP_URL).toContain("card-bag-peel-strip");
  });

  it("exposes 9-slice crops matching the master guides", () => {
    expect(SEALED_BAG_SLICES.rimW).toBe(202);
    expect(SEALED_BAG_SLICES.sealH).toBe(236);
    expect(SEALED_BAG_SLICES.windowW).toBe(1278);
    expect(SEALED_BAG_SLICES.windowH).toBe(2196);
    expect(SEALED_BAG_SLICES.urls.cornerTl).toContain("/slices/corner-tl.png");
    expect(SEALED_BAG_SLICES.urls.edgeTop).toContain("/slices/edge-top.png");
    expect(SEALED_BAG_SLICES.urls.windowFilm).toContain("/slices/window-film.png");
    const pad = sealedAdaptiveFramePadding(0.5);
    expect(pad.right).toBe(101);
    expect(pad.top).toBeGreaterThan(118); // seal + pinch clearance
    expect(pad.top).toBe(pad.bottom);
  });

  it("keeps the card clear of the pinch chrome (with a slight upward bias)", () => {
    const chromeTop = Number.parseFloat(SEALED_BAG_CHROME_INSET.top);
    const chromeBottom = Number.parseFloat(SEALED_BAG_CHROME_INSET.bottom);
    const cardTop = Number.parseFloat(SEALED_CARD_INSET_ADAPTIVE.top);
    const cardBottom = Number.parseFloat(SEALED_CARD_INSET_ADAPTIVE.bottom);
    expect(cardTop).toBeGreaterThanOrEqual(chromeTop);
    expect(cardBottom).toBeGreaterThan(chromeBottom);
    expect(cardTop).toBeLessThan(cardBottom);
  });

  it("sizes the adaptive outer so the inner window matches the card face", () => {
    const tcg = 5 / 7;
    expect(sealedCardWindowAspect("adaptive", tcg)).toBeCloseTo(tcg, 3);
    expect(sealedAdaptiveOuterAspectRatio(tcg)).toBeGreaterThan(tcg);
    expect(sealedAdaptiveOuterAspectRatio(tcg)).toBeLessThan(
      SEALED_BAG_PIXEL_SIZE.width / SEALED_BAG_PIXEL_SIZE.height + 0.2,
    );
    // Closer to the card than the old full-bleed bag frame.
    expect(sealedAdaptiveOuterAspectRatio(tcg)).toBeGreaterThan(
      SEALED_BAG_PIXEL_SIZE.width / SEALED_BAG_PIXEL_SIZE.height,
    );
    expect(sealedBagOuterAspect({ sealedBag: true })).toMatch(/^\d+ \/ \d+$/);
    expect(sealedBagOuterAspect({ sealedBag: true })).not.toBe(
      SEALED_BAG_ASPECT_RATIO,
    );
    expect(
      sealedBagOuterAspect({ sealedBag: true, variant: "full" }),
    ).toBe(SEALED_BAG_ASPECT_RATIO);
    expect(sealedBagOuterAspect({ finish: "holo" })).toBeNull();
    expect(
      sealedBagOuterAspect({
        sealedBag: true,
        variant: "adaptive",
        cardFrame: true,
      }),
    ).toBeNull();
  });

  it("keeps the full-bleed window at TCG 5/7 inside the native bag frame", () => {
    expect(sealedCardWindowAspect("full")).toBeCloseTo(5 / 7, 3);
    expect(Number.parseFloat(SEALED_CARD_INSET.top)).toBeGreaterThan(10);
  });

  it("renders front 9-slice bag with PE film over the card window", () => {
    const html = renderToStaticMarkup(
      createElement(SealedBagOverlay, { side: "front" }),
    );
    expect(html).toContain(SEALED_BAG_SLICES.urls.cornerTl);
    expect(html).toContain(SEALED_BAG_SLICES.urls.windowFilm);
    expect(html).not.toContain(SEALED_BAG_URL);
    expect(html).not.toContain(SEALED_BAG_PEEL_STRIP_URL);
    expect(html).not.toContain("scale-x-[-1]");
  });

  it("mirrors the bag and stacks the peel strip on the back", () => {
    const html = renderToStaticMarkup(
      createElement(SealedBagOverlay, { side: "back" }),
    );
    expect(html).toContain(SEALED_BAG_SLICES.urls.cornerTl);
    expect(html).toContain(SEALED_BAG_PEEL_STRIP_URL);
    expect(html).toContain("scale-x-[-1]");
  });

  it("keeps a full-bleed path for playroom A/B", () => {
    const html = renderToStaticMarkup(
      createElement(SealedBagOverlay, { side: "front", variant: "full" }),
    );
    expect(html).toContain(SEALED_BAG_URL);
    expect(html).not.toContain(SEALED_BAG_SLICES.urls.cornerTl);
  });

  it("tucks children inside the adaptive card window", () => {
    expect(SEALED_CARD_INSET_ADAPTIVE.top).toMatch(/%$/);
    expect(sealedCardInsetStyle("adaptive")).toEqual({
      ...SEALED_CARD_INSET_ADAPTIVE,
    });
    const html = renderToStaticMarkup(
      createElement(
        SealedBagOverlay,
        { side: "front" },
        createElement("img", { src: "/card.jpg", alt: "face" }),
      ),
    );
    expect(html).toContain("/card.jpg");
    expect(html).toContain(SEALED_BAG_SLICES.urls.edgeTop);
    expect(html).toContain(SEALED_CARD_INSET_ADAPTIVE.top);
    expect(html).toContain(SEALED_CARD_INSET_ADAPTIVE.bottom);
  });
});
