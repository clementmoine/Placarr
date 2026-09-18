import { describe, expect, it } from "vitest";
import { catalogueCollectorKey } from "@/lib/admin/catalogueCards";
import colekaS24 from "../curated/sources/coleka-s24.json";
import colekaS28 from "../curated/sources/coleka-s28.json";
import colekaS6It from "../curated/sources/coleka-s6-it.json";
import colekaUsPromos from "../curated/sources/coleka-us-promos.json";
import coleka from "../curated/sources/coleka.json";
import { COLEKA_CARDDASS_FR_SERIES, colekaCarddassFrListingPageUrls, colekaCarddassFrParentUrl, parseColekaCarddassFrListing, colekaCarddassPrefixToCollector, colekaS6ItListingPageUrls, colekaS6ItNameIsPlaceholder, colekaS6ItPrintedRef, parseColekaS6ItListing, colekaEuPrefixToCollector, COLEKA_SAGES_LEGACY_SET_COVER_URL, COLEKA_STORM3_SET_COVER_URL, colekaRampagePrefixToCollector, colekaFullFaceUrl, colekaHtmlIsVerifyWall, colekaSagesLegacyListingPageUrls, colekaStorm3ListingPageUrls, parseColekaStorm3Listing, parseColekaRampageTornadoListing, colekaUsPromoCanonicalRef, colekaUsPromoListingPageUrls, colekaUsPromoRefToCollector, parseColekaUsPromoListing } from "./coleka";

// —— parseColekaCarddassFr ——
{
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
}

// —— parseColekaS6It ——
{
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
}

// —— parseColekaStorm3 ——
{
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
}

// —— parseColekaUsPromos ——
{
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
}

