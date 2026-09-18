import { describe, expect, it } from "vitest";
import type { LocalPrintsIndex } from "@/providers/shared/cardCatalogue/localPrintsIndex";
import type { ScanflipCardRow } from "@/providers/shared/scanflip/client";
import {
  groupingFromScanflipMythos,
  isScanflipFinishOnlyRarity,
  mapNarutopiaMythosHeading,
  mapScanflipMythosCard,
  mythosScanflipTitle,
  narutomythosStorageUrl,
  printKeyForNarutomythosSiteCardId,
  printKeysForNarutomythosSiteCardId,
  resolveNarutomythosSiteCardAgainstIndex,
} from "./faces";

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
