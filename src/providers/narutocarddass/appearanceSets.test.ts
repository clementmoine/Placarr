import { describe, expect, it } from "vitest";

import {
  appearanceSetsOf,
  appearanceValueForJson,
  mergeAppearanceValues,
  primaryAppearanceSet,
} from "./appearanceSets";

describe("appearanceSetsOf", () => {
  it("normalise scalaire et liste", () => {
    expect(appearanceSetsOf("s5")).toEqual(["s5"]);
    expect(appearanceSetsOf(["s5", "s1", "s5"])).toEqual(["s1", "s5"]);
    expect(appearanceSetsOf("unknown")).toEqual([]);
  });
});

describe("primaryAppearanceSet", () => {
  it("préfère la plus petite série FR", () => {
    expect(primaryAppearanceSet(["s5", "s1"])).toBe("s1");
    expect(primaryAppearanceSet(["promo", "s3"])).toBe("s3");
  });

  it("ignore les 巻ノ face à une série européenne", () => {
    expect(primaryAppearanceSet(["maki3", "s1", "s5"])).toBe("s1");
  });
});

describe("appearanceValueForJson", () => {
  it("reste scalaire pour une seule série", () => {
    expect(appearanceValueForJson(["s1"])).toBe("s1");
    expect(appearanceValueForJson(["s1", "s5"])).toEqual(["s1", "s5"]);
  });
});

describe("mergeAppearanceValues", () => {
  it("union sans doublon", () => {
    expect(mergeAppearanceValues("s5", ["s1", "s5"])).toEqual(["s1", "s5"]);
  });
});
