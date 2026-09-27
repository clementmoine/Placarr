import { describe, expect, it } from "vitest";
import { diskIdFromPrintedReference } from "../search";
import {
  shippudenEbayIngestFaces,
  shippudenFrilIngestFaces,
  shippudenMercariIngestFaces,
} from "./faces";

// —— mercari ——
{
  describe("shippudenMercariIngestFaces", () => {
    it("yields ingest rows with mercdn urls and valid disk id mappings", () => {
      const faces = shippudenMercariIngestFaces();
      expect(faces.length).toBeGreaterThan(0);
      for (const f of faces) {
        expect(f.ingest).toBe(true);
        expect(f.url).toMatch(
          /^https:\/\/static\.mercdn\.net\/item\/detail\/orig\/photos\/m\d+_\d+\.jpg(\?\d+)?$/,
        );
        expect(diskIdFromPrintedReference(f.printedRef)).toBeTruthy();
      }
    });

    it("resolves seed printed refs to disk ids", () => {
      expect(diskIdFromPrintedReference("忍伝-1")).toBe("shi0001");
      expect(diskIdFromPrintedReference("術伝-12")).toBe("mju0012");
      expect(diskIdFromPrintedReference("作伝-3")).toBe("msa0003");
      expect(diskIdFromPrintedReference("PR学-001")).toBe("prgaku0001");
      expect(diskIdFromPrintedReference("PR学-010")).toBe("prgaku0010");
    });

    it("includes the 忍者学校 PR学-001…010 mercari pack (m89472003355)", () => {
      const prgaku = shippudenMercariIngestFaces().filter((row) =>
        row.printedRef.startsWith("PR学-"),
      );
      expect(prgaku.map((row) => row.printedRef)).toEqual([
        "PR学-001",
        "PR学-002",
        "PR学-003",
        "PR学-004",
        "PR学-005",
        "PR学-006",
        "PR学-007",
        "PR学-008",
        "PR学-009",
        "PR学-010",
      ]);
      expect(prgaku.every((row) => row.listingUrl.includes("m89472003355"))).toBe(
        true,
      );
    });

    it("includes PR忍伝-2 Sakura gap fill (m81667697805)", () => {
      const row = shippudenMercariIngestFaces().find(
        (face) => face.printedRef === "PR忍伝-2",
      );
      expect(row?.listingUrl).toContain("m81667697805");
      expect(diskIdFromPrintedReference("PR忍伝-2")).toBe("prshi0002");
    });

    it("includes PR忍伝-8 Naruto&Hinata gap fill (m30458189956)", () => {
      const row = shippudenMercariIngestFaces().find(
        (face) => face.printedRef === "PR忍伝-8",
      );
      expect(row?.listingUrl).toContain("m30458189956");
      expect(diskIdFromPrintedReference("PR忍伝-8")).toBe("prshi0008");
    });

    it("includes browser-hunt PR忍伝-1/3/4/10", () => {
      const byRef = Object.fromEntries(
        shippudenMercariIngestFaces().map((row) => [row.printedRef, row]),
      );
      expect(byRef["PR忍伝-1"]?.listingUrl).toContain("m80487235868");
      expect(byRef["PR忍伝-3"]?.listingUrl).toContain("m29398959256");
      expect(byRef["PR忍伝-4"]?.listingUrl).toContain("m98823704479");
      expect(byRef["PR忍伝-10"]?.listingUrl).toContain("m33650947973");
    });
  });
}

// —— fril / ラクマ ——
{
  describe("shippudenFrilIngestFaces", () => {
    it("includes PR忍伝-7 Itachi (title-only gap fill)", () => {
      const faces = shippudenFrilIngestFaces();
      expect(faces.map((row) => row.printedRef)).toContain("PR忍伝-7");
      const itachi = faces.find((row) => row.printedRef === "PR忍伝-7")!;
      expect(diskIdFromPrintedReference(itachi.printedRef)).toBe("prshi0007");
      expect(itachi.listingUrl).toContain("60b4ec7f3cccb4735f3a4f304511c886");
      expect(itachi.url).toMatch(/^https:\/\/img\.fril\.jp\//);
    });
  });
}

// —— eBay ——
{
  describe("shippudenEbayIngestFaces", () => {
    it("includes 忍伝-013 Konohamaru gap fill", () => {
      const row = shippudenEbayIngestFaces().find(
        (face) => face.printedRef === "忍伝-013",
      );
      expect(row?.listingUrl).toContain("394838159048");
      expect(row?.diskId).toBe("shi0013");
      expect(row?.url).toMatch(/s-l1600/);
    });

    it("includes cardjpstore active gap fills 077/104/119/135/149/150", () => {
      const byRef = Object.fromEntries(
        shippudenEbayIngestFaces().map((row) => [row.printedRef, row]),
      );
      expect(byRef["忍伝-77"]?.diskId).toBe("shi0077");
      expect(byRef["忍伝-77"]?.listingUrl).toContain("176661018228");
      expect(byRef["忍伝-104"]?.diskId).toBe("shi0104");
      expect(byRef["忍伝-104"]?.listingUrl).toContain("178486485086");
      expect(byRef["忍伝-119"]?.diskId).toBe("shi0119");
      expect(byRef["忍伝-135"]?.diskId).toBe("shi0135");
      expect(byRef["忍伝-149"]?.diskId).toBe("shi0149");
      expect(byRef["忍伝-150"]?.diskId).toBe("shi0150");
      for (const ref of [
        "忍伝-77",
        "忍伝-104",
        "忍伝-119",
        "忍伝-135",
        "忍伝-149",
        "忍伝-150",
      ]) {
        expect(byRef[ref]?.url).toMatch(/s-l1600/);
        expect(diskIdFromPrintedReference(ref)).toBe(byRef[ref]?.diskId);
      }
    });
  });
}
