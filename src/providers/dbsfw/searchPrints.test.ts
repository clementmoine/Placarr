import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { DBS_FW_EFFECT_PACK_ID, DBS_FW_FINISHES } from "@/effects/dbsfw";

import { parseDbsFwCardlistHtml } from "./parseCardlist";
import { indexDbsFwCards } from "./scrapeCardlist";
import { lookupDbsFwPrint, searchDbsFwPrints } from "./searchPrints";
import { resetDbsFwDbCache } from "./indexStore";

const fixture = readFileSync(
  path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "fixtures/st01-sample.html",
  ),
  "utf8",
);

describe("searchDbsFwPrints", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(path.join(os.tmpdir(), "dbsfw-"));
    const dbPath = path.join(tmp, "catalog.sqlite");
    process.env.PLACARR_DBSFW_DB = dbPath;
    resetDbsFwDbCache();
    indexDbsFwCards(parseDbsFwCardlistHtml(fixture), dbPath);
    resetDbsFwDbCache();
  });

  afterEach(() => {
    resetDbsFwDbCache();
    delete process.env.PLACARR_DBSFW_DB;
    rmSync(tmp, { recursive: true, force: true });
  });

  it("finds a card by name and by printed number", () => {
    const byName = searchDbsFwPrints("Goten");
    expect(byName.map((card) => card.printKey)).toContain("dbsfw:st01-001");
    const byNumber = searchDbsFwPrints("ST01-001");
    expect(byNumber[0]?.printKey).toBe("dbsfw:st01-001");
  });

  it("stamps the effect pack and both finishes", () => {
    const print = lookupDbsFwPrint("dbsfw:st01-001");
    expect(print?.effectPack).toBe(DBS_FW_EFFECT_PACK_ID);
    expect(print?.finishes).toEqual(["normal", ...DBS_FW_FINISHES]);
    expect(print?.reference).toBe("ST01-001");
  });

  it("looks up a parallel as its own print", () => {
    const parallel = lookupDbsFwPrint("dbsfw:st01-001-p1");
    expect(parallel?.reference).toBe("ST01-001_P1");
  });
});
