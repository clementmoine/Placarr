import path from "node:path";
import { describe, expect, it } from "vitest";

import { narutoDataCarddassEffectPack } from "@/effects/narutodatacarddass";
import { listCuratedBackSources } from "@/providers/shared/curatedCardsInstall";

import { narutodatacarddassModule } from "./index";
import { narutoDataCarddassCuratedDir } from "./pack";
import {
  buildDataCarddassFromLedgers,
  readDataCarddassChecklist,
} from "./buildFromLedgers";
import {
  dataCarddassPrintKey,
  formatDataCarddassReference,
  parseDataCarddassPrinted,
} from "./printKey";

describe("narutodatacarddass provider hooks", () => {
  it("declares a Data Carddass local catalogue surface", () => {
    expect(narutodatacarddassModule.info.id).toBe("narutodatacarddass");
    expect(narutodatacarddassModule.catalog?.dataPack).toBe(
      "naruto/data-carddass",
    );
    expect(narutodatacarddassModule.printGames).toEqual(["datacarddass"]);
    expect(narutodatacarddassModule.info.catalogueLabel).toBe(
      "Naruto Data Carddass",
    );
  });

  it("does not claim Carddass printKeys", async () => {
    await expect(
      narutodatacarddassModule.lookupPrint!({ printKey: "naruto:ni-0001" }),
    ).resolves.toBeNull();
  });
});

describe("checklist Data Carddass", () => {
  it("seeds attested DN/NM examples", () => {
    const ledger = readDataCarddassChecklist();
    expect(ledger.cards.length).toBeGreaterThanOrEqual(2);
    const report = buildDataCarddassFromLedgers({ dryRun: true });
    expect(report.prints).toBe(report.rows);
    expect(report.skipped).toEqual([]);
  });

  it("parse DN-032T, NM-049, NF and promo annexes", () => {
    expect(parseDataCarddassPrinted("DN-032T")).toEqual({
      set: "dn",
      number: "032t",
      printed: "DN-032T",
    });
    expect(parseDataCarddassPrinted("DN-051-R")).toEqual({
      set: "dn",
      number: "051r",
      printed: "DN-051-R",
    });
    expect(parseDataCarddassPrinted("NM-049")).toEqual({
      set: "nm",
      number: "049",
      printed: "NM-049",
    });
    expect(parseDataCarddassPrinted("NF-141")).toEqual({
      set: "nf",
      number: "141",
      printed: "NF-141",
    });
    expect(parseDataCarddassPrinted("NFP-019")).toEqual({
      set: "nfp",
      number: "019",
      printed: "NFP-019",
    });
    expect(parseDataCarddassPrinted("NXP-SP2")).toBeNull();
    expect(dataCarddassPrintKey("dn", "032t")).toBe("datacarddass:dn-032t");
    expect(formatDataCarddassReference("dn", "032t")).toBe("DN-32T");
    expect(formatDataCarddassReference("nf", "141")).toBe("NF-141");
  });
});

describe("narutodatacarddass curated back", () => {
  it("ships a pack back placeholder", () => {
    expect(
      listCuratedBackSources(
        path.join(narutoDataCarddassCuratedDir(), "cards"),
      ).map((row) => row.destRel),
    ).toEqual(["back.webp"]);
  });

  it("registers a catalogue-only effect pack", () => {
    expect(narutoDataCarddassEffectPack.id).toBe("naruto-data-carddass");
  });
});
