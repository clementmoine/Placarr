import { describe, expect, it } from "vitest";

import { mapNarutopiaMythosHeading } from "./narutopiaMap";

describe("mapNarutopiaMythosHeading", () => {
  it("maps base / Rare Art / Legendary / missions", () => {
    expect(mapNarutopiaMythosHeading("C-001")).toMatchObject({
      printKey: "mythos:ks1-0001",
      grouping: null,
    });
    expect(mapNarutopiaMythosHeading("R-104 A")).toMatchObject({
      printKey: "mythos:ks1-0104-a",
      grouping: "a",
    });
    expect(mapNarutopiaMythosHeading("Legendray /1000")).toMatchObject({
      printKey: "mythos:ks1-lg01",
    });
    expect(mapNarutopiaMythosHeading("Mission 006")).toMatchObject({
      printKey: "mythos:ks1-mss06",
    });
  });

  it("maps Mythos V to promo and Secret to s/sv", () => {
    expect(mapNarutopiaMythosHeading("Mythos 113 V")).toMatchObject({
      printKey: "mythos:ks1promo-0113-v",
      grouping: "v",
    });
    expect(mapNarutopiaMythosHeading("Secret 131")).toMatchObject({
      printKey: "mythos:ks1-0131-s",
      grouping: "s",
    });
    expect(mapNarutopiaMythosHeading("Secret 131 V")).toMatchObject({
      printKey: "mythos:ks1-0131-sv",
      grouping: "sv",
    });
  });
});
