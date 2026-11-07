import { describe, expect, it } from "vitest";

import {
  isOpenablePublicCitationUrl,
  isSiteRootOrShallowCitationUrl,
  sanitizePublicCitationUrl,
  unwrapWaybackUrl,
  waybackPublicCitationUrl,
} from "./publicCitationUrl";

describe("publicCitationUrl", () => {
  it("rejects site roots and shallow locale hubs", () => {
    expect(isSiteRootOrShallowCitationUrl("https://cardnexus.com/")).toBe(true);
    expect(isSiteRootOrShallowCitationUrl("https://tcgdex.dev/")).toBe(true);
    expect(isSiteRootOrShallowCitationUrl("https://example.com/en")).toBe(true);
    expect(isSiteRootOrShallowCitationUrl("https://example.com/welcome/")).toBe(
      true,
    );
    expect(
      isOpenablePublicCitationUrl("https://cardnexus.com/product/212092"),
    ).toBe(true);
  });

  it("accepts Wayback only when the archived target is a deep link", () => {
    const deep =
      "https://web.archive.org/web/20071224051112/http://www.carddass.fr/naruto/promo.html";
    const shallow =
      "https://web.archive.org/web/20071224051112/http://www.carddass.fr/";
    expect(isOpenablePublicCitationUrl(deep)).toBe(true);
    expect(isOpenablePublicCitationUrl(shallow)).toBe(false);
    expect(unwrapWaybackUrl(deep)?.originalUrl).toBe(
      "http://www.carddass.fr/naruto/promo.html",
    );
    expect(
      waybackPublicCitationUrl(
        "20071224051112",
        "http://www.carddass.fr/naruto/promo.html",
      ),
    ).toBe(deep);
  });

  it("sanitizes homepages to null", () => {
    expect(sanitizePublicCitationUrl("https://lorcanajson.org/")).toBeNull();
    expect(
      sanitizePublicCitationUrl("https://www.okkazeo.com/jeu/black-stories/1"),
    ).toBe("https://www.okkazeo.com/jeu/black-stories/1");
  });
});
