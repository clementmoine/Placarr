import { describe, expect, it } from "vitest";

import coleka from "./curated/sources/coleka.json";
import {
  COLEKA_CARDDASS_FR_SERIES,
  colekaCarddassFrListingPageUrls,
  colekaCarddassFrParentUrl,
  parseColekaCarddassFrListing,
} from "./parseColekaCarddassFr";

const LISTING = `
<ul class="row img-list">
  <li>
    <a class="lib_has_2_lines" data-id="202413" href="/fr/cartes-naruto-serie-01/inari_i202413">
      <img src="https://thumbs.coleka.com/media/item/201802/21/cartes-naruto-serie-01-inari-cl-01_250x250.webp" alt="Inari" />
      <h3 class="product-title">Inari</h3>
      <span class="ref">Ref. CL-01</span>
    </a>
  </li>
  <li>
    <a class="lib_has_2_lines" data-id="202417" href="/fr/cartes-naruto-serie-01/naruto-uzumaki_i202417">
      <img src="https://thumbs.coleka.com/media/item/201808/27/cartes-naruto-serie-01-naruto-uzumaki-ni-01_250x250.webp" alt="Naruto" />
      <h3 class="product-title">Naruto Uzumaki</h3>
      <span class="ref">Ref. NI-01</span>
      <span class="an">(2002)</span>
    </a>
  </li>
  <li>
    <a class="lib_has_2_lines" data-id="202418" href="/fr/cartes-naruto-serie-01/sakuke-uchiwa_i202418">
      <img src="https://thumbs.coleka.com/media/item/201808/27/cartes-naruto-serie-01-sakuke-uchiwa-ni-02_250x250.webp" alt="Sakuke" />
      <h3 class="product-title">Sakuke Uchiwa</h3>
      <span class="ref">Ref. NI-02</span>
    </a>
  </li>
  <li>
    <a class="lib_has_2_lines" data-id="1" href="/fr/cartes-naruto-serie-01/carte-cl-99_i1">
      <img src="https://thumbs.coleka.com/css/assets/default/no-image_250x250.webp" alt="Carte CL-99" />
      <h3 class="product-title">Carte CL-99</h3>
      <span class="ref">Ref. CL-99</span>
    </a>
  </li>
  <li>
    <a class="lib_has_2_lines" data-id="819630" href="/fr/cartes-naruto-serie-28/kisame_i819630">
      <img src="https://thumbs.coleka.com/media/item/x_250x250.webp" alt="Kisame" />
      <h3 class="product-title">Kisame Hoshigaki</h3>
      <span class="ref">Ref. NI-1650</span>
    </a>
  </li>
</ul>
`;

describe("Coleka Carddass FR series leaves", () => {
  it("walks S1–S5 rubriques, never the umbrella or S6 IT", () => {
    const ids = COLEKA_CARDDASS_FR_SERIES.map((row) => row.rubrique).join(" ");
    expect(ids).toBe("_r4108 _r4109 _r4110 _r4111 _r4112");
    expect(colekaCarddassFrParentUrl()).toContain("_r41705");
    expect(coleka.seriesFrancaises.scrape).toBe(false);
    const urls = COLEKA_CARDDASS_FR_SERIES.map((row) => row.path).join("\n");
    expect(urls).not.toContain("_r4102");
    expect(urls).not.toContain("_r41388");
    expect(urls).not.toContain("_r41705");
    expect(
      COLEKA_CARDDASS_FR_SERIES.reduce((n, row) => n + row.listedCount, 0),
    ).toBe(741);
  });

  it("paginates 48-per-page with ?p=1 as page 2", () => {
    const s1 = COLEKA_CARDDASS_FR_SERIES[0]!;
    const urls = colekaCarddassFrListingPageUrls(s1.path, s1.listedCount);
    expect(urls).toHaveLength(4);
    expect(urls[0]).toContain("_r4108");
    expect(urls[0]).not.toContain("?p=");
    expect(urls[1]).toContain("?p=1");
    expect(urls[3]).toContain("?p=3");
  });
});

describe("parseColekaCarddassFrListing", () => {
  it("keeps CACG ids, drops EN CCG, and skips Coleka placeholders as names", () => {
    const cards = parseColekaCarddassFrListing(LISTING, "s1");
    expect(cards.map((c) => c.number)).toEqual([
      "cl001",
      "cl099",
      "ni001",
      "ni002",
    ]);
    expect(cards.find((c) => c.number === "ni001")?.faceUrl).toContain(
      "naruto-uzumaki-ni-01.webp",
    );
    expect(cards.find((c) => c.number === "ni001")?.faceUrl).not.toContain(
      "250x250",
    );
    expect(cards.find((c) => c.number === "cl099")?.name).toBeNull();
    expect(cards.find((c) => c.number === "cl099")?.faceUrl).toBeNull();
    expect(cards.find((c) => c.number === "ni002")?.name).toBe("Sakuke Uchiwa");
    expect(cards.some((c) => c.number === "n1650")).toBe(false);
  });
});
