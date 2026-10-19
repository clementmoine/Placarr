import { describe, expect, it } from "vitest";

import {
  inferLangFromPackshotUrl,
  inferOfficialSetId,
  inferPackshotKind,
  isNonCardOfficialAccessory,
  OFFICIAL_SITE_LOCALES,
  officialProductDisplayName,
  officialSiteContentHashFromPages,
  officialSiteLocaleToLang,
  parseOfficialProductContents,
  parseOfficialProductMenu,
  parseOfficialProductPage,
  type OfficialProductPage,
} from "./officialSite";
import { catalogArtefactIsFresh, emptyCatalogIngestLedger } from "@/providers/shared/catalogIngestLedger";

const MENU_HTML = `
<div class="links">
  <a href="/fr-FR/product/cosmic-quest" class="submenu-text-link"><h1>Aventure Cosmique</h1></a>
  <a href="/fr-FR/product/hyperia-city" class="submenu-text-link"><h1>Hyperia City</h1></a>
  <a href="/fr-FR/product/books" class="submenu-text-link"><h1>Livres Disney Lorcana</h1></a>
  <a href="/fr-FR/product/the-first-chapter" class="submenu-text-link"><h1>Premier Chapitre</h1></a>
</div>
`;

const PAGE_HTML = `
<html><head><meta property="og:title" content="Hyperia City | Disney Lorcana" /></head>
<body>
<img src="/_nuxt/logo-br.png" alt="Lorcana logo" />
<img src="https://ravensburger.cloud/cms/gallery/lorcana-web/products/s14-hyperia-city/en/whtzuxaqg5_en.png" alt="Disney Lorcana TCG Hyperia City logo" />
<img src="https://ravensburger.cloud/cms/gallery/lorcana-web/products/s14-hyperia-city/products/fr_trove.png" alt="Illumineer's Trove" />
<img src="https://ravensburger.cloud/cms/gallery/lorcana-web/products/s14-hyperia-city/products/booster-display/fr_box.png" alt="Booster Display" />
<img src="https://ravensburger.cloud/cms/gallery/lorcana-web/products/s14-hyperia-city/en/first-look/fr_lz5fcutdbh.png.png" alt="Disney Lorcana Miguel Rivera - Musicien de rue" />
<img src="https://ravensburger.cloud/cms/gallery/lorcana-web/products/s14-hyperia-city/d23-card-reveal/fr_jquxxkhs5s.png.png" alt="Pepita - Sweet Kitty" />
<img src="https://ravensburger.cloud/cms/gallery/lorcana-web/products/s14-hyperia-city/fr_rvzhusaqg5.png.png" alt="Aurora -Delightful Musician" />
<img src="https://ravensburger.cloud/cms/gallery/lorcana-web/products/s14-hyperia-city/fr_eh5zvbr4if.png.png" alt="Nick Wilde - Inquisitive Harbor master" />
<img src="https://ravensburger.cloud/cms/gallery/lorcana-web/products/s14-hyperia-city/cyjgbbabub_playmat_1920x1080-1.png" alt="Playmat Rapunzel" />
</body></html>
`;

describe("parseOfficialProductMenu", () => {
  it("lit le sous-menu et ignore books", () => {
    const menu = parseOfficialProductMenu(MENU_HTML);
    expect(menu.map((e) => e.slug)).toEqual([
      "cosmic-quest",
      "hyperia-city",
      "the-first-chapter",
    ]);
    expect(menu[0]?.title).toBe("Aventure Cosmique");
  });
});

describe("parseOfficialProductPage", () => {
  it("prend le wordmark (pas le chrome) et les packshots", () => {
    const page = parseOfficialProductPage(PAGE_HTML, "hyperia-city");
    expect(page.setId).toBe("set14");
    expect(page.logoUrl).toContain("whtzuxaqg5_en.png");
    expect(page.packshots.map((p) => p.kind).sort()).toEqual([
      "display",
      "trove",
    ]);
    expect(page.lang).toBe("fr");
  });

  it("extrait les spoilers first-look / D23 / reveal (pas les playmats)", () => {
    const page = parseOfficialProductPage(PAGE_HTML, "hyperia-city");
    expect(page.spoilers.map((s) => s.title).sort()).toEqual([
      "Aurora - Delightful Musician",
      "Miguel Rivera - Musicien de rue",
      "Nick Wilde - Inquisitive Harbor master",
      "Pepita - Sweet Kitty",
    ]);
    expect(page.spoilers.find((s) => s.kind === "first-look")?.title).toContain(
      "Miguel",
    );
    expect(page.spoilers.find((s) => s.kind === "d23")?.title).toContain(
      "Pepita",
    );
    expect(page.spoilers.some((s) => /playmat/i.test(s.title))).toBe(false);
  });

  it("accepte logo via chemin CDN même sans « logo » dans l'alt", () => {
    const ink = parseOfficialProductPage(
      `<img src="https://ravensburger.cloud/cms/gallery/lorcana-web/products/s15-into-the-inkdark/s15-logo/fr_jbs83nhsz6.png" alt="Disney Lorcana Into the Inkdark" />
<img src="https://ravensburger.cloud/cms/gallery/lorcana-web/products/fr/fr_products_header_now_1920.png" alt="Decorative header image showing three characters" />`,
      "into-the-inkdark",
    );
    expect(ink.logoUrl).toContain("s15-logo");
    expect(ink.setId).toBe("set15");

    const vine = parseOfficialProductPage(
      `<img src="https://ravensburger.cloud/cms/gallery/lorcana-web/products/s13-attack-of-the-vine/heroes-logos-and-backgrounds/dlc_s13_logo_fr.png" alt="Attack of the Vine Logo" />`,
      "attack-of-the-vine",
    );
    expect(vine.logoUrl).toContain("dlc_s13_logo_fr");

    const first = parseOfficialProductPage(
      `<img src="https://ravensburger.cloud/cms/gallery/lorcana-web/products/fr/fr_products_header_now_1920.png" alt="Decorative header image showing three characters and a logo that says Premier Chapitre" />`,
      "the-first-chapter",
    );
    expect(first.logoUrl).toBeNull();
  });
});

describe("inferOfficialSetId", () => {
  it("mappe slug et chemin CDN sN / iqN", () => {
    expect(inferOfficialSetId("winterspell", [])).toBe("set11");
    expect(
      inferOfficialSetId("x", [
        "https://ravensburger.cloud/cms/gallery/lorcana-web/products/s16-cosmic-quest/announce/fr_s16.png",
      ]),
    ).toBe("set16");
    expect(
      inferOfficialSetId("x", [
        "https://ravensburger.cloud/cms/gallery/lorcana-web/products/iq3-great-hunny-rescue/fr.png",
      ]),
    ).toBe("quest3");
  });
});

describe("inferPackshotKind", () => {
  it("classe trove / display / gift", () => {
    expect(inferPackshotKind("Illumineer's Trove", "/products/trove/x.png")).toBe(
      "trove",
    );
    expect(
      inferPackshotKind("Booster Display", "/products/booster-display/x.png"),
    ).toBe("display");
    expect(inferPackshotKind("Gift Box Product Image", "/gift.png")).toBe(
      "collector_box",
    );
  });

  it("keeps full Illumineer's Quest title (og apostrophe) and Q3 packshot", () => {
    const page = parseOfficialProductPage(
      `<html><head>
<meta property="og:title" content="Illumineer's Quest: The Great Hunny Rescue | Disney Lorcana TCG by Ravensburger">
<title>Illumineer&#x27;s Quest: The Great Hunny Rescue | Disney Lorcana TCG by Ravensburger | Disney Lorcana by Ravensburger</title>
</head><body>
<img src="https://ravensburger.cloud/cms/gallery/lorcana-web/products/iq3-great-hunny-rescue/dlc_iq3_hero_1920x1080.jpg" alt="Illumineer's Quest: The Great Hunny Rescue Key Art" />
<img src="https://ravensburger.cloud/cms/gallery/lorcana-web/products/iq3-great-hunny-rescue/logo/en_gosdhfht9u.png" alt="great hunny rescue" />
<img src="https://ravensburger.cloud/cms/gallery/lorcana-web/products/iq3-great-hunny-rescue/encounter-cards/en_cklkadqyuv_660x440.png" alt="encounter card for Great Hunny Rescue" />
<img src="https://ravensburger.cloud/cms/gallery/lorcana-web/products/iq3-great-hunny-rescue/dlc-iq3_spill-photo_1920x1080.png" alt="great hunny rescue trove" />
</body></html>`,
      "great-hunny-rescue",
      { locale: "en-US", lang: "en" },
    );
    expect(page.title).toBe("Illumineer's Quest: The Great Hunny Rescue");
    expect(page.setId).toBe("quest3");
    expect(page.packshots).toEqual([
      {
        url: "https://ravensburger.cloud/cms/gallery/lorcana-web/products/iq3-great-hunny-rescue/logo/en_gosdhfht9u.png",
        alt: "great hunny rescue",
        kind: "quest",
      },
    ]);
  });

  it("keeps gift-box product-shot over website header", () => {
    const page = parseOfficialProductPage(
      `<html><head><meta property="og:title" content="Elsa Gift Box | Disney Lorcana" /></head>
<body>
<img src="https://ravensburger.cloud/cms/gallery/lorcana-web/products/collection-starter-set/dlc_1920x1080_thumbnail-1.jpg" alt="Disney Lorcana Collection Starter Set website header" />
<img src="https://ravensburger.cloud/cms/gallery/lorcana-web/products/collection-starter-set/en/dlc_web_elsa-gb_stub-page_assets_collection-product-shot_en.png" alt="Elsa Gift Box Components" />
<img src="https://ravensburger.cloud/cms/gallery/lorcana-web/products/fabled/logos/dlc_web_collector-ss_stub-page_assets_double_teaser_en.png" alt="Fabled logo" />
<h3>Contents Include:</h3>
<li>(1) "Glimmer foil" Elsa - The fifth Spirit promo card</li>
<li>(5) Booster packs (each with 12 randomized cards)</li>
<li>(1) Elsa storage box (holds up to 250 randomized cards)</li>
<li>(3) Punch-out dividers</li>
</body></html>`,
      "elsa-gift-box",
      { locale: "en-US", lang: "en" },
    );
    expect(page.packshots).toHaveLength(1);
    expect(page.packshots[0]?.alt).toBe("Elsa Gift Box Components");
    expect(page.packshots[0]?.kind).toBe("collector_box");
    expect(page.contents?.packsContained).toBe(5);
    expect(page.contents?.cardsPerPack).toBe(12);
    expect(page.contents?.trusted).toBe(true);
  });

  it("distrusts polluted FR Contents Include but keeps body pack count", () => {
    const html = `
Elsa Gift Box. Ce coffret contient 5 boosters de différents sets.
<h3>Contents Include:</h3>
<li>4 Fabled booster packs (each with 12 randomized cards)</li>
<li>1 Mickey Mouse – Brave Little Tailor card portfolio</li>
<li>1 “Glimmer foil” Tinker Bell – Giant Fairy promo card</li>
<li>1 Collector’s guide</li>
Welcome to the story`;
    const contents = parseOfficialProductContents(html, {
      slug: "elsa-gift-box",
      title: "Elsa Gift Box",
    });
    expect(contents?.trusted).toBe(false);
    expect(contents?.packsContained).toBe(5);
  });

  it("parses Gateway Includes decks + reward packs into declaredCardCount", () => {
    const html = `
Disney Lorcana Gateway
<h3>Gateway Includes:</h3>
<li>2 Starting Decks (30 cards each)</li>
<li>4 Reward Packs (18 cards each)</li>
<li>1 Game board</li>
How To Play`;
    const contents = parseOfficialProductContents(html, {
      slug: "gateway",
      title: "Disney Lorcana Gateway",
    });
    expect(contents?.trusted).toBe(true);
    expect(contents?.declaredCardCount).toBe(132);
    expect(contents?.packsContained).toBeNull();
  });

  it("parses 2-Player Starter ready-to-play decks", () => {
    const html = `
Here's what you'll find inside:
2 Ready-to-play decks (60 cards each)
Welcome to the story`;
    const contents = parseOfficialProductContents(html, {
      slug: "2-player-starter-set",
      title: "2-Player Starter Set",
    });
    expect(contents?.declaredCardCount).toBe(120);
  });

  it("classes Illumineer's Quest before CMS trove folder", () => {
    expect(
      inferPackshotKind(
        "Illumineer's Quest Great Hunny Rescue",
        "https://ravensburger.cloud/.../products/trove/iq3-great-hunny-rescue/en.png",
      ),
    ).toBe("quest");
    expect(
      inferPackshotKind(
        "Quête des Illumineurs",
        "https://ravensburger.cloud/.../products/iq3-great-hunny-rescue/fr.png",
      ),
    ).toBe("quest");
    expect(
      inferPackshotKind(
        "Product Image",
        "https://www.disneylorcana.com/en-US/products/iq3/box.png",
      ),
    ).toBe("quest");
  });

  it("maps booster box / box of packs to display, not booster", () => {
    expect(
      inferPackshotKind(
        "Disney Lorcana Fabled Booster Box",
        "https://ravensburger.cloud/.../fabled-booster-box.png",
      ),
    ).toBe("display");
    expect(
      inferPackshotKind(
        "Box of 24 booster packs",
        "https://ravensburger.cloud/.../lorcana_set_6_booster_850x850_en.png",
      ),
    ).toBe("display");
  });
});

describe("flat-path sealed packshots", () => {
  it("keeps Wilds Unknown display art out of spoilers", () => {
    const page = parseOfficialProductPage(
      `<img src="https://ravensburger.cloud/cms/gallery/lorcana-web/products/s12-wilds-unknown/svvuwbf6ph_en.png" alt="Display Packs of Disney Lorcana Wilds Unknown" />
<img src="https://ravensburger.cloud/cms/gallery/lorcana-web/products/s12-wilds-unknown/svvuwbf6ph_de.png" alt="Display Packs of Disney Lorcana Wilds Unknown" />
<img src="https://ravensburger.cloud/cms/gallery/lorcana-web/products/s12-wilds-unknown/en/first-look/card.png.png" alt="Mickey Mouse - Brave Little Tailor" />`,
      "wilds-unknown",
      { locale: "en-US" },
    );
    expect(page.packshots.map((p) => p.kind)).toEqual(["display", "display"]);
    expect(page.packshots.map((p) => inferLangFromPackshotUrl(p.url))).toEqual([
      "en",
      "de",
    ]);
    expect(page.spoilers).toHaveLength(1);
  });
});

describe("officialProductDisplayName", () => {
  it("labels set-page two-player starter packshots", () => {
    expect(
      officialProductDisplayName({
        pageTitle: "Wilds Unknown",
        packshotAlt: "Two Player Starter Decks",
        pageSlug: "wilds-unknown",
      }),
    ).toBe("Wilds Unknown 2-Player Starter Set");
  });

  it("keeps dedicated 2-player page title", () => {
    expect(
      officialProductDisplayName({
        pageTitle: "Disney Lorcana TCG 2-Player Starter Set",
        packshotAlt: "Photo of the Disney Lorcana 2-player starter set",
        pageSlug: "2-player-starter-set",
      }),
    ).toBe("Disney Lorcana TCG 2-Player Starter Set");
  });
});

describe("isNonCardOfficialAccessory", () => {
  it("rejects Hades playmat product-photography as a sealed SKU", () => {
    const url =
      "https://ravensburger.cloud/cms/gallery/lorcana-web/products/jafar/skus/misc/dlc_s8_playmats_product-photography-hades.png";
    expect(isNonCardOfficialAccessory("Hadès Tapis de jeu", url)).toBe(true);
    expect(inferPackshotKind("Hadès Tapis de jeu", url, { setId: "set8" })).toBe(
      null,
    );
  });

  it("rejects Fabled deck-box lifestyle shots", () => {
    expect(
      inferPackshotKind(
        "Image of deck boxes from Disney Lorcana Fabled",
        "https://ravensburger.cloud/cms/gallery/lorcana-web/products/fabled/deck-boxes.png",
        { setId: "set9" },
      ),
    ).toBeNull();
  });
});

describe("official site locales", () => {
  it("maps site locales and packshot CDN prefixes", () => {
    expect(officialSiteLocaleToLang("en-US")).toBe("en");
    expect(officialSiteLocaleToLang("de-DE")).toBe("de");
    expect(
      inferLangFromPackshotUrl(
        "https://ravensburger.cloud/cms/gallery/lorcana-web/products/s14/products/fr_trove.png",
      ),
    ).toBe("fr");
    expect(
      inferLangFromPackshotUrl(
        "https://ravensburger.cloud/cms/gallery/lorcana-web/products/s14/products/en_box.png",
      ),
    ).toBe("en");
  });

  it("parses EN pages with lang stamp", () => {
    const page = parseOfficialProductPage(PAGE_HTML, "hyperia-city", {
      locale: "en-US",
    });
    expect(page.lang).toBe("en");
    expect(page.sourceUrl).toContain("/en-US/product/");
  });

  it("lists catalogue locales for harvest (FR/EN/DE/IT)", () => {
    expect(OFFICIAL_SITE_LOCALES).toEqual([
      "fr-FR",
      "en-US",
      "de-DE",
      "it-IT",
    ]);
  });
});

describe("officialSiteContentHashFromPages", () => {
  it("is stable and marks ledger fresh", () => {
    const pages: OfficialProductPage[] = [
      {
        slug: "hyperia-city",
        title: "Hyperia",
        logoUrl: "https://example.com/logo.png",
        logoAlt: "logo",
        setId: "set14",
        packshots: [
          {
            url: "https://example.com/fr_trove.png",
            alt: "trove",
            kind: "coffret",
          },
        ],
        spoilers: [
          {
            url: "https://example.com/first-look/a.png",
            title: "Aurora - Delightful Musician",
            kind: "first-look",
          },
        ],
        contents: null,
        sourceUrl: "https://www.disneylorcana.com/fr-FR/product/hyperia-city",
        lang: "fr",
      },
    ];
    const a = officialSiteContentHashFromPages(pages);
    const b = officialSiteContentHashFromPages(pages);
    expect(a).toBe(b);
    const withoutSpoilers = officialSiteContentHashFromPages([
      { ...pages[0]!, spoilers: [] },
    ]);
    expect(withoutSpoilers).not.toBe(a);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
    const ledger = emptyCatalogIngestLedger();
    ledger.entries["lorcana:official-site"] = {
      artefactId: "lorcana:official-site",
      contentHash: a,
      promotedAt: "2026-01-01T00:00:00.000Z",
    };
    expect(catalogArtefactIsFresh(ledger, "lorcana:official-site", b)).toBe(
      true,
    );
  });
});
