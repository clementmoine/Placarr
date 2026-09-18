import { describe, expect, it } from "vitest";
import { diskIdFromPrintedReference } from "../search";
import { shippudenMercariIngestFaces } from "./faces";

// —— mercari ——
{
  describe("shippudenMercariIngestFaces", () => {
    it("yields ingest rows with mercdn urls and valid disk id mappings", () => {
      const faces = shippudenMercariIngestFaces();
      expect(faces.length).toBeGreaterThan(0);
      for (const f of faces) {
        expect(f.ingest).toBe(true);
        expect(f.url).toMatch(/^https:\/\/static\.mercdn\.net\/item\/detail\/orig\/photos\/m\d+_\d+\.jpg$/);
        expect(diskIdFromPrintedReference(f.printedRef)).toBeTruthy();
      }
    });

    it("resolves seed printed refs to disk ids", () => {
      expect(diskIdFromPrintedReference("忍伝-1")).toBe("shi0001");
      expect(diskIdFromPrintedReference("術伝-12")).toBe("mju0012");
      expect(diskIdFromPrintedReference("作伝-3")).toBe("msa0003");
    });
  });
}
