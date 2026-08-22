import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createLocalPrintsIndex } from "@/providers/shared/cardCatalogue/localPrintsIndex";

import {
  buildEuropeanNsFromLedger,
  buildNinjaRanksFromLedgers,
  buildSupplementalPromosFromLedger,
  readEuropeanNsChecklist,
  readSupplementalPromosChecklist,
} from "./buildFromLedgers";
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
    const ns = buildEuropeanNsFromLedger();
    const promos = buildSupplementalPromosFromLedger();
    expect(report).toMatchObject({
      rows: 100,
      prints: 100,
      titles: 100,
      skipped: [],
    });
    expect(ns).toMatchObject({
      rows: 6,
      prints: 6,
      titles: 6,
      skipped: [],
    });
    expect(promos).toMatchObject({
      rows: 2,
      prints: 2,
      titles: 2,
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
    expect(index.lookupRow("naruto:pn-sd2006")?.fullName).toBe(
      "SDCC EXCLUSIVE",
    );
    expect(index.lookupRow("naruto:ns-0001")?.fullName).toBe("Kakashi");
    expect(index.lookupRow("naruto:ni-0001")).toBeNull();
    expect(
      index
        .listSets({
          setLabel: ninjaRanksSetLabel,
          setSortKey: ninjaRanksSetSortKey,
        })
        .map((row) => row.id),
    ).toEqual(["nr", "ff", "sd", "nw", "ns", "bl", "pn"]);
  });

  it("lets the provider look up an Inkworks card and refuse a Carddass key", async () => {
    tmpDataRoot();
    buildNinjaRanksFromLedgers();
    buildEuropeanNsFromLedger();
    buildSupplementalPromosFromLedger();
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

describe("buildEuropeanNsFromLedger", () => {
  it("holds six EU-only Ninja Sensei cards absent from Inkworks US", () => {
    const ledger = readEuropeanNsChecklist();
    expect(ledger.notUs).toBe(true);
    expect(ledger.cards).toHaveLength(6);
    expect(ledger.cards.map((c) => c.printed)).toEqual([
      "NS-1",
      "NS-2",
      "NS-3",
      "NS-4",
      "NS-5",
      "NS-6",
    ]);
  });
});

describe("buildSupplementalPromosFromLedger", () => {
  it("holds the two promos absent from the official Inkworks checklist", () => {
    const ledger = readSupplementalPromosChecklist();
    expect(ledger.cards).toHaveLength(2);
    expect(ledger.cards[0]).toMatchObject({
      printed: "PN-SD2006",
      setCode: "pn",
      number: "sd2006",
      name: "SDCC EXCLUSIVE",
    });
    // PN-P se range sous le code de son verso, pas sous le « PR-001 » du recto.
    expect(ledger.cards[1]).toMatchObject({
      printed: "PN-P",
      setCode: "pn",
      number: "p",
      name: "SDCC PASSPORT PROGRAM",
    });
  });
});
