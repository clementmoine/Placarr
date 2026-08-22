import { describe, expect, it } from "vitest";

import {
  colekaUsPromoCanonicalRef,
  colekaUsPromoListingPageUrls,
  colekaUsPromoRefToCollector,
  parseColekaUsPromoListing,
} from "./parseColekaUsPromos";
import colekaUsPromos from "./curated/sources/coleka-us-promos.json";

const LISTING = `
<ul class="row img-list">
  <li class="pending col-md-4">
    <a class="lib_has_2_lines" data-id="1624573" href="/fr/cartes-de-collection/cartes-anime-manga/naruto-cartes-a-jouer-et-a-collectionner/carte-naruto-us-promotionnelles/naruto-uzumaki_i1624573">
      <img src="https://thumbs.coleka.com/media/item/202403/24/carte-naruto-us-promotionnelles-naruto-uzumaki-pr-001_250x250.webp" alt="Naruto Uzumaki" />
      <h3 class="product-title">Naruto Uzumaki</h3>
      <span class="ref">Ref. Pr 001</span>
    </a>
  </li>
  <li class="pending col-md-4">
    <a class="lib_has_2_lines" data-id="1624777" href="/fr/cartes-de-collection/cartes-anime-manga/naruto-cartes-a-jouer-et-a-collectionner/carte-naruto-us-promotionnelles/naruto-uzumaki_i1624777">
      <img src="https://thumbs.coleka.com/media/item/202403/25/carte-naruto-us-promotionnelles-naruto-uzumaki-pr-005r_250x250.webp" alt="Naruto Uzumaki" />
      <h3 class="product-title">Naruto Uzumaki</h3>
      <span class="ref">Ref. Pr 005R</span>
    </a>
  </li>
  <li class="pending col-md-4">
    <a class="lib_has_2_lines" data-id="1624567" href="/fr/cartes-de-collection/cartes-anime-manga/naruto-cartes-a-jouer-et-a-collectionner/carte-naruto-us-promotionnelles/the-4-th-hokage_i1624567">
      <img src="https://thumbs.coleka.com/media/item/202403/24/carte-naruto-us-promotionnelles-the-4-th-hokage-pr-096_250x250.webp" alt="The 4 th Hokage" />
      <h3 class="product-title">The 4 th Hokage</h3>
      <span class="ref">Ref. Pr 096</span>
    </a>
  </li>
  <li class="pending col-md-4">
    <a class="lib_has_2_lines" data-id="819630" href="/fr/cartes-de-collection/cartes-anime-manga/naruto-cartes-a-jouer-et-a-collectionner/cartes-naruto-serie-28/kisame-hoshigaki_i819630">
      <img src="https://thumbs.coleka.com/media/item/202102/10/cartes-naruto-serie-28-kisame-hoshigaki-ni-1650_250x250.webp" alt="Kisame Hoshigaki" />
      <h3 class="product-title">Kisame Hoshigaki</h3>
      <span class="ref">Ref. NI-1650</span>
    </a>
  </li>
</ul>
`;

describe("colekaUsPromoRefToCollector", () => {
  it("maps Coleka Pr refs onto EN CCG promo ids, including foil R reprints", () => {
    expect(colekaUsPromoRefToCollector("Pr 001")).toBe("pr0001");
    expect(colekaUsPromoRefToCollector("PR-096")).toBe("pr0096");
    expect(colekaUsPromoRefToCollector("Pr 005R")).toBe("pr0005-R");
    expect(colekaUsPromoRefToCollector("PR-005R")).toBe("pr0005-R");
    expect(colekaUsPromoRefToCollector("NI-1650")).toBeNull();
    expect(colekaUsPromoRefToCollector("PR-US010")).toBeNull();
    expect(colekaUsPromoCanonicalRef("Pr 005R")).toBe("PR-005R");
    expect(colekaUsPromoCanonicalRef("Pr 1")).toBe("PR-001");
  });
});

describe("parseColekaUsPromoListing", () => {
  it("reads unique US promo singles and ignores Carddass / Storm 3 leaks", () => {
    const cards = parseColekaUsPromoListing(LISTING);
    expect(cards.map((c) => c.number)).toEqual([
      "pr0001",
      "pr0005-R",
      "pr0096",
    ]);
    expect(cards.find((c) => c.number === "pr0096")).toMatchObject({
      cardType: "pr",
      colekaRef: "PR-096",
      name: "The 4 th Hokage",
      colekaId: "1624567",
      faceUrl:
        "https://thumbs.coleka.com/media/item/202403/24/carte-naruto-us-promotionnelles-the-4-th-hokage-pr-096.webp",
    });
    expect(cards.find((c) => c.number === "pr0005-R")).toMatchObject({
      colekaRef: "PR-005R",
      name: "Naruto Uzumaki",
    });
  });
});

describe("colekaUsPromoListingPageUrls", () => {
  it("stays on _r38199 and does not open the parent umbrella", () => {
    const urls = colekaUsPromoListingPageUrls();
    expect(urls[0]).toContain("carte-naruto-us-promotionnelles_r38199");
    expect(urls[0]).toContain(colekaUsPromos.listing.path);
    expect(urls.join("")).not.toContain("_r4102");
    expect(urls).toHaveLength(3);
    expect(colekaUsPromos.listing.scrape).toBe(true);
    expect(colekaUsPromos.umbrella.scrape).toBe(false);
  });
});
