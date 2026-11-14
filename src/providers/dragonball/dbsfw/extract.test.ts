import { describe, expect, it } from "vitest";

import { selectDbsFwSteps } from "./extractSteps";

describe("selectDbsFwSteps", () => {
  it("includes the product graph + client foil kit on a manual Sync", () => {
    expect(selectDbsFwSteps([])).toEqual([
      "scrape",
      "dbscards",
      "products",
      "faces",
      "details",
      "foil",
      "documents",
    ]);
  });

  it("keeps products off the hourly tick", () => {
    expect(selectDbsFwSteps(["--skip", "products"])).toEqual([
      "scrape",
      "dbscards",
      "faces",
      // `details` reste du tour horaire : la récolte est incrémentale, elle ne
      // relit que les numéros que `facts.json` n'a pas encore.
      "details",
      "foil",
      "documents",
    ]);
  });

  it("runs foil alone via --only (Mac client dump)", () => {
    expect(selectDbsFwSteps(["--only", "foil"])).toEqual(["foil"]);
  });

  it("drops online steps when --offline (foil needs GUS/CDN)", () => {
    expect(selectDbsFwSteps(["--offline"])).toEqual(["products"]);
    expect(selectDbsFwSteps(["--only", "products", "--offline"])).toEqual([
      "products",
    ]);
    expect(selectDbsFwSteps(["--only", "foil", "--offline"])).toEqual([]);
  });
});
