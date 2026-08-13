import { describe, expect, it } from "vitest";

import type { NarutoPrintRow, NarutoTitleRow } from "./indexStore";
import {
  applyOfficialNames,
  collectorNumberOf,
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
});
