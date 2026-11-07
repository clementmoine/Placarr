import { describe, expect, it } from "vitest";

import {
  catalogueArgList,
  selectCatalogueSteps,
} from "./catalogueSteps";

const STEPS = ["scrape", "faces", "products", "index"] as const;
const ONLINE = new Set<(typeof STEPS)[number]>(["scrape", "faces"]);
const OFF_BY_DEFAULT = new Set<(typeof STEPS)[number]>(["products"]);

describe("selectCatalogueSteps", () => {
  it("runs defaults minus off-by-default", () => {
    expect(selectCatalogueSteps([], STEPS, { offByDefault: OFF_BY_DEFAULT })).toEqual([
      "scrape",
      "faces",
      "index",
    ]);
  });

  it("honours --only and --skip", () => {
    expect(selectCatalogueSteps(["--only", "faces,index"], STEPS)).toEqual([
      "faces",
      "index",
    ]);
    expect(
      selectCatalogueSteps(["--skip", "faces"], STEPS, {
        offByDefault: OFF_BY_DEFAULT,
      }),
    ).toEqual(["scrape", "index"]);
  });

  it("drops online steps when --offline", () => {
    expect(
      selectCatalogueSteps(["--offline"], STEPS, {
        online: ONLINE,
        offByDefault: OFF_BY_DEFAULT,
      }),
    ).toEqual(["index"]);
  });

  it("parses csv argv lists", () => {
    expect(catalogueArgList(["--langs", "fr, EN ,ja"], "--langs")).toEqual([
      "fr",
      "en",
      "ja",
    ]);
  });
});
