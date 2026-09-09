import { describe, expect, it } from "vitest";

import {
  bandaicgEnCardlistCards,
  mergeBandaicgEnNamesIntoIndex,
  parseBandaicgCardlistHtml,
} from "./parseBandaicgCardlist";

const FIXTURE = `
<div class="card_row">
  <div class="card_col1" title="Card Number">N-044</div>
  <div class="card_link"><a href="cardlists_detail.php?s=2&c=n044" class="card_link">The Third Hokage</a></div>
  <div class="card_col2" title="Card Type">Ninja</div>
  <div class="card_col3" title="Rarity">SR</div>
</div>
<div class="card_row"><div class="card_col1" title="Card Number">J-387</div><div class="card_link"><a href="cardlists_detail_new.php?s=12&amp;c=j387" class="card_link" id="j387_name">Sexy Jutsu</a></div><div class="card_col2" title="Card Type">Jutsu</div><div class="card_col3" title="Rarity">R</div></div>
<div class="card_row">
  <div class="card_col1" title="Card Number">N-US122</div>
  <div class="card_link">Tin exclusive</div>
</div>
<div class="card_row">
  <div class="card_col1" title="Card Number">N-186</div>
  <div class="card_link">Naruto Uzumaki & Iruka Umino</div>
  <div class="card_col3" title="Rarity">U</div>
</div>
`;

describe("parseBandaicgCardlistHtml", () => {
  it("reads official N/J titles and skips N-US exclusives", () => {
    expect(parseBandaicgCardlistHtml(FIXTURE, "s2")).toEqual([
      {
        number: "n044",
        cardType: "n",
        name: "The Third Hokage",
        setCode: "s2",
        printed: "N-044",
        rarity: "SR",
      },
      {
        number: "j387",
        cardType: "j",
        name: "Sexy Jutsu",
        setCode: "s2",
        printed: "J-387",
        rarity: "R",
      },
      {
        number: "n186",
        cardType: "n",
        name: "Naruto Uzumaki & Iruka Umino",
        setCode: "s2",
        printed: "N-186",
        rarity: "U",
      },
    ]);
  });
});

describe("bandaicgEnCardlistCards", () => {
  it("ships official s1–s15 titles, not shop copy", () => {
    const cards = bandaicgEnCardlistCards();
    expect(cards.length).toBeGreaterThan(1500);
    expect(cards.find((row) => row.number === "n001")).toMatchObject({
      name: "Naruto Uzumaki",
      setCode: "s1",
    });
    expect(cards.some((row) => row.setCode === "s15")).toBe(true);
    expect(cards.some((row) => row.setCode === "s16")).toBe(false);
    expect(cards.some((row) => row.number.startsWith("ni"))).toBe(false);
  });
});

describe("mergeBandaicgEnNamesIntoIndex", () => {
  it("mints N prints beside NI and does not overwrite an existing EN title", () => {
    const merged = mergeBandaicgEnNamesIntoIndex({
      prints: [
        {
          printKey: "naruto:ni-0001",
          setCode: "s1",
          number: "ni0001",
          cardType: "ni",
          family: "ninja",
        },
        {
          printKey: "naruto:n-0001",
          setCode: "s1",
          number: "n0001",
          cardType: "n",
          family: "ninja",
        },
      ],
      titles: [
        { printKey: "naruto:n-0001", lang: "en", fullName: "Naruto (BGG)" },
      ],
    });
    expect(
      merged.titles.find((t) => t.printKey === "naruto:n-0001")?.fullName,
    ).toBe("Naruto (BGG)");
    expect(merged.addedPrints).toContain("naruto:n-0044");
    expect(merged.prints.some((p) => p.printKey === "naruto:ni-0001")).toBe(
      true,
    );
  });
});
