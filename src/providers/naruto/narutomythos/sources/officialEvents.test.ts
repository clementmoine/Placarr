import { describe, expect, it } from "vitest";

import {
  loadMythosOfficialEventsDig,
  mythosOfficialEventFacts,
  mythosOfficialEventsForPrint,
  resetMythosOfficialEventsCache,
} from "./officialEvents";
import {
  mythosPrintFacts,
  resetMythosPromoDistributionCache,
  VV2_PROMO_PRINT_KEY,
} from "./promoDistribution";

describe("official-events dig", () => {
  it("is a confirmed multi-locale calendar dig", () => {
    resetMythosOfficialEventsCache();
    const dig = loadMythosOfficialEventsDig();
    expect(dig).not.toBeNull();
    expect(dig!.kind).toBe("research-dig");
    expect(dig!.verdict).toBe("confirmed");
    expect(dig!.pages.map((p) => p.lang).sort()).toEqual(["en", "es", "fr"]);
    expect(dig!.events.length).toBeGreaterThanOrEqual(30);

    const france = dig!.events.find((e) =>
      e.id.startsWith("regional-championship-france"),
    );
    expect(france?.dateStart).toBe("2026-09-11");
    expect(france?.dateEnd).toBe("2026-09-13");
    expect(france?.location?.join(" ")).toMatch(/Montreuil/i);
    expect(
      france?.rewards?.some(
        (r) =>
          r.tier === "winner" && r.printKey === "mythos:ss2-0149-l",
      ),
    ).toBe(true);

    const milan = dig!.events.find((e) =>
      e.id.startsWith("milan-games-week-2026"),
    );
    expect(
      milan?.rewards?.find((r) => r.name.includes("Rasen Shuriken"))?.printKey,
    ).toBe("mythos:ss2-0007-sp");
    expect(
      milan?.rewards?.find((r) => r.name === "NARUTO - The Final Valley")
        ?.printKey,
    ).toBe("mythos:ss2-0147-sp");
    expect(
      milan?.rewards?.find((r) => r.name === "Sasuke - The Final Valley")
        ?.printKey,
    ).toBe("mythos:ss2-0148-sp");
  });
});

describe("mythosOfficialEventFacts", () => {
  it("cites the FR events page for a regional reward print", () => {
    resetMythosOfficialEventsCache();
    const facts = mythosOfficialEventFacts("mythos:ss2-0149-l");
    expect(facts.length).toBeGreaterThanOrEqual(1);
    expect(facts[0]).toMatchObject({
      kind: "category",
      label: "Distribution",
    });
    expect(facts[0]!.value).toMatch(/REGIONAL CHAMPIONSHIP/i);
    expect(facts[0]!.value).toMatch(/vainqueur/i);
    expect(facts[0]!.url).toContain(
      "narutotcgmythos.com/fr/evenements",
    );
  });

  it("links GenCon demo / box promos to known printKeys", () => {
    resetMythosOfficialEventsCache();
    const gencon = mythosOfficialEventsForPrint(VV2_PROMO_PRINT_KEY).find((e) =>
      e.id.startsWith("gencon"),
    );
    expect(gencon?.dateStart).toBe("2026-07-30");
    const facts = mythosOfficialEventFacts(VV2_PROMO_PRINT_KEY);
    expect(facts.some((f) => /GENCON/i.test(f.value))).toBe(true);
  });

  it("emits nothing for an unrelated printKey", () => {
    resetMythosOfficialEventsCache();
    expect(mythosOfficialEventFacts("mythos:ks1-0001")).toEqual([]);
    expect(mythosOfficialEventFacts(null)).toEqual([]);
  });
});

describe("mythosPrintFacts + events", () => {
  it("merges Kana insert + event Distribution facts for VV2", () => {
    resetMythosOfficialEventsCache();
    resetMythosPromoDistributionCache();
    const facts = mythosPrintFacts(VV2_PROMO_PRINT_KEY);
    expect(facts.some((f) => /Boruto Two Blue Vortex/i.test(f.value))).toBe(
      true,
    );
    expect(facts.some((f) => /GENCON|Comic-Con|Comic Con/i.test(f.value))).toBe(
      true,
    );
  });
});
