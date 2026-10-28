import { describe, expect, it } from "vitest";

import {
  packSyncedSourcePath,
  packSyncedSourcesDir,
  resolvePackSyncedSourcePath,
} from "@/lib/packPaths";

describe("packSyncedSourcePath", () => {
  it("puts sync ledgers under data/<pack>/sources/", () => {
    expect(packSyncedSourcesDir("naruto/kayou")).toMatch(
      /data[/\\]naruto[/\\]kayou[/\\]sources$/,
    );
    expect(packSyncedSourcePath("naruto/kayou", "narutodb-kayou-checklist.json")).toMatch(
      /data[/\\]naruto[/\\]kayou[/\\]sources[/\\]narutodb-kayou-checklist\.json$/,
    );
    expect(packSyncedSourcePath("bleach/scb", "carddass-fr-bleach.json")).toMatch(
      /data[/\\]bleach[/\\]scb[/\\]sources[/\\]carddass-fr-bleach\.json$/,
    );
    expect(packSyncedSourcePath("dragonball/jcc", "hatatoy.json")).toMatch(
      /data[/\\]dragonball[/\\]jcc[/\\]sources[/\\]hatatoy\.json$/,
    );
  });

  it("resolvePackSyncedSourcePath falls back to cwd/data when override is empty", () => {
    const prev = process.env.PLACARR_DATA_DIR;
    process.env.PLACARR_DATA_DIR = "/tmp/placarr-empty-data-root-does-not-exist";
    try {
      const resolved = resolvePackSyncedSourcePath(
        "naruto/shippuden",
        "carddas-jp-maku.json",
      );
      expect(resolved).toMatch(
        /[/\\]data[/\\]naruto[/\\]shippuden[/\\]sources[/\\]carddas-jp-maku\.json$/,
      );
    } finally {
      if (prev === undefined) delete process.env.PLACARR_DATA_DIR;
      else process.env.PLACARR_DATA_DIR = prev;
    }
  });
});
