import { describe, expect, it } from "vitest";

import { catalogueCollectorKey } from "@/lib/admin/catalogueCards";

import {
  COLEKA_SAGES_LEGACY_SET_COVER_URL,
  COLEKA_STORM3_SET_COVER_URL,
  colekaEuPrefixToCollector,
  colekaRampagePrefixToCollector,
  colekaFullFaceUrl,
  colekaHtmlIsVerifyWall,
  colekaSagesLegacyListingPageUrls,
  colekaStorm3ListingPageUrls,
  parseColekaStorm3Listing,
  parseColekaRampageTornadoListing,
} from "./parseColekaStorm3";
import colekaS24 from "../curated/sources/coleka-s24.json";
import colekaS28 from "../curated/sources/coleka-s28.json";

const LISTING = `
<ul class="row img-list">
  <li class="pending col-md-4">
    <a class="lib_has_2_lines" data-id="819666" href="/fr/cartes-de-collection/cartes-anime-manga/naruto-cartes-a-jouer-et-a-collectionner/cartes-naruto-serie-28/golem_i819666">
      <img src="https://thumbs.coleka.com/media/item/202012/16/cartes-naruto-serie-28-golem-ju-1002_250x250.webp" alt="Golem" />
      <h3 class="product-title">Golem</h3>
      <span class="ref">Ref. JU-1002</span>
    </a>
  </li>
  <li class="pending col-md-4">
    <a class="lib_has_2_lines" data-id="819630" href="/fr/cartes-de-collection/cartes-anime-manga/naruto-cartes-a-jouer-et-a-collectionner/cartes-naruto-serie-28/kisame-hoshigaki_i819630">
      <img src="https://thumbs.coleka.com/media/item/202102/10/cartes-naruto-serie-28-kisame-hoshigaki-ni-1650_250x250.webp" alt="Kisame Hoshigaki" />
      <h3 class="product-title">Kisame Hoshigaki</h3>
      <span class="ref">Ref. NI-1650</span>
    </a>
  </li>
  <li class="pending col-md-4">
    <a class="lib_has_2_lines" data-id="819698" href="/fr/cartes-de-collection/cartes-anime-manga/naruto-cartes-a-jouer-et-a-collectionner/cartes-naruto-serie-28/armee-de-zetsu_i819698">
      <img src="https://thumbs.coleka.com/media/item/202102/07/cartes-naruto-serie-28-armee-de-zetsu-mi-976_250x250.webp" alt="Armée de Zetsu" />
      <h3 class="product-title">Armée de Zetsu</h3>
      <span class="ref">Ref. MI-976</span>
    </a>
  </li>
  <li class="pending col-md-4">
    <a class="lib_has_2_lines" data-id="819666" href="/fr/cartes-de-collection/cartes-anime-manga/naruto-cartes-a-jouer-et-a-collectionner/cartes-naruto-serie-28/golem_i819666">
      <img src="https://thumbs.coleka.com/media/item/202012/16/cartes-naruto-serie-28-golem-ju-1002_250x250.webp" alt="Golem" />
      <h3 class="product-title">Golem</h3>
      <span class="ref">Ref. JU-1002</span>
    </a>
  </li>
  <li class="pending col-md-4">
    <a class="lib_has_2_lines" data-id="788802" href="/fr/cartes-de-collection/cartes-anime-manga/naruto-cartes-a-jouer-et-a-collectionner/cartes-naruto-serie-24-sage-s-legacy/scellage-des-demons-a-queues_i788802">
      <img src="https://thumbs.coleka.com/media/item/202010/16/cartes-naruto-serie-24-sage-s-legacy-scellage-des-demons-a-queues_250x250.webp" alt="Scellage des Démons à Queues" />
      <h3 class="product-title">Scellage des Démons à Queues</h3>
      <span class="ref">Ref. JU-895</span>
    </a>
  </li>
  <li class="pending col-md-4">
    <a class="lib_has_2_lines" data-id="203137" href="/fr/cartes-naruto-serie-03/invocation_i203137">
      <img src="https://thumbs.coleka.com/media/item/202012/09/cartes-naruto-serie-03-invocation-te-109.jpg" alt="Invocation" />
      <h3 class="product-title">Invocation</h3>
      <span class="ref">Ref. TE-109</span>
    </a>
  </li>
</ul>
`;

describe("colekaEuPrefixToCollector", () => {
  it("maps EU Storm 3 prefixes onto EN CCG ids, never Carddass ni/te/ta", () => {
    expect(colekaEuPrefixToCollector("NI-1650")).toBe("n1650");
    expect(colekaEuPrefixToCollector("JU-1002")).toBe("j1002");
    expect(colekaEuPrefixToCollector("MI-976")).toBe("m976");
    expect(colekaEuPrefixToCollector("NI-1358")).toBe("n1358");
    expect(colekaEuPrefixToCollector("JU-895")).toBe("j895");
    expect(colekaEuPrefixToCollector("MI-855")).toBe("m855");
    expect(colekaEuPrefixToCollector("NI-1621")).toBe("n1621");
    expect(colekaEuPrefixToCollector("TE-109")).toBeNull();
    expect(colekaEuPrefixToCollector("n1650")).toBeNull();
    expect(colekaEuPrefixToCollector("SALE-DE001")).toBeNull();
    expect(colekaEuPrefixToCollector("STO3-DE001")).toBeNull();
  });

  it("keeps Storm 3 Kisame on the EN disk id, same collector family as NI", () => {
    const id = colekaEuPrefixToCollector("NI-1650")!;
    expect(id).toBe("n1650");
    expect(catalogueCollectorKey(id)).toBe("n:1650");
    expect(catalogueCollectorKey("ni1650")).toBe("ni:1650");
  });
});

describe("colekaFullFaceUrl", () => {
  it("drops the listing crop suffix and leaves a full face alone", () => {
    expect(
      colekaFullFaceUrl(
        "https://thumbs.coleka.com/media/item/202102/10/cartes-naruto-serie-28-kisame-hoshigaki-ni-1650_250x250.webp",
      ),
    ).toBe(
      "https://thumbs.coleka.com/media/item/202102/10/cartes-naruto-serie-28-kisame-hoshigaki-ni-1650.webp",
    );
    expect(
      colekaFullFaceUrl(
        "https://thumbs.coleka.com/media/item/202012/16/cartes-naruto-serie-28-golem-ju-1002.webp",
      ),
    ).toBe(
      "https://thumbs.coleka.com/media/item/202012/16/cartes-naruto-serie-28-golem-ju-1002.webp",
    );
  });
});

describe("parseColekaStorm3Listing", () => {
  it("reads unique Série 28 singles, Série 24 three-digit refs, and ignores Carddass TE", () => {
    const cards = parseColekaStorm3Listing(LISTING);
    expect(cards.map((c) => c.number)).toEqual([
      "j1002",
      "j895",
      "m976",
      "n1650",
    ]);
    expect(cards.find((c) => c.number === "n1650")).toMatchObject({
      cardType: "n",
      colekaRef: "NI-1650",
      name: "Kisame Hoshigaki",
      colekaId: "819630",
      faceUrl:
        "https://thumbs.coleka.com/media/item/202102/10/cartes-naruto-serie-28-kisame-hoshigaki-ni-1650.webp",
    });
    expect(cards.find((c) => c.number === "j895")).toMatchObject({
      cardType: "j",
      colekaRef: "JU-895",
      name: "Scellage des Démons à Queues",
      colekaId: "788802",
      faceUrl:
        "https://thumbs.coleka.com/media/item/202010/16/cartes-naruto-serie-24-sage-s-legacy-scellage-des-demons-a-queues.webp",
    });
  });
});

describe("colekaHtmlIsVerifyWall", () => {
  it("detects the Cloudflare interstitial so the scrape can stop honestly", () => {
    expect(colekaHtmlIsVerifyWall("<title>Vérification - COLEKA</title>")).toBe(
      true,
    );
    expect(colekaHtmlIsVerifyWall("<title>Verifica - COLEKA</title>")).toBe(
      true,
    );
    expect(
      colekaHtmlIsVerifyWall(
        '<script src="https://challenges.cloudflare.com/turnstile/v0/api.js"></script>',
      ),
    ).toBe(true);
    expect(colekaHtmlIsVerifyWall(LISTING)).toBe(false);
  });
});

describe("colekaStorm3ListingPageUrls", () => {
  it("stays on _r16649 and does not open the parent umbrella", () => {
    const urls = colekaStorm3ListingPageUrls();
    expect(urls[0]).toContain("cartes-naruto-serie-28_r16649");
    expect(urls[0]).toContain(colekaS28.listing.path);
    expect(urls.join("")).not.toContain("_r4102");
    expect(urls).toHaveLength(3);
  });
});

describe("colekaSagesLegacyListingPageUrls", () => {
  it("stays on _r15466 and does not open the parent umbrella", () => {
    const urls = colekaSagesLegacyListingPageUrls();
    expect(urls[0]).toContain("cartes-naruto-serie-24-sage-s-legacy_r15466");
    expect(urls[0]).toContain(colekaS24.listing.path);
    expect(urls.join("")).not.toContain("_r4102");
    expect(urls).toHaveLength(3);
  });
});

describe("COLEKA_STORM3_SET_COVER_URL", () => {
  it("is the Series 28 display packshot, not the umbrella listing", () => {
    expect(COLEKA_STORM3_SET_COVER_URL).toBe(colekaS28.displayPackshot.url);
    expect(COLEKA_STORM3_SET_COVER_URL).not.toContain("_r4102");
  });
});

describe("COLEKA_SAGES_LEGACY_SET_COVER_URL", () => {
  it("is the Series 24 display packshot already used as display-s24", () => {
    expect(COLEKA_SAGES_LEGACY_SET_COVER_URL).toBe(
      colekaS24.displayPackshot.url,
    );
    expect(colekaS24.displayPackshot.sku).toBe("display-s24");
    expect(COLEKA_SAGES_LEGACY_SET_COVER_URL).not.toContain("_r4102");
  });
});

describe("colekaRampagePrefixToCollector", () => {
  it("maps Coleka deck refs onto EN CCG disk ids (CL→C, MI-US→MUS)", () => {
    expect(colekaRampagePrefixToCollector("CL-045")).toBe("c0045");
    expect(colekaRampagePrefixToCollector("MI-US086")).toBe("mus0086");
    expect(colekaRampagePrefixToCollector("NI-393")).toBe("n0393");
    expect(colekaEuPrefixToCollector("CL-045")).toBeNull();
  });
});

describe("parseColekaRampageTornadoListing", () => {
  it("keeps all 33 deck singles including CL and MI-US", () => {
    const html = `
<ul class="row img-list">
  <li><a class="lib_has_2_lines" data-id="827758" href="/fr/deck/michiru-tsuki_i827758">
    <img src="https://thumbs.coleka.com/media/item/202012/21/x-michiru-tsuki_250x250.webp" />
    <h3 class="product-title">Michiru Tsuki</h3>
    <span class="ref">Ref. CL-045</span>
  </a></li>
  <li><a class="lib_has_2_lines" data-id="827784" href="/fr/deck/comme-un-nuage_i827784">
    <img src="https://thumbs.coleka.com/media/item/202012/21/x-nuage_250x250.webp" />
    <h3 class="product-title">Comme un Nuage qui Défile</h3>
    <span class="ref">Ref. MI-US086</span>
  </a></li>
  <li><a class="lib_has_2_lines" data-id="827768" href="/fr/deck/naruto_i827768">
    <img src="https://thumbs.coleka.com/media/item/202012/21/x-naruto_250x250.webp" />
    <h3 class="product-title">Naruto Uzumaki</h3>
    <span class="ref">Ref. NI-393</span>
  </a></li>
</ul>`;
    const cards = parseColekaRampageTornadoListing(html);
    expect(cards.map((c) => c.number).sort()).toEqual([
      "c0045",
      "mus0086",
      "n0393",
    ]);
    expect(cards.find((c) => c.number === "c0045")?.name).toBe("Michiru Tsuki");
    expect(cards.find((c) => c.number === "mus0086")?.faceUrl).not.toContain(
      "_250x250",
    );
  });
});
