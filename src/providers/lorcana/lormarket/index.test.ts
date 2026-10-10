import { describe, expect, it } from "vitest";

import { lorcardsTileToPrintKey } from "./index";

describe("lorcardsTileToPrintKey", () => {
  it("maps a Set 12 Jessie tile onto lorcana:12-223", () => {
    expect(
      lorcardsTileToPrintKey({
        slug: "223-204-fr-12-jessie-cowgirl-energique",
      }),
    ).toBe("lorcana:12-223");
  });

  it("returns null for junk", () => {
    expect(lorcardsTileToPrintKey({ slug: "" })).toBeNull();
    expect(lorcardsTileToPrintKey({ slug: "not-a-card" })).toBeNull();
  });
});
