import { describe, expect, it } from "vitest";

import {
  YGOCARDS_DETAIL_CATEGORIES,
  YGOCARDS_LISTING_CATEGORIES,
  YGOCARDS_SITE,
  YGOCARDS_STAGING_FOLDER,
} from "./ygocards";

describe("ygocards site", () => {
  it("points at ygocards.fr sealed categories", () => {
    expect(YGOCARDS_SITE.origin).toBe("https://www.ygocards.fr");
    expect(YGOCARDS_STAGING_FOLDER).toBe("ygocards-products");
    expect(YGOCARDS_LISTING_CATEGORIES).toEqual(["boosters", "displays"]);
    expect(YGOCARDS_DETAIL_CATEGORIES).toEqual(["boosters", "displays"]);
  });
});
