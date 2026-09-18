import { describe, expect, it } from "vitest";

import {
  groupingFromScanflipMythos,
  isScanflipFinishOnlyRarity,
  mapScanflipMythosCard,
  mythosScanflipTitle,
} from "./scanflipFaces";
import type { ScanflipCardRow } from "@/providers/shared/scanflip/client";

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
