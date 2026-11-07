import { existsSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  clearDbsCgCatalogueBrowseCache,
  listDbsCgCatalogueBrowsePageRows,
} from "./catalogueBrowse";
import { dbsCgDbPath } from "./indexStore";

const hasDb = existsSync(dbsCgDbPath());

describe.skipIf(!hasDb)("dbs cg catalogue browse local faces", () => {
  it("resolves densified disk art even when sqlite holds a CDN URL", () => {
    clearDbsCgCatalogueBrowseCache();
    const page = listDbsCgCatalogueBrowsePageRows({
      langs: ["fr"],
      offset: 0,
      limit: 96,
    });
    const withArt = page.rows.filter((row) => row.artUrl && !row.missingArt);
    expect(withArt.length).toBeGreaterThan(0);
    expect(withArt.every((row) => row.artUrl.startsWith("/assets/"))).toBe(
      true,
    );
    expect(
      withArt.every((row) => !/^https?:\/\//i.test(row.artUrl)),
    ).toBe(true);
  });
});
