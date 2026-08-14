import { describe, expect, it } from "vitest";

import {
  dbsCgArenaLimit,
  dbsCgFaceDownloadLimit,
  dbsCgScrapeLangs,
  selectDbsCgSteps,
} from "./cli";

describe("selectDbsCgSteps", () => {
  it("runs scrape, then the Arena dump, then HTTP faces", () => {
    expect(selectDbsCgSteps([])).toEqual(["scrape", "arena", "faces"]);
  });

  it("still ranges a local clone when --offline", () => {
    expect(selectDbsCgSteps(["--offline"])).toEqual(["arena"]);
  });

  it("honours --only and --skip", () => {
    expect(selectDbsCgSteps(["--only", "arena"])).toEqual(["arena"]);
    expect(selectDbsCgSteps(["--only", "faces"])).toEqual(["faces"]);
    expect(selectDbsCgSteps(["--skip", "faces"])).toEqual(["scrape", "arena"]);
    expect(selectDbsCgSteps(["--only", "faces", "--offline"])).toEqual([]);
  });
});

describe("dbsCgFaceDownloadLimit", () => {
  it("does not cap faces when scrape also runs", () => {
    expect(
      dbsCgFaceDownloadLimit(["--limit", "2"], ["scrape", "arena", "faces"]),
    ).toBeUndefined();
  });

  it("caps prints on --only faces", () => {
    expect(dbsCgFaceDownloadLimit(["--limit", "2"], ["faces"])).toBe(2);
  });
});

describe("dbsCgArenaLimit", () => {
  it("does not cap the dump on a full run", () => {
    expect(
      dbsCgArenaLimit(["--limit", "2"], ["scrape", "arena", "faces"]),
    ).toBeUndefined();
  });

  it("caps art files on --only arena", () => {
    expect(dbsCgArenaLimit(["--limit", "2"], ["arena"])).toBe(2);
  });
});

describe("dbsCgScrapeLangs", () => {
  it("defaults to both catalogues", () => {
    expect(dbsCgScrapeLangs([])).toEqual(["fr", "en"]);
  });

  it("honours --langs", () => {
    expect(dbsCgScrapeLangs(["--langs", "en"])).toEqual(["en"]);
    expect(dbsCgScrapeLangs(["--langs", "fr,en"])).toEqual(["fr", "en"]);
  });
});
