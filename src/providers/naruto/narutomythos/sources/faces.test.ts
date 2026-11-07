import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import sharp from "sharp";
import { describe, expect, it } from "vitest";
import type { LocalPrintsIndex } from "@/providers/shared/cardCatalogue/localPrintsIndex";
import type { ScanflipCardRow } from "@/providers/shared/scanflip/client";
import {
  groupingFromScanflipMythos,
  isScanflipFinishOnlyRarity,
  mapNarutopiaMythosHeading,
  mapScanflipMythosCard,
  mythosFaceToWebp,
  mythosLorenzoneFacesContentHash,
  mythosOfficialFacesContentHash,
  mythosScanflipTitle,
  narutomythosStorageUrl,
  printKeyForNarutomythosSiteCardId,
  printKeysForNarutomythosSiteCardId,
  resolveNarutomythosSiteCardAgainstIndex,
} from "./faces";
import {
  catalogArtefactIsFresh,
  emptyCatalogIngestLedger,
} from "@/providers/shared/catalogIngestLedger";
import { narutoMythosCuratedDir } from "../pack";

// —— scanflipFaces ——
{
  function row(
    partial: Partial<ScanflipCardRow> &
      Pick<ScanflipCardRow, "code" | "name" | "slug">,
  ): ScanflipCardRow {
    return {
      id: partial.id ?? partial.slug,
      imageCdn: null,
      imageLowResCdn: null,
      expansionName: null,
      rarityCode: null,
      rarityName: null,
      version: null,
      formerName: null,
      generalType: null,
      releaseDate: null,
      ...partial,
    };
  }

  describe("mapScanflipMythosCard", () => {
    it("maps KS-001 onto ks1-0001", () => {
      expect(
        mapScanflipMythosCard(
          row({ code: "KS-001", name: "Hiruzen", slug: "ks-001-fr-x", rarityCode: "C" }),
        ),
      ).toMatchObject({
        setCode: "ks1",
        number: "0001",
        grouping: null,
        printKey: "mythos:ks1-0001",
      });
    });

    it("maps Rare Art letter / RA onto grouping a, not CFA Full Art", () => {
      expect(
        mapScanflipMythosCard(
          row({
            code: "KS-104A",
            name: "Tsunade",
            slug: "ks-104a",
            rarityCode: "RA",
          }),
        ),
      ).toMatchObject({
        printKey: "mythos:ks1-0104-a",
        grouping: "a",
      });
    });

    it("skips CFA / CH finish tiers (not CICABOOM -a / -chibi)", () => {
      expect(
        mapScanflipMythosCard(
          row({
            code: "KS-025",
            name: "Kiba",
            slug: "ks-025-cfa",
            rarityCode: "CFA",
          }),
        ),
      ).toBeNull();
      expect(
        mapScanflipMythosCard(
          row({
            code: "KS-025",
            name: "Kiba",
            slug: "ks-025-ch",
            rarityCode: "CH",
          }),
        ),
      ).toBeNull();
      expect(isScanflipFinishOnlyRarity("CFA")).toBe(true);
      expect(isScanflipFinishOnlyRarity("CH")).toBe(true);
      expect(groupingFromScanflipMythos("CFA", null)).toBeNull();
      expect(groupingFromScanflipMythos("CH", null)).toBeNull();
      expect(groupingFromScanflipMythos("CHIBI", null)).toBe("chibi");
    });

    it("maps KS-113V MY onto -v and KS-131V SV onto -sv", () => {
      expect(
        mapScanflipMythosCard(
          row({
            code: "KS-113V",
            name: "Kiba",
            slug: "ks-113v",
            rarityCode: "MY",
          }),
        )?.printKey,
      ).toBe("mythos:ks1-0113-v");
      expect(
        mapScanflipMythosCard(
          row({
            code: "KS-131V",
            name: "Tsunade",
            slug: "ks-131v",
            rarityCode: "SV",
          }),
        )?.printKey,
      ).toBe("mythos:ks1-0131-sv");
    });

    it("maps KS-M## onto official MSS missions, not m#", () => {
      expect(
        mapScanflipMythosCard(
          row({ code: "KS-M01", name: "Appel", slug: "ks-m01", rarityCode: "M" }),
        )?.printKey,
      ).toBe("mythos:ks1-mss01");
      expect(
        mapScanflipMythosCard(
          row({
            code: "KS-LEG1",
            name: "Naruto",
            slug: "ks-leg1",
            rarityCode: "LG",
          }),
        )?.printKey,
      ).toBe("mythos:ks1-lg01");
    });

    it("builds ScanFlip display titles", () => {
      expect(
        mythosScanflipTitle(
          row({
            code: "KS-001",
            name: "Hiruzen Sarutobi",
            slug: "x",
            version: "Le Professeur",
          }),
        ),
      ).toBe("Hiruzen Sarutobi — Le Professeur");
    });
  });
}

// —— siteFaces ——
{
  function stubIndex(keys: readonly string[]): LocalPrintsIndex {
    const set = new Set(keys);
    return {
      lookupRow: (printKey: string) =>
        set.has(printKey)
          ? ({
              printKey,
              setCode: "",
              number: "",
              name: "",
              language: "fr",
            } as never)
          : null,
    } as LocalPrintsIndex;
  }

  describe("narutomythos.com faces", () => {
    it("builds storage URLs from relative API paths", () => {
      expect(narutomythosStorageUrl("cards/fr/KS-001.webp")).toBe(
        "https://www.narutomythos.com/storage/cards/fr/KS-001.webp",
      );
      expect(narutomythosStorageUrl(null)).toBeNull();
    });

    it("resolves onto an existing catalogue key (promo V before bare ks1)", () => {
      const index = stubIndex([
        "mythos:ks1promo-0133-v",
        "mythos:ks1-0133-v",
      ]);
      expect(resolveNarutomythosSiteCardAgainstIndex("KS-133-ES", index)).toEqual(
        {
          printKey: "mythos:ks1promo-0133-v",
          setCode: "ks1promo",
          number: "0133",
          grouping: "v",
        },
      );
    });

    it("does not mint when no official printKey exists", () => {
      const index = stubIndex([]);
      expect(resolveNarutomythosSiteCardAgainstIndex("KS-106-A", index)).toBeNull();
    });
  });
}

// —— narutopiaMap ——
{
  describe("mapNarutopiaMythosHeading", () => {
    it("maps base / Rare Art / Legendary / missions", () => {
      expect(mapNarutopiaMythosHeading("C-001")).toMatchObject({
        printKey: "mythos:ks1-0001",
        grouping: null,
      });
      expect(mapNarutopiaMythosHeading("R-104 A")).toMatchObject({
        printKey: "mythos:ks1-0104-a",
        grouping: "a",
      });
      expect(mapNarutopiaMythosHeading("Legendray /1000")).toMatchObject({
        printKey: "mythos:ks1-lg01",
      });
      expect(mapNarutopiaMythosHeading("Mission 006")).toMatchObject({
        printKey: "mythos:ks1-mss06",
      });
    });

    it("maps Mythos V to promo and Secret to s/sv", () => {
      expect(mapNarutopiaMythosHeading("Mythos 113 V")).toMatchObject({
        printKey: "mythos:ks1promo-0113-v",
        grouping: "v",
      });
      expect(mapNarutopiaMythosHeading("Secret 131")).toMatchObject({
        printKey: "mythos:ks1-0131-s",
        grouping: "s",
      });
      expect(mapNarutopiaMythosHeading("Secret 131 V")).toMatchObject({
        printKey: "mythos:ks1-0131-sv",
        grouping: "sv",
      });
    });
  });
}

// —— siteCardId ——
{
  describe("narutomythos.com cardId → printKey", () => {
    it("maps base / alt / mission / legendary ids", () => {
      expect(printKeyForNarutomythosSiteCardId("KS-001")).toBe("mythos:ks1-0001");
      expect(printKeyForNarutomythosSiteCardId("KS-106-A")).toBe(
        "mythos:ks1-0106-a",
      );
      expect(printKeyForNarutomythosSiteCardId("KS-M08")).toBe(
        "mythos:ks1-mss08",
      );
      expect(printKeyForNarutomythosSiteCardId("KS-000-GOLD")).toBe(
        "mythos:ks1-lg01",
      );
    });

    it("prefers promo homes for V / ES exclusives", () => {
      expect(printKeysForNarutomythosSiteCardId("KS-113-V")[0]).toBe(
        "mythos:ks1promo-0113-v",
      );
      expect(printKeysForNarutomythosSiteCardId("KS-133-ES")[0]).toBe(
        "mythos:ks1promo-0133-v",
      );
    });

    it("refuses unknown suffixes instead of guessing", () => {
      expect(printKeyForNarutomythosSiteCardId("KS-010-GOLD")).toBeNull();
      expect(printKeyForNarutomythosSiteCardId("XY-001")).toBeNull();
    });
  });
}

// —— lorenzoneFaces ledger ——
{
  describe("mythosLorenzoneFacesContentHash", () => {
    it("is stable across calls and marks ledger fresh", () => {
      const a = mythosLorenzoneFacesContentHash();
      const b = mythosLorenzoneFacesContentHash();
      expect(a).toBe(b);
      expect(a).toMatch(/^[a-f0-9]{64}$/);
      const ledger = emptyCatalogIngestLedger();
      ledger.entries["mythos:lorenzone-faces"] = {
        artefactId: "mythos:lorenzone-faces",
        contentHash: a,
        promotedAt: "2026-01-01T00:00:00.000Z",
      };
      expect(
        catalogArtefactIsFresh(ledger, "mythos:lorenzone-faces", b),
      ).toBe(true);
      expect(
        catalogArtefactIsFresh(ledger, "mythos:lorenzone-faces", "other"),
      ).toBe(false);
    });
  });

  describe("mythosOfficialFacesContentHash", () => {
    it("is stable across calls and marks ledger fresh", () => {
      const a = mythosOfficialFacesContentHash();
      const b = mythosOfficialFacesContentHash();
      expect(a).toBe(b);
      expect(a).toMatch(/^[a-f0-9]{64}$/);
      const ledger = emptyCatalogIngestLedger();
      ledger.entries["mythos:official-faces"] = {
        artefactId: "mythos:official-faces",
        contentHash: a,
        promotedAt: "2026-01-01T00:00:00.000Z",
      };
      expect(
        catalogArtefactIsFresh(ledger, "mythos:official-faces", b),
      ).toBe(true);
    });
  });
}

describe("mythosFaceToWebp", () => {
  it("trims the transparent CDN gutter so the card fills its frame", async () => {
    const card = await sharp({
      create: {
        width: 100,
        height: 140,
        channels: 3,
        background: "#f97316",
      },
    })
      .png()
      .toBuffer();
    const padded = await sharp({
      create: {
        width: 148,
        height: 188,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite([{ input: card, left: 24, top: 24 }])
      .png()
      .toBuffer();

    const out = await mythosFaceToWebp(padded);
    const meta = await sharp(out).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.width).toBe(100);
    expect(meta.height).toBe(140);
  });

  it("trims the white gutter on curated CICABOOM promo stamps (0133 EN)", async () => {
    const sourcePath = path.join(
      narutoMythosCuratedDir(),
      "sources",
      "official-events-media",
      "ks1promo-0133-promo.source.webp",
    );
    expect(existsSync(sourcePath)).toBe(true);
    const source = readFileSync(sourcePath);
    const before = await sharp(source).metadata();
    const out = await mythosFaceToWebp(source);
    const after = await sharp(out).metadata();
    expect(after.width!).toBeLessThan(before.width!);
    expect(after.height!).toBeLessThan(before.height!);
  });
});
