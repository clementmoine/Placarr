import { describe, expect, it } from "vitest";

import { selectDbsFwSteps } from "./cli";

describe("selectDbsFwSteps", () => {
  it("includes the product graph on a manual Sync", () => {
    expect(selectDbsFwSteps([])).toEqual([
      "scrape",
      "dbscards",
      "products",
      "faces",
      "details",
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
    ]);
  });

  it("reparses local product HTML when --offline", () => {
    expect(selectDbsFwSteps(["--offline"])).toEqual(["products"]);
    expect(selectDbsFwSteps(["--only", "products", "--offline"])).toEqual([
      "products",
    ]);
  });
});
