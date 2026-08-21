import { describe, expect, it } from "vitest";

import { catalogueCollectorKey } from "@/lib/admin/catalogueCards";

import colekaS6It from "./curated/sources/coleka-s6-it.json";
import {
  colekaCarddassPrefixToCollector,
  colekaS6ItListingPageUrls,
  colekaS6ItNameIsPlaceholder,
  colekaS6ItPrintedRef,
  parseColekaS6ItListing,
} from "./parseColekaS6It";
import { colekaEuPrefixToCollector } from "./parseColekaStorm3";

const LISTING = `
<ul class="row img-list">
  <li>
    <a class="lib_has_2_lines" data-id="1761802" href="/fr/cartes-naruto-serie-06/carte-cl-32_i1761802">
      <img src="https://thumbs.coleka.com/css/assets/default/no-image_250x250.webp" alt="Carte CL-32" />
      <h3 class="product-title">Carte CL-32</h3>
      <span class="ref">Ref. CL-32</span>
    </a>
  </li>
  <li>
    <a class="lib_has_2_lines" data-id="1762493" href="/fr/cartes-naruto-serie-06/shikamaru-nara_i1762493">
      <img src="https://thumbs.coleka.com/media/item/202411/01/cartes-naruto-serie-06-shikamaru-nara_250x250.webp" alt="Shikamaru Nara" />
      <h3 class="product-title">Shikamaru Nara</h3>
      <span class="ref">Ref. NI-232</span>
    </a>
  </li>
  <li>
    <a class="lib_has_2_lines" data-id="1761843" href="/fr/cartes-naruto-serie-06/potere-del-segno-maledetto_i1761843">
      <img src="https://thumbs.coleka.com/media/item/202411/01/cartes-naruto-serie-06-poteren-del-segno-maledetto-ta-226_250x250.webp" alt="Potere del segno maledetto" />
      <h3 class="product-title">Potere del segno maledetto</h3>
      <span class="ref">Ref. TA-226</span>
    </a>
  </li>
  <li>
    <a class="lib_has_2_lines" data-id="1761843" href="/fr/cartes-naruto-serie-06/potere-del-segno-maledetto_i1761843">
      <img src="https://thumbs.coleka.com/media/item/202411/01/cartes-naruto-serie-06-poteren-del-segno-maledetto-ta-226_250x250.webp" alt="Potere del segno maledetto" />
      <h3 class="product-title">Potere del segno maledetto</h3>
      <span class="ref">Ref. ST-226</span>
    </a>
  </li>
  <li>
    <a class="lib_has_2_lines" data-id="819630" href="/fr/cartes-naruto-serie-28/kisame-hoshigaki_i819630">
      <img src="https://thumbs.coleka.com/media/item/202102/10/cartes-naruto-serie-28-kisame-hoshigaki-ni-1650_250x250.webp" alt="Kisame" />
      <h3 class="product-title">Kisame Hoshigaki</h3>
      <span class="ref">Ref. NI-1650</span>
    </a>
  </li>
</ul>
`;

describe("colekaCarddassPrefixToCollector", () => {
  it("keeps CACG ids and maps printed ST onto TA", () => {
    expect(colekaCarddassPrefixToCollector("TA-226")).toBe("ta226");
    expect(colekaCarddassPrefixToCollector("ST-226")).toBe("ta226");
    expect(colekaCarddassPrefixToCollector("CL-32")).toBe("cl032");
    expect(colekaCarddassPrefixToCollector("NI-232")).toBe("ni232");
    expect(colekaCarddassPrefixToCollector("NI-1650")).toBeNull();
    expect(colekaCarddassPrefixToCollector("JU-1002")).toBeNull();
    expect(colekaEuPrefixToCollector("NI-1650")).toBe("n1650");
  });

  it("does not collapse a mission onto a ninja", () => {
    expect(catalogueCollectorKey("ta226")).toBe("ta:0226");
    expect(catalogueCollectorKey("n1650")).toBe("n:1650");
  });
});

describe("colekaS6ItPrintedRef", () => {
  it("records the Italian tactique prefix without changing the disk id", () => {
    expect(colekaS6ItPrintedRef("TA-226")).toBe("ST-226");
    expect(colekaS6ItPrintedRef("NI-232")).toBe("NI-232");
  });
});

describe("colekaS6ItNameIsPlaceholder", () => {
  it("drops Coleka's untitled fallback", () => {
    expect(colekaS6ItNameIsPlaceholder("Carte CL-32")).toBe(true);
    expect(colekaS6ItNameIsPlaceholder("Potere del segno maledetto")).toBe(
      false,
    );
  });
});

describe("parseColekaS6ItListing", () => {
  it("reads unique CACG s6 singles, keeps nameless rows, ignores Storm 3", () => {
    const cards = parseColekaS6ItListing(LISTING);
    expect(cards.map((c) => c.number)).toEqual(["cl032", "ni232", "ta226"]);
    expect(cards.find((c) => c.number === "ta226")).toMatchObject({
      cardType: "ta",
      colekaRef: "TA-226",
      printedRef: "ST-226",
      name: "Potere del segno maledetto",
      faceUrl:
        "https://thumbs.coleka.com/media/item/202411/01/cartes-naruto-serie-06-poteren-del-segno-maledetto-ta-226.webp",
    });
    expect(cards.find((c) => c.number === "cl032")).toMatchObject({
      name: null,
      faceUrl: null,
    });
  });
});

describe("colekaS6ItListingPageUrls", () => {
  it("stays on _r41388 and does not open the umbrella or the FR branch", () => {
    const urls = colekaS6ItListingPageUrls();
    expect(urls[0]).toContain("cartes-naruto-serie-06_r41388");
    expect(urls[0]).toContain(colekaS6It.listing.path);
    expect(urls.join("")).not.toContain("_r4102");
    expect(urls.join("")).not.toContain("_r41705");
    expect(urls).toHaveLength(3);
  });
});
