import path from "node:path";
import { describe, expect, it } from "vitest";
import { narutoDataCarddassEffectPack } from "@/effects/narutodatacarddass";
import { listCuratedBackSources } from "@/providers/shared/curatedCardsInstall";
import { narutodatacarddassModule } from "./index";
import { narutoDataCarddassCuratedDir } from "./pack";
import {
  buildDataCarddassFromLedgers,
  readDataCarddassChecklist,
} from "./pipeline/ledgers";
import {
  dataCarddassPrintKey,
  formatDataCarddassReference,
  parseDataCarddassPrinted,
  resolveDataCarddassNumberAgainstKnown,
  resolveDataCarddassSurugaListing,
} from "./printKey";

// —— index ——
{
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

    it("parse DN-032T, DT, NM, NC, NF et promo annexes", () => {
      expect(parseDataCarddassPrinted("DN-032T")).toEqual({
        set: "dn",
        number: "032t",
        printed: "DN-032T",
      });
      expect(parseDataCarddassPrinted("DT-002T")).toEqual({
        set: "dt",
        number: "002t",
        printed: "DT-002T",
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
      expect(parseDataCarddassPrinted("NC-001")).toEqual({
        set: "nc",
        number: "001",
        printed: "NC-001",
      });
      expect(parseDataCarddassPrinted("NF-141")).toEqual({
        set: "nf",
        number: "141",
        printed: "NF-141",
      });
      expect(parseDataCarddassPrinted("NFC-001")).toEqual({
        set: "nfc",
        number: "001",
        printed: "NFC-001",
      });
      expect(parseDataCarddassPrinted("NFP-019")).toEqual({
        set: "nfp",
        number: "019",
        printed: "NFP-019",
      });
      expect(parseDataCarddassPrinted("NXP-SP2")).toBeNull();
      expect(parseDataCarddassPrinted("NX-CAM001")).toEqual({
        set: "nxcam",
        number: "001",
        printed: "NX-CAM-001",
      });
      expect(parseDataCarddassPrinted("NX-SPI")).toEqual({
        set: "nxsp",
        number: "001",
        printed: "NX-SP-I",
      });
      expect(parseDataCarddassPrinted("NX-SPIII")).toEqual({
        set: "nxsp",
        number: "003",
        printed: "NX-SP-III",
      });
      expect(parseDataCarddassPrinted("NXP-SP II")).toEqual({
        set: "nxpsp",
        number: "002",
        printed: "NXP-SP-II",
      });
      expect(parseDataCarddassPrinted("NFM-SP")).toEqual({
        set: "nfm",
        number: "sp",
        printed: "NFM-SP",
      });
      expect(parseDataCarddassPrinted("CAN-001")).toEqual({
        set: "can",
        number: "001",
        printed: "CAN-001",
      });
      expect(parseDataCarddassPrinted("VJCF-2009")).toEqual({
        set: "vjcf",
        number: "2009",
        printed: "VJCF-2009",
      });
      expect(dataCarddassPrintKey("dn", "032t")).toBe("datacarddass:dn-032t");
      expect(formatDataCarddassReference("dn", "032t")).toBe("DN-32T");
      expect(formatDataCarddassReference("nf", "141")).toBe("NF-141");
    });

    it("résout DN-080 Suruga → DN-080T checklist (suffixe unique)", () => {
      const known = new Set(["dn:080t", "dn:051r", "dn:051t", "nm:031"]);
      expect(
        resolveDataCarddassNumberAgainstKnown("dn", "080", known),
      ).toEqual({ set: "dn", number: "080t" });
      expect(
        resolveDataCarddassNumberAgainstKnown("dn", "080t", known),
      ).toEqual({ set: "dn", number: "080t" });
      // Ambiguous R/T — do not invent.
      expect(
        resolveDataCarddassNumberAgainstKnown("dn", "051", known),
      ).toBeNull();
      expect(
        resolveDataCarddassNumberAgainstKnown("nx", "238", known),
      ).toBeNull();
    });

    it("accepte CAN-001 Suruga quand le set n'a aucune fiche checklist", () => {
      const known = new Set(["dn:080t"]);
      const checklistSets = new Set(["dn"]);
      expect(
        resolveDataCarddassSurugaListing("can", "001", known, checklistSets),
      ).toEqual({ set: "can", number: "001" });
      // Print already seeded into known (Suruga title) — exact hit.
      expect(
        resolveDataCarddassSurugaListing(
          "can",
          "001",
          new Set(["can:001"]),
          new Set(),
        ),
      ).toEqual({ set: "can", number: "001" });
      // Checklist set without a known number — still refuse bare invent.
      expect(
        resolveDataCarddassSurugaListing("dn", "999", known, checklistSets),
      ).toBeNull();
    });

    it("catalogue officiel : centaines de fiches DN/NM/NF", () => {
      const ledger = readDataCarddassChecklist();
      expect(ledger.cards.length).toBeGreaterThan(900);
      const prefixes = new Set(
        ledger.cards.map((c) => c.printed.split("-")[0]?.toUpperCase()),
      );
      expect(prefixes.has("DN")).toBe(true);
      expect(prefixes.has("NM")).toBe(true);
      expect(prefixes.has("NF")).toBe(true);
    });
  });

  describe("narutodatacarddass curated back", () => {
    it("n'installe pas de dos pack (verso unique par carte / CODE128)", () => {
      expect(
        listCuratedBackSources(
          path.join(narutoDataCarddassCuratedDir(), "cards"),
        ),
      ).toEqual([]);
    });

    it("registers a catalogue-only effect pack", () => {
      expect(narutoDataCarddassEffectPack.id).toBe("naruto-data-carddass");
    });
  });
}
