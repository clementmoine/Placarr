import { describe, expect, it } from "vitest";

import type { NarutoPrintRow, NarutoTitleRow } from "./indexStore";
import {
  applyOfficialNames,
  collectorNumberOf,
  loadOfficialNames,
  type OfficialNames,
} from "./officialNames";

function print(number: string, set = "s5"): NarutoPrintRow {
  return {
    printKey: `naruto:${set}-${number}`,
    setCode: set,
    number,
    cardType: number.slice(0, 2),
  };
}

function title(
  number: string,
  fullName: string,
  rarity: string | null = null,
  set = "s5",
): NarutoTitleRow {
  return { printKey: `naruto:${set}-${number}`, lang: "fr", fullName, rarity };
}

const official: OfficialNames = new Map([
  ["ta226", { name: "Pouvoir de la marque maléfique", rarity: "commune" }],
  ["te212", { name: "Fûton, technique suprême de la boule de feu" }],
  ["ni150", { name: "Sakon" }],
]);

describe("applyOfficialNames", () => {
  it("replaces a community name truncated at ~24 chars", () => {
    const prints = [print("ta226")];
    const { titles, replaced } = applyOfficialNames(
      prints,
      [title("ta226", "Pouvoir de la marque mal...")],
      official,
    );
    expect(replaced).toBe(1);
    expect(titles[0]!.fullName).toBe("Pouvoir de la marque maléfique");
  });

  it("wins over a community misreading", () => {
    // Manga-News reads "kâton"; the card and the site list say "Fûton".
    const { titles } = applyOfficialNames(
      [print("te212")],
      [title("te212", "kâton, technique suprême...")],
      official,
    );
    expect(titles[0]!.fullName).toBe(
      "Fûton, technique suprême de la boule de feu",
    );
  });

  it("keeps the printed-checklist erratum resolution", () => {
    // The printed checklist says "Temari" at NI-150; the card reads SAKON.
    const { titles } = applyOfficialNames(
      [print("ni150", "s3")],
      [title("ni150", "Sakon", null, "s3")],
      official,
    );
    expect(titles[0]!.fullName).toBe("Sakon");
  });

  it("adds a title when the community cache had none", () => {
    const { titles, added } = applyOfficialNames(
      [print("ni150")],
      [],
      official,
    );
    expect(added).toBe(1);
    expect(titles[0]).toMatchObject({ fullName: "Sakon", lang: "fr" });
  });

  it("leaves community-only cards alone — nothing official names Série 06", () => {
    const kept = title("te267", "Bruine de sable", "commune", "s6");
    const { titles, replaced, added } = applyOfficialNames(
      [print("te267", "s6")],
      [kept],
      official,
    );
    expect(replaced).toBe(0);
    expect(added).toBe(0);
    expect(titles).toEqual([kept]);
  });

  it("fills a missing rarity without overwriting one", () => {
    const { titles } = applyOfficialNames(
      [print("ta226")],
      [title("ta226", "Pouvoir de la marque mal...", null)],
      official,
    );
    expect(titles[0]!.rarity).toBe("commune");

    const kept = applyOfficialNames(
      [print("ta226")],
      [title("ta226", "Pouvoir de la marque mal...", "holo")],
      official,
    );
    expect(kept.titles[0]!.rarity).toBe("holo");
  });

  it("strips the promo grouping suffix off the collector number", () => {
    expect(collectorNumberOf(print("te030-cdf", "promo"))).toBe("te030");
    expect(collectorNumberOf(print("ni232"))).toBe("ni232");
  });

  it("official S5 names are not site-liste HTML bleeds (NI-X glued into name)", () => {
    const names = loadOfficialNames();
    const bleed = /(?:Ninja|Technique|Tactique|Client)\s+(?:Holo\s+)?(?:rare\s+)?(?:NI|TE|TA|CL)-\d+/i;
    for (const [id, card] of names) {
      expect(card.name, id).not.toMatch(bleed);
      expect(card.name, id).not.toMatch(/\bNI-\d+/i);
    }
    expect(names.get("ni254")?.name).toBe("Kimimaro");
    expect(names.get("ni248")?.name).toBe("Idate Morino");
  });
});

/*
  Le nom officiel se cherche par numéro, suffixe retiré — juste pour un
  `-promo`, qui est un retirage de la même carte. Faux pour `-ps` : le bonus de
  précommande du jeu PS1 porte les numéros 忍-1/2/3/11 avec une illustration
  **inédite**, et n'est jamais sorti hors du Japon. Il recevait le nom français
  de la carte qu'il n'est pas.
*/
describe("un suffixe qui désigne une autre carte n'emprunte rien", () => {
  const print = (number: string) =>
    ({ printKey: `naruto:x-${number}`, number }) as never;

  /** Le registre des noms est indexé en trois chiffres : `ni023`, pas `ni0023`. */
  it("keeps looking up the base card for a reprint", () => {
    expect(collectorNumberOf(print("ni0023-promo"))).toBe("ni023");
    expect(collectorNumberOf(print("te0030-cdf"))).toBe("te030");
    expect(collectorNumberOf(print("ni0046"))).toBe("ni046");
  });

  it("refuses to for the PS1 bonus, whose art is its own", () => {
    for (const n of ["ni0001-ps", "ni0002-ps", "ni0003-ps", "ni0011-ps"]) {
      expect(collectorNumberOf(print(n)), n).toBeNull();
    }
  });
});
