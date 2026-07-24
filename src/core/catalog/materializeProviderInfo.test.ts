import { describe, expect, it } from "vitest";

import { materializeProviderInfo } from "./catalog";

describe("materializeProviderInfo", () => {
  it("applies boolean defaults without overriding declared traits", () => {
    expect(
      materializeProviderInfo({
        id: "demo",
        label: "Demo",
        types: ["games"],
        capabilities: ["cover"],
        auth: { kind: "none" },
        canonical: false,
        isRealBoxCover: true,
        isSecondary: true,
      }),
    ).toMatchObject({
      defaultLanguage: "unknown",
      isRealBoxCover: true,
      isSecondary: true,
      retailCatalogImageTitles: false,
    });
  });
});
