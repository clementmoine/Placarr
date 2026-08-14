import { describe, expect, it } from "vitest";

import { dbsCgFaceDownloadLimit, selectDbsCgSteps } from "./cli";

describe("selectDbsCgSteps", () => {
  it("runs scrape then faces by default", () => {
    expect(selectDbsCgSteps([])).toEqual(["scrape", "faces"]);
  });

  it("skips network steps when --offline", () => {
    expect(selectDbsCgSteps(["--offline"])).toEqual([]);
  });

  it("honours --only and --skip", () => {
    expect(selectDbsCgSteps(["--only", "faces"])).toEqual(["faces"]);
    expect(selectDbsCgSteps(["--skip", "faces"])).toEqual(["scrape"]);
    expect(selectDbsCgSteps(["--only", "faces", "--offline"])).toEqual([]);
  });
});

describe("dbsCgFaceDownloadLimit", () => {
  it("does not cap faces when scrape also runs", () => {
    expect(
      dbsCgFaceDownloadLimit(["--limit", "2"], ["scrape", "faces"]),
    ).toBeUndefined();
  });

  it("caps prints on --only faces", () => {
    expect(dbsCgFaceDownloadLimit(["--limit", "2"], ["faces"])).toBe(2);
  });
});
