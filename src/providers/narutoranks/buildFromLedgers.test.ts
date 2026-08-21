import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createLocalPrintsIndex } from "@/providers/shared/cardCatalogue/localPrintsIndex";

import { buildNinjaRanksFromLedgers } from "./buildFromLedgers";
import { NARUTO_RANKS_PACK_ID } from "./pack";
import { ninjaRanksSetLabel, ninjaRanksSetSortKey } from "./printKey";
import { narutoranksModule } from "./index";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
  vi.unstubAllEnvs();
});

function tmpDataRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ninja-ranks-"));
  roots.push(root);
  vi.stubEnv("PLACARR_DATA_DIR", root);
  return root;
}

describe("buildNinjaRanksFromLedgers", () => {
  it("writes the official Inkworks titles without inventing faces", () => {
    tmpDataRoot();
    const report = buildNinjaRanksFromLedgers();
    expect(report).toMatchObject({
      rows: 100,
      prints: 100,
      titles: 100,
      skipped: [],
    });

    const index = createLocalPrintsIndex(NARUTO_RANKS_PACK_ID);
    expect(index.lookupRow("naruto:nr-0001")).toMatchObject({
      printKey: "naruto:nr-0001",
      fullName: "Title Card",
      lang: "en",
      art: null,
    });
    expect(index.lookupRow("naruto:ff-0004")?.fullName).toBe("Sasuke - Naruto");
    expect(index.lookupRow("naruto:pn-i")?.fullName).toBe(
      "FREE CARD OFFER ON INKWORKS.COM",
    );
    expect(index.lookupRow("naruto:ni-0001")).toBeNull();
    expect(
      index
        .listSets({
          setLabel: ninjaRanksSetLabel,
          setSortKey: ninjaRanksSetSortKey,
        })
        .map((row) => row.id),
    ).toEqual(["nr", "ff", "sd", "nw", "bl", "pn"]);
  });

  it("lets the provider look up an Inkworks card and refuse a Carddass key", async () => {
    tmpDataRoot();
    buildNinjaRanksFromLedgers();
    const title = await narutoranksModule.lookupPrint!({
      printKey: "naruto:nr-0001",
    });
    expect(title).toMatchObject({
      printKey: "naruto:nr-0001",
      title: "Title Card",
      reference: "1",
      language: "en",
    });
    expect(title?.imageUrl).toBeUndefined();
    await expect(
      narutoranksModule.lookupPrint!({ printKey: "naruto:ni-0001" }),
    ).resolves.toBeNull();
  });
});
