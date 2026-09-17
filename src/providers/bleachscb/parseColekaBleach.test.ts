import { describe, expect, it } from "vitest";

import {
  colekaBleachFaceUrl,
  colekaBleachS1ListingPageUrls,
  parseColekaBleachListing,
} from "./parseColekaBleach";

const SAMPLE = `
<ul>
<li class="pending col-md-4 col-xs-6 col-lg-3">
  <a class="lib_has_2_lines" data-id="1594698" href="/fr/cartes-de-collection/cartes-anime-manga/bleach-serie-1/ichigo-kurosaki_i1594698">
    <img src="https://thumbs.coleka.com/media/item/202402/06/bleach-serie-1-ichigo-kurosaki-a-001_250x250.webp" alt="Ichigo Kurosaki" />
    <span class="lib"><h3 class="product-title">Ichigo Kurosaki</h3>
    <span><span class="ref">Ref. A 001</span></span></span>
  </a>
</li>
<li class="pending col-md-4">
  <a href="/fr/.../entaille-frontale_i1594731">
    <img src="https://thumbs.coleka.com/media/item/202402/06/bleach-serie-1-entaille-frontale-c-001_250x250.webp" />
    <h3 class="product-title">Entaille frontale</h3>
    <span class="ref">Ref. C 001</span>
  </a>
</li>
<li class="pending col-md-4">
  <a href="/fr/.../zanpakuto_i1594768">
    <img src="https://thumbs.coleka.com/media/item/202402/06/bleach-serie-1-zanpakuto-z-001_250x250.webp" />
    <h3 class="product-title">Zanpakuto</h3>
    <span class="ref">Ref. Z 001</span>
  </a>
</li>
<li class="pending col-md-4">
  <a href="/fr/.../album_i1">
    <img src="https://thumbs.coleka.com/media/item/202402/06/album_250x250.webp" />
    <h3 class="product-title">Album Bleach</h3>
  </a>
</li>
</ul>
`;

describe("parseColekaBleachListing", () => {
  it("maps Ref. A/C/Z to FR printKeys (not JP Ability)", () => {
    const { cards, rejected } = parseColekaBleachListing(SAMPLE);
    expect(cards).toHaveLength(3);
    expect(cards.find((c) => c.printed === "A001")).toMatchObject({
      set: "a",
      number: "001",
      nameFr: "Ichigo Kurosaki",
      colekaId: "1594698",
      faceUrl:
        "https://thumbs.coleka.com/media/item/202402/06/bleach-serie-1-ichigo-kurosaki-a-001.webp",
    });
    expect(cards.find((c) => c.printed === "C001")).toMatchObject({
      set: "c",
      number: "001",
      nameFr: "Entaille frontale",
    });
    expect(cards.find((c) => c.printed === "Z001")?.set).toBe("z");
    expect(rejected.some((r) => /non-card|no-ref/.test(r.reason))).toBe(true);
  });

  it("strips Coleka size suffix for full face URL", () => {
    expect(
      colekaBleachFaceUrl(
        "https://thumbs.coleka.com/media/item/x/a-001_250x250.webp",
      ),
    ).toBe("https://thumbs.coleka.com/media/item/x/a-001.webp");
  });

  it("paginates 71 cards at 48/page", () => {
    const urls = colekaBleachS1ListingPageUrls();
    expect(urls).toHaveLength(2);
    expect(urls[0]).toContain("bleach-serie-1_r37171");
    expect(urls[1]).toMatch(/\?p=1$/);
  });
});
