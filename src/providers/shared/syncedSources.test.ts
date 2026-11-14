import { describe, expect, it } from "vitest";

import { definePackSyncedSources } from "./syncedSources";

describe("definePackSyncedSources", () => {
  it("separates write (dataRoot) from read (repo fallback)", () => {
    const { syncedSourcePath, sourcePath } =
      definePackSyncedSources("naruto/kayou");

    expect(syncedSourcePath("checklist.json")).toMatch(
      /data[/\\]naruto[/\\]kayou[/\\]sources[/\\]checklist\.json$/,
    );

    const prev = process.env.PLACARR_DATA_DIR;
    process.env.PLACARR_DATA_DIR = "/tmp/placarr-empty-synced-sources-factory";
    try {
      expect(sourcePath("narutodb-kayou-checklist.json")).toMatch(
        /[/\\]data[/\\]naruto[/\\]kayou[/\\]sources[/\\]narutodb-kayou-checklist\.json$/,
      );
    } finally {
      if (prev === undefined) delete process.env.PLACARR_DATA_DIR;
      else process.env.PLACARR_DATA_DIR = prev;
    }
  });
});
