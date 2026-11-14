import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  DBS_FW_EFFECT_PACK_ID,
  DBS_FW_FINISHES,
  dbsFwEffectPack,
} from "@/effects/dbsfw";
import { DBS_FW_CLIENT_RENDERS } from "@/effects/dbsfw/clientRenders";

import { parseDbsFwCardlistHtml } from "./parse/cardlist";
import { indexDbsFwCards } from "./scrape/cardlist";
import { lookupDbsFwPrint, searchDbsFwPrints } from "./search";
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
    expect(dbsFwEffectPack.listMaterials()).toEqual(
      DBS_FW_CLIENT_RENDERS.map((row) => row.id),
    );
    const face = dbsFwEffectPack.playroomArtForMaterial?.("foil-holo");
    expect(face?.imageUrl).toContain("/cards/");
    expect(face?.imageUrl).not.toContain("/textures/client-");
    const plain = dbsFwEffectPack.material("card");
    expect(plain?.floats._UseFrame2).toBe(0);
    expect(plain?.floats._HoloFoilEnabled).toBe(0);
    expect(plain?.floats._FoilType).toBe(0);
    expect(plain?.textures._Frame2Tex).toBeUndefined();
    expect(plain?.textures._HoloMask).toBeUndefined();
    const holo = dbsFwEffectPack.material("foil-holo");
    expect(holo?.floats._HoloFoilEnabled).toBe(1);
    expect(holo?.floats._UseFrame2).toBe(0);
    expect(holo?.textures._FoilMask).toEqual({ role: "foilMask" });
    expect(holo?.textures._HoloMask?.file).toBe("client-st01-004-para-holo.webp");
    expect(holo?.textures._MasksTex?.file).toBe("client-st01-004-para-holo.webp");
    expect(holo?.textures._MainTex).toEqual({ role: "art" });
    expect(holo?.textures._FrontTex).toEqual({ role: "front" });
    expect(holo?.textures._FrameTex).toEqual({ role: "frame" });
    expect(holo?.textures._CharaTex).toEqual({ role: "ink" });
    expect(holo?.floats._UseFront).toBe(1);
    expect(holo?.floats._UseFrame).toBe(1);
    expect(holo?.floats._UseChara).toBe(1);
    expect(dbsFwEffectPack.resolveMaterial("foil", null)?.fragment).toBe(
      "FrostCard.frag",
    );
    expect(dbsFwEffectPack.resolveMaterial("normal", null)).toBeNull();
    expect(
      dbsFwEffectPack.layerSurfaces?.(
        "/assets/dragonball/fw/cards/en/fb01/001/art.client.webp",
      )?.frontUrl,
    ).toBe("/assets/dragonball/fw/cards/en/fb01/001/layer.picture.webp");
    const energy = dbsFwEffectPack.material("energy-holo");
    expect(energy?.floats._FoilType).toBe(0);
    expect(energy?.textures._FoilMask).toBeUndefined();
    expect(energy?.textures._HoloMask?.file).toBe("client-energy-holo-map.webp");
    expect(energy?.textures._HoloMap?.file).toBe("client-energy-holo-map.webp");
    expect(energy?.textures._MainTex).toEqual({ role: "art" });
    expect(print?.reference).toBe("ST01-001");
  });

  it("looks up a parallel as its own print", () => {
    const parallel = lookupDbsFwPrint("dbsfw:st01-001-p1");
    expect(parallel?.reference).toBe("ST01-001_P1");
  });
});
