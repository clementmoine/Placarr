import { describe, expect, it } from "vitest";
import { preferShippudenArt, shippudenArtHostOf } from "./faceHost";

describe("shippudenArtHostOf", () => {
  it("parses art.<host>.<ext>", () => {
    expect(shippudenArtHostOf("art.suruga.jpg")).toBe("suruga");
    expect(shippudenArtHostOf("art.mercari.webp")).toBe("mercari");
    expect(shippudenArtHostOf("art.fril.jpg")).toBe("fril");
    expect(shippudenArtHostOf("thumb.jpg")).toBeNull();
  });
});

describe("preferShippudenArt", () => {
  it("prefers Suruga shop scans over Mercari listing photos", () => {
    expect(preferShippudenArt("art.mercari.jpg", "art.suruga.jpg")).toBe(
      "art.suruga.jpg",
    );
    expect(preferShippudenArt("art.suruga.jpg", "art.mercari.jpg")).toBe(
      "art.suruga.jpg",
    );
  });

  it("prefers Suruga over Fril and eBay listing photos", () => {
    expect(preferShippudenArt("art.fril.jpg", "art.suruga.jpg")).toBe(
      "art.suruga.jpg",
    );
    expect(preferShippudenArt("art.ebay.webp", "art.suruga.jpg")).toBe(
      "art.suruga.jpg",
    );
    expect(preferShippudenArt("art.suruga.jpg", "art.ebay.webp")).toBe(
      "art.suruga.jpg",
    );
  });

  it("fills empty current from incoming", () => {
    expect(preferShippudenArt(null, "art.mercari.jpg")).toBe("art.mercari.jpg");
    expect(preferShippudenArt("", "art.suruga.jpg")).toBe("art.suruga.jpg");
  });
});
