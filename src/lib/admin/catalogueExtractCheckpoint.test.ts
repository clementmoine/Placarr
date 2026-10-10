import { describe, expect, it } from "vitest";

import {
  catalogueExtractSkipArgs,
  mergeCompletedSteps,
  parseCatalogueCheckpointStep,
} from "./catalogueExtractCheckpoint";

describe("catalogueExtractCheckpoint", () => {
  it("parses checkpoint log lines", () => {
    expect(parseCatalogueCheckpointStep("── checkpoint scrape")).toBe("scrape");
    expect(parseCatalogueCheckpointStep("── checkpoint dbscards")).toBe(
      "dbscards",
    );
    expect(parseCatalogueCheckpointStep("── products : 12 SKU")).toBeNull();
    expect(parseCatalogueCheckpointStep("checkpoint scrape")).toBeNull();
  });

  it("merges completed steps without duplicates", () => {
    expect(mergeCompletedSteps(["scrape"], "dbscards")).toEqual([
      "scrape",
      "dbscards",
    ]);
    expect(mergeCompletedSteps(["scrape", "dbscards"], "scrape")).toEqual([
      "scrape",
      "dbscards",
    ]);
    expect(mergeCompletedSteps(undefined, "faces")).toEqual(["faces"]);
  });

  it("builds --skip argv from completed steps", () => {
    expect(catalogueExtractSkipArgs(null)).toEqual([]);
    expect(catalogueExtractSkipArgs(["scrape", "dbscards"])).toEqual([
      "--skip",
      "scrape,dbscards",
    ]);
    expect(
      catalogueExtractSkipArgs(["scrape", "unknown", "faces"], [
        "scrape",
        "dbscards",
        "faces",
      ]),
    ).toEqual(["--skip", "scrape,faces"]);
  });
});
