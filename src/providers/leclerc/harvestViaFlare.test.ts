import { describe, expect, it } from "vitest";

import {
  parseColekaListingHtml,
  parseTcdbChecklistHtml,
} from "./harvestViaFlare";

describe("leclerc harvestViaFlare parsers", () => {
  it("parses TCDB checklist rows with rarities", () => {
    const html = `
      <tr>
        <a href="/ViewCard.cfm/sid/454491/cid/1/2022-E-Leclerc-Marvel-Pars-en-Mission-42-Spider-Man">x</a>
        <a href="/Person.cfm/pid/1/Spider-Man">Spider-Man</a> FOIL
      </tr>
      <tr>
        <a href="/ViewCard.cfm/sid/454491/cid/2/2022-E-Leclerc-Marvel-Pars-en-Mission-101-Groot">x</a>
        <a href="/Person.cfm/pid/2/Groot">Groot</a> GOLD
      </tr>
      <tr>
        <a href="/ViewCard.cfm/sid/454491/cid/3/2022-E-Leclerc-Marvel-Pars-en-Mission-1-Thor">x</a>
        <a href="/Person.cfm/pid/3/Thor">Thor</a>
      </tr>
    `;
    const cards = parseTcdbChecklistHtml(html);
    expect(cards.find((c) => c.number === "042")).toEqual({
      number: "042",
      name: "Spider Man",
      rarity: "holographique",
    });
    expect(cards.find((c) => c.number === "101")?.rarity).toBe("gold");
    expect(cards.find((c) => c.number === "001")?.rarity).toBeUndefined();
  });

  it("parses Coleka product titles with Ref", () => {
    const html = `
      <h3 class="product-title">Mickey</h3>
      <span><span class="ref">Ref. 7</span></span>
      <h3 class="product-title">Fixeez Mickey</h3>
      <span><span class="ref">Ref. 201</span></span>
    `;
    const cards = parseColekaListingHtml(html);
    expect(cards).toEqual([{ number: "007", name: "Mickey" }]);
  });
});
