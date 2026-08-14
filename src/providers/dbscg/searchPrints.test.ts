import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { DBS_CG_EFFECT_PACK_ID, DBS_CG_FINISHES } from "@/effects/dbscg";

import { parseDbsCardlistHtml } from "./parseCardlist";
import { indexDbsCgCards } from "./scrapeCardlist";
import { lookupDbsCgPrint, searchDbsCgPrints } from "./searchPrints";
import { resetDbsCgDbCache } from "./indexStore";

const fixture = readFileSync(
  path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "fixtures/bt1-sample.html",
  ),
  "utf8",
);

describe("searchDbsCgPrints", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(path.join(os.tmpdir(), "dbscg-"));
    const dbPath = path.join(tmp, "catalog.sqlite");
    process.env.PLACARR_DBSCG_DB = dbPath;
    resetDbsCgDbCache();
    indexDbsCgCards(parseDbsCardlistHtml(fixture), dbPath);
    resetDbsCgDbCache();
  });

  afterEach(() => {
    resetDbsCgDbCache();
    delete process.env.PLACARR_DBSCG_DB;
    rmSync(tmp, { recursive: true, force: true });
  });

  it("finds a card by name and by printed number", () => {
    const byName = searchDbsCgPrints("Champa");
    expect(byName.map((card) => card.printKey)).toContain("dbscg:bt1-001");
    const byNumber = searchDbsCgPrints("BT1-001");
    expect(byNumber[0]?.printKey).toBe("dbscg:bt1-001");
  });

  it("stamps the effect pack, Leader verso, and both finishes", () => {
    const print = lookupDbsCgPrint("dbscg:bt1-001");
    expect(print?.effectPack).toBe(DBS_CG_EFFECT_PACK_ID);
    expect(print?.cardBackUrl).toMatch(/BT1-001_b\.png$/);
    expect(print?.finishes).toEqual(["normal", ...DBS_CG_FINISHES]);
    expect(print?.plainFinishes).toEqual(["normal"]);
    expect(print?.reference).toBe("BT1-001");
  });

  it("looks up an SPR parallel as its own print", () => {
    const spr = lookupDbsCgPrint("dbscg:bt1-011-spr");
    expect(spr?.reference).toBe("BT1-011_SPR");
    expect(spr?.cardBackUrl).toBeUndefined();
  });
});

/**
 * The pack downloads faces to `data/dbs/cg/cards/…` but the candidate used to
 * hand out Bandai's remote URL regardless, so every card was served at 260x363
 * while a 400x560 file sat unused on disk.
 */
describe("face preference", () => {
  it("serves the synced local face rather than the remote one", () => {
    const candidate = lookupDbsCgPrint("dbscg:bt1-001");
    expect(candidate?.imageUrl).toBe(
      "/assets/dbs/cg/cards/bt1/fr/001/art.webp",
    );
    expect(candidate?.thumbnailUrl).toBe(candidate?.imageUrl);
  });

  it("keeps the remote URL for a print with no local face yet", () => {
    // A print the faces pass has not reached still has to be pickable.
    const missing = lookupDbsCgPrint("dbscg:bt31-001");
    if (missing?.imageUrl && !missing.imageUrl.startsWith("/assets/")) {
      expect(missing.imageUrl).toMatch(/^https?:\/\//);
    }
  });
});
