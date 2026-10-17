import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import ledger from "../curated/sources/ultrajeux-s5.json";
import { loadStorm3Ledger, storm3LedgerPath, ultrajeuxWaybackUrl } from "./marketplace";

// —— scrapeStorm3 ——
{
  describe("loadStorm3Ledger", () => {
    it("reads staging/stop2shop-uns3 under the pack root (not nested twice)", () => {
      const packDir = mkdtempSync(path.join(tmpdir(), "naruto-storm3-"));
      const dest = storm3LedgerPath(packDir);
      expect(dest).toBe(
        path.join(packDir, "staging", "stop2shop-uns3", "cards.json"),
      );
      mkdirSync(path.dirname(dest), { recursive: true });
      writeFileSync(
        dest,
        JSON.stringify({
          cards: [
            {
              number: "n1685",
              cardType: "n",
              name: "MADARA UCHIHA",
              rarity: "super rare",
              productPath: "/n1685.html",
            },
          ],
        }),
        "utf8",
      );
      expect(loadStorm3Ledger(packDir).map((c) => c.number)).toEqual(["n1685"]);
    });
  });
}

// —— scrapeUltrajeuxS5 ——
{
  describe("Ultrajeux S5 holes", () => {
    it("targets the six CDX-missing official scans, not the whole serie_5 tree", () => {
      expect(ledger.ingest).toBe("s5-holes");
      expect(ledger.holes.map((row) => row.number)).toEqual([
        "ni232",
        "ni236",
        "ni252",
        "ni253",
        "ta221",
        "ta226",
      ]);
      expect(ultrajeuxWaybackUrl("ta-221.jpg", "20190228114039")).toContain(
        "/serie_5/ta-221.jpg",
      );
      expect(ultrajeuxWaybackUrl("ta-221.jpg", "20190228114039")).toContain(
        "20190228114039id_",
      );
    });
  });
}

