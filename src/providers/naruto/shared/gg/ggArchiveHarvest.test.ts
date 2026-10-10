import { describe, expect, it } from "vitest";

import { parseGgPricesHtml } from "./ggArchiveHarvest";

describe("parseGgPricesHtml", () => {
  it("reads kayou-style Card / Number / Lowest price rows", () => {
    const html = `
      <tbody>
        <tr>
          <td><a href="/archive/kayou/cards/nrz08-sr-003-nawaki">
            <img src="/images/kayou/NRZ08-SR-003-ccg.webp" alt=""/>
            <span>Nawaki</span></a></td>
          <td>NRZ08-SR-003</td>
          <td>$0.70</td>
          <td><a href="/archive/kayou/cards/nrz08-sr-003-nawaki/prices">Details</a></td>
        </tr>
        <tr>
          <td><a href="/archive/kayou/cards/nrz08-r-028-a-cry">
            <img src="/images/kayou/very-long-image-path-that-exceeds-two-hundred-characters-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.webp"/>
            <span>A Cry</span></a></td>
          <td>NRZ08-R-028</td>
          <td>$1.20</td>
          <td><a href="/archive/kayou/cards/nrz08-r-028-a-cry/prices">Details</a></td>
        </tr>
      </tbody>`;
    const rows = parseGgPricesHtml(html);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      name: "Nawaki",
      price: "$0.70",
      href: "/archive/kayou/cards/nrz08-sr-003-nawaki",
      number: "NRZ08-SR-003",
    });
    expect(rows[1]?.price).toBe("$1.20");
  });

  it("reads classic-ccg set/slug rows (no /cards/ segment)", () => {
    const html = `
      <tr>
        <td><a href="/archive/classic-ccg/the-path-to-hokage/j023-shadow-possession-jutsu">
          <img src="/images/classic/j023.jpg" alt=""/>
          <span>Shadow Possession Jutsu</span></a></td>
        <td>j023</td>
        <td>$0.70</td>
        <td><a href="/archive/classic-ccg/the-path-to-hokage/j023-shadow-possession-jutsu/prices">Details</a></td>
      </tr>`;
    const rows = parseGgPricesHtml(html);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      name: "Shadow Possession Jutsu",
      price: "$0.70",
      href: "/archive/classic-ccg/the-path-to-hokage/j023-shadow-possession-jutsu",
      number: "j023",
    });
  });

  it("ignores the Details /prices link as the card href", () => {
    const html = `
      <tr>
        <td><a href="/archive/classic/cards/n001-naruto/prices">x</a></td>
        <td>$9.99</td>
      </tr>`;
    expect(parseGgPricesHtml(html)).toEqual([]);
  });
});
