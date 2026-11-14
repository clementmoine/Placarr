import { describe, expect, it } from "vitest";

import { canScrollOverflowX } from "./itemSiblingNavigation";

describe("canScrollOverflowX", () => {
  it("requires overflow-x auto/scroll and content wider than the box", () => {
    expect(
      canScrollOverflowX({
        overflowX: "auto",
        scrollWidth: 800,
        clientWidth: 320,
      }),
    ).toBe(true);
    expect(
      canScrollOverflowX({
        overflowX: "scroll",
        scrollWidth: 800,
        clientWidth: 320,
      }),
    ).toBe(true);
  });

  it("ignores visible overflow and fitting content", () => {
    expect(
      canScrollOverflowX({
        overflowX: "visible",
        scrollWidth: 800,
        clientWidth: 320,
      }),
    ).toBe(false);
    expect(
      canScrollOverflowX({
        overflowX: "auto",
        scrollWidth: 320,
        clientWidth: 320,
      }),
    ).toBe(false);
  });
});
