import { describe, expect, it } from "vitest";

import { NARUTO_MYTHOS_FULL_FOIL_MASK_URL } from "@/effects/narutomythos";
import type { PrintCandidate } from "@/types/providerModule";
import type { LocalPrintSearchRow } from "@/providers/shared/cardCatalogue/localPrintsIndex";

import {
  decorateMythosCandidate,
  mythosFoilForPrint,
  mythosFoilFromGrouping,
  mythosFoilFromRarity,
} from "./finishes";

function row(
  partial: Partial<LocalPrintSearchRow> & Pick<LocalPrintSearchRow, "printKey">,
): LocalPrintSearchRow {
  return {
    setCode: "ks1promo",
    number: "0133",
    cardType: "0133",
    grouping: null,
    category: null,
    lang: "fr",
    fullName: "Naruto",
    rarity: null,
    art: null,
    thumb: null,
    back: null,
    ...partial,
  };
}

const base: PrintCandidate = {
  printKey: "mythos:ks1promo-0133-vv2",
  title: "Naruto",
  reference: "0133",
  effectPack: "naruto-mythos",
};

describe("mythos finishes", () => {
  it("maps Mythos / RA / S-family rarities to holo", () => {
    expect(mythosFoilFromRarity("M")).toBe("holo");
    expect(mythosFoilFromRarity("Mythos")).toBe("holo");
    expect(mythosFoilFromRarity("RA")).toBe("holo");
    expect(mythosFoilFromRarity("S")).toBe("holo");
    expect(mythosFoilFromRarity("SV")).toBe("holo");
    expect(mythosFoilFromRarity("L")).toBe("holo");
    expect(mythosFoilFromRarity("Secret Gold V")).toBe("holo");
  });

  it("leaves C / UC / R plain", () => {
    expect(mythosFoilFromRarity("C")).toBeNull();
    expect(mythosFoilFromRarity("UC")).toBeNull();
    expect(mythosFoilFromRarity("R")).toBeNull();
    expect(mythosFoilFromRarity("Mission")).toBeNull();
  });

  it("reads holo / gold / Mythos groupings without catching chibi", () => {
    expect(mythosFoilFromGrouping("vv2")).toBe("holo");
    expect(mythosFoilFromGrouping("v")).toBe("holo");
    expect(mythosFoilFromGrouping("ah")).toBe("holo");
    expect(mythosFoilFromGrouping("hv2")).toBe("holo");
    expect(mythosFoilFromGrouping("lgold")).toBe("holo");
    expect(mythosFoilFromGrouping("chibi")).toBeNull();
    expect(mythosFoilFromGrouping("shinobi")).toBeNull();
    expect(mythosFoilFromGrouping("a")).toBeNull();
  });

  it("decorates the shelf VV2 Mythos print with flare mask", () => {
    const out = decorateMythosCandidate(
      base,
      row({
        printKey: "mythos:ks1promo-0133-vv2",
        grouping: "vv2",
        rarity: "M",
      }),
    );
    expect(mythosFoilForPrint("M", "vv2")).toBe("holo");
    expect(out.finishes).toEqual(["holo"]);
    expect(out.plainFinishes).toEqual([]);
    expect(out.foilMaskUrl).toBe(NARUTO_MYTHOS_FULL_FOIL_MASK_URL);
  });

  it("does not stamp foil on a common", () => {
    const out = decorateMythosCandidate(
      base,
      row({
        printKey: "mythos:ks1-0001",
        grouping: null,
        rarity: "C",
      }),
    );
    expect(out.finishes).toBeUndefined();
    expect(out.foilMaskUrl).toBeUndefined();
  });
});
