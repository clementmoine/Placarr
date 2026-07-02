import { describe, expect, it } from "vitest";

import {
  isDegenerateFlatImage,
  isMissingArtImageUrl,
  isPlaceholderCoverFromPersistedMetrics,
  isPlaceholderCoverImage,
} from "./coverPlaceholder";

describe("isMissingArtImageUrl", () => {
  it("rejette le placeholder PriceCharting relatif", () => {
    expect(isMissingArtImageUrl("/images/no-image-available.png")).toBe(true);
  });

  it("rejette le placeholder absolu et les chemins hors /uploads/", () => {
    expect(
      isMissingArtImageUrl(
        "https://www.pricecharting.com/images/no-image-available.png",
      ),
    ).toBe(true);
    expect(isMissingArtImageUrl("/static/placeholder.jpg")).toBe(true);
  });

  it("conserve une jaquette localisée", () => {
    expect(isMissingArtImageUrl("/uploads/abc123.jpg")).toBe(false);
    expect(
      isMissingArtImageUrl(
        "https://storage.googleapis.com/images.pricecharting.com/abc/1600.jpg",
      ),
    ).toBe(false);
  });
});

describe("isPlaceholderCoverImage", () => {
  it("rejette une image unicolore (entropie et écart-type nuls)", () => {
    expect(
      isPlaceholderCoverImage({ entropy: 0, maxColorStdev: 0 }),
    ).toBe(true);
    expect(isDegenerateFlatImage({ entropy: 0, maxColorStdev: 0 })).toBe(true);
  });

  it("rejette un placeholder quasi uniforme", () => {
    expect(
      isPlaceholderCoverImage({ entropy: 0.4, maxColorStdev: 3 }),
    ).toBe(true);
  });

  it("rejette l'icône Geedie sans jaquette (stats mesurées)", () => {
    expect(
      isPlaceholderCoverImage({
        entropy: 0.66,
        maxColorStdev: 6.49,
        width: 500,
        height: 500,
        meanLuminance: 241.9,
        darkPixelRatio: 0,
      }),
    ).toBe(true);
  });

  it("conserve une vraie jaquette (entropie et contraste élevés)", () => {
    expect(
      isPlaceholderCoverImage({ entropy: 7.47, maxColorStdev: 68.08 }),
    ).toBe(false);
  });

  it("conserve une image à faible entropie mais avec du contraste (logo)", () => {
    expect(
      isPlaceholderCoverImage({ entropy: 0.5, maxColorStdev: 40 }),
    ).toBe(false);
  });
});

describe("isPlaceholderCoverFromPersistedMetrics", () => {
  it("filtre un carré lumineux sans ombre (métriques persistées Geedie)", () => {
    expect(
      isPlaceholderCoverFromPersistedMetrics({
        width: 500,
        height: 500,
        meanLuminance: 241.9,
        darkPixelRatio: 0,
      }),
    ).toBe(true);
  });

  it("conserve une jaquette portrait avec de la profondeur", () => {
    expect(
      isPlaceholderCoverFromPersistedMetrics({
        width: 1025,
        height: 1302,
        meanLuminance: 93.6,
        darkPixelRatio: 0.47,
      }),
    ).toBe(false);
  });
});
