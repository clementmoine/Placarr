import { describe, expect, it } from "vitest";

import {
  inferLangFromPackshotUrl,
  inferOfficialSetId,
  inferPackshotKind,
  OFFICIAL_SITE_LOCALES,
  officialSiteLocaleToLang,
  parseOfficialProductMenu,
  parseOfficialProductPage,
} from "./officialSite";

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

  it("lists all catalogue locales for harvest", () => {
    expect(OFFICIAL_SITE_LOCALES).toEqual([
      "fr-FR",
      "en-US",
      "de-DE",
      "it-IT",
    ]);
  });
});
