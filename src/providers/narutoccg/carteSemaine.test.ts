import { describe, expect, it } from "vitest";

import {
  carteSemaineCardId,
  guessSetForCarteSemaineId,
  mergeCarteSemaineIntoIndex,
  parseCarteSemaineHtml,
} from "./carteSemaine";
import type { NarutoPrintRow, NarutoTitleRow } from "./indexStore";

describe("carteSemaine", () => {
  it("normalizes printed ids", () => {
    expect(carteSemaineCardId("NI-34")).toBe("ni034");
    expect(carteSemaineCardId("TE 263")).toBe("te263");
    expect(carteSemaineCardId("CL-27")).toBe("cl027");
  });

  it("guesses cancelled-set band as s6", () => {
    expect(guessSetForCarteSemaineId("te263")).toBe("s6");
    expect(guessSetForCarteSemaineId("ta240")).toBe("s6");
    expect(guessSetForCarteSemaineId("ni309")).toBe("s6");
    expect(guessSetForCarteSemaineId("ni203")).toBe("s5");
  });

  it("parses early [ID] Name layout", () => {
    const week = parseCarteSemaineHtml(
      `<p>[TE-122] L'art d'escalader Une fois n'est pas coutume</p>
       <p>[NI-34] Konoha Maru ). Son faible coût</p>`,
      { week: 1, page: "w1.html" },
    );
    expect(week.featured).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          cardId: "te122",
          name: "L'art d'escalader",
        }),
        expect.objectContaining({ cardId: "ni034", name: "Konoha Maru" }),
      ]),
    );
  });

  it("parses DATE [ID] Name and DATE Name [ID]", () => {
    const week = parseCarteSemaineHtml(
      `27/06/2007 [TE-177] Arcanes Lunaires Cette semaine
       15/12/2008 Mélodie du guerrier illusoire [TE-263] Cette semaine
       22/12/2008 Ino Yamanaka [NI-309] Cette semaine
       08/12/2008 L'homme-ivre [TA-240] Voici`,
      { week: 26, page: "w26.html" },
    );
    const byId = Object.fromEntries(week.featured.map((e) => [e.cardId, e]));
    expect(byId.te177).toMatchObject({
      date: "27/06/2007",
      name: "Arcanes Lunaires",
    });
    expect(byId.te263).toMatchObject({
      date: "15/12/2008",
      name: "Mélodie du guerrier illusoire",
    });
    expect(byId.ni309).toMatchObject({
      date: "22/12/2008",
      name: "Ino Yamanaka",
    });
    expect(byId.ta240).toMatchObject({
      date: "08/12/2008",
      name: "L'homme-ivre",
    });
  });

  it("fills empty titles and injects missing print stubs", () => {
    const prints: NarutoPrintRow[] = [
      {
        printKey: "naruto:s6-ni264",
        setCode: "s6",
        number: "ni264",
        cardType: "ni",
      },
    ];
    const titles: NarutoTitleRow[] = [
      {
        printKey: "naruto:s6-ni264",
        lang: "fr",
        fullName: "",
      },
    ];
    const merged = mergeCarteSemaineIntoIndex({
      prints,
      titles,
      report: {
        generatedAt: "2026-01-01T00:00:00.000Z",
        source: "test",
        weekCount: 1,
        featuredCount: 2,
        uniqueFeaturedIds: ["ni264", "te263"],
        weeks: [
          {
            week: 26,
            page: "w26.html",
            featured: [
              {
                week: 26,
                name: "Shikamaru Nara & Temari",
                printedId: "NI-264",
                cardId: "ni264",
                page: "w26.html",
              },
              {
                week: 26,
                name: "Mélodie du guerrier illusoire",
                printedId: "TE-263",
                cardId: "te263",
                page: "w26.html",
              },
            ],
            alsoMentioned: [],
          },
        ],
      },
    });
    expect(merged.named).toContain("naruto:s6-ni264");
    expect(
      merged.titles.find((t) => t.printKey === "naruto:s6-ni264")?.fullName,
    ).toBe("Shikamaru Nara & Temari");
    expect(merged.addedPrints).toEqual(["naruto:s6-te263"]);
    expect(
      merged.titles.find((t) => t.printKey === "naruto:s6-te263")?.fullName,
    ).toBe("Mélodie du guerrier illusoire");
  });
});
