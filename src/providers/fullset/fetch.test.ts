import { describe, expect, it } from "vitest";

import {
  fullSetConsoleSlugFromUrl,
  parseFullSetItemHtml,
  parseFullSetSearchHtml,
} from "./fetch";
import { fullSetHitMatchesPlatform, mapFullSetMetadata } from "./resolver";

// Trimmed from the live capture of recherche.php?q=rayman (2026-07-10) —
// attributes are on their own lines in the real markup.
const SEARCH_HTML = `
<div class="col-xl-6 col-lg-6 col-md-12">
  <a
    href="/psx/item/rayman.html"
    class="fs-search-card fs-search-card--item"
  >
    <span class="fs-search-card__icon" aria-hidden="true"> 🎮 </span>
    <span class="fs-search-card__body">
      <span class="fs-search-card__meta"> Jeux <span aria-hidden="true">•</span> 1995 </span>
      <strong> Rayman </strong>
      <span class="fs-search-card__support"> Playstation </span>
    </span>
    <span class="fs-search-card__arrow" aria-hidden="true"><i class="ti-arrow-right"></i></span>
  </a>
</div>
<div class="col-xl-6 col-lg-6 col-md-12">
  <a
    href="/saturn/item/rayman.html"
    class="fs-search-card fs-search-card--item"
  >
    <span class="fs-search-card__body">
      <span class="fs-search-card__meta"> Jeux <span aria-hidden="true">•</span> 1995 </span>
      <strong> Rayman </strong>
      <span class="fs-search-card__support"> Sega Saturn </span>
    </span>
  </a>
</div>
<a href="/autre/page.html" class="fs-search-card">pas un item</a>
`;

// Trimmed from the live capture of /psx/item/rayman.html (2026-07-10).
const ITEM_HTML = `
<h1>Rayman</h1>
<div class="fs-market__headline-price"><div class="fs-market__headline-price-copy"><span>COTE MÉDIANE INDICATIVE</span><small>177 annonces détectées lors du dernier relevé</small></div><strong>15,00 €</strong></div>
<h3>Indice de rareté Full Set <small>indicatif</small></h3>
<div class="fs-market__rarity"><div class="fs-market__ring" style="--fs-rarity:18"><strong>18</strong><span>/ 100</span></div></div>
<div class="fs-item-qw__facts">
  <div class="fs-item-qw__fact"><span class="fs-item-qw__fact-icon" aria-hidden="true">🎮</span><span class="fs-item-qw__fact-copy"><small>Console</small><strong>Playstation</strong></span></div>
  <div class="fs-item-qw__fact"><span class="fs-item-qw__fact-icon" aria-hidden="true">💾</span><span class="fs-item-qw__fact-copy"><small>Support</small><strong>CD-ROM PlayStation</strong></span></div>
  <div class="fs-item-qw__fact"><span class="fs-item-qw__fact-icon" aria-hidden="true">🏷️</span><span class="fs-item-qw__fact-copy"><small>Genre</small><strong>Plateforme</strong></span></div>
  <div class="fs-item-qw__fact"><span class="fs-item-qw__fact-icon" aria-hidden="true">📅</span><span class="fs-item-qw__fact-copy"><small>Sortie</small><strong>1995</strong></span></div>
  <div class="fs-item-qw__fact"><span class="fs-item-qw__fact-icon" aria-hidden="true">🧠</span><span class="fs-item-qw__fact-copy"><small>Développeur</small><strong>Ubisoft</strong></span></div>
  <div class="fs-item-qw__fact"><span class="fs-item-qw__fact-icon" aria-hidden="true">🏢</span><span class="fs-item-qw__fact-copy"><small>Éditeur</small><strong>Ubisoft</strong></span></div>
</div>
`;

const ITEM_URL = "https://full-set.net/psx/item/rayman.html";

describe("parseFullSetSearchHtml", () => {
  it("mappe les cartes de recherche (titre, catégorie, plateforme, slug)", () => {
    const hits = parseFullSetSearchHtml(SEARCH_HTML);
    expect(hits).toEqual([
      {
        url: "https://full-set.net/psx/item/rayman.html",
        title: "Rayman",
        category: "Jeux",
        platformLabel: "Playstation",
        year: "1995",
        consoleSlug: "psx",
      },
      {
        url: "https://full-set.net/saturn/item/rayman.html",
        title: "Rayman",
        category: "Jeux",
        platformLabel: "Sega Saturn",
        year: "1995",
        consoleSlug: "saturn",
      },
    ]);
  });

  it("respecte la limite et ignore les pages non-item", () => {
    expect(parseFullSetSearchHtml(SEARCH_HTML, 1)).toHaveLength(1);
    expect(parseFullSetSearchHtml("<html></html>")).toEqual([]);
  });
});

describe("parseFullSetItemHtml", () => {
  it("extrait fiche, rareté, cote médiane et volume d'annonces", () => {
    expect(parseFullSetItemHtml(ITEM_HTML, ITEM_URL)).toEqual({
      title: "Rayman",
      productUrl: ITEM_URL,
      consoleLabel: "Playstation",
      supportLabel: "CD-ROM PlayStation",
      genre: "Plateforme",
      releaseYear: "1995",
      developer: "Ubisoft",
      publisher: "Ubisoft",
      rarityScore: 18,
      medianPrice: "15,00 €",
      listingCount: 177,
    });
  });

  it("renvoie null sans titre et tolère une fiche minimale", () => {
    expect(parseFullSetItemHtml("<div>vide</div>", ITEM_URL)).toBe(null);
    expect(parseFullSetItemHtml("<h1>Rayman</h1>", ITEM_URL)).toEqual({
      title: "Rayman",
      productUrl: ITEM_URL,
    });
  });
});

describe("fullSetConsoleSlugFromUrl", () => {
  it("extrait le slug console de l'URL d'item", () => {
    expect(fullSetConsoleSlugFromUrl("/ps2_pal/item/rayman-m.html")).toBe(
      "ps2_pal",
    );
    expect(
      fullSetConsoleSlugFromUrl("https://full-set.net/psx/item/rayman.html"),
    ).toBe("psx");
    expect(fullSetConsoleSlugFromUrl("/recherche.php")).toBeUndefined();
  });
});

describe("fullSetHitMatchesPlatform", () => {
  const hit = (platformLabel: string, consoleSlug: string) => ({
    url: `https://full-set.net/${consoleSlug}/item/rayman.html`,
    title: "Rayman",
    platformLabel,
    consoleSlug,
  });

  it("accepte la même plateforme et tout quand le shelf n'en a pas", () => {
    expect(fullSetHitMatchesPlatform(hit("Playstation", "psx"), "ps1")).toBe(
      true,
    );
    expect(fullSetHitMatchesPlatform(hit("Sega Saturn", "saturn"), null)).toBe(
      true,
    );
  });

  it("rejette une autre console (jamais la cote d'un autre support)", () => {
    expect(fullSetHitMatchesPlatform(hit("Sega Saturn", "saturn"), "ps1")).toBe(
      false,
    );
    expect(
      fullSetHitMatchesPlatform(hit("Atari Jaguar", "jaguar"), "ps1"),
    ).toBe(false);
  });
});

describe("mapFullSetMetadata", () => {
  it("émet les facts (cote, rareté, fiche) sans attachments", () => {
    const item = parseFullSetItemHtml(ITEM_HTML, ITEM_URL)!;
    const metadata = mapFullSetMetadata(item);

    expect(metadata.title).toBe("Rayman");
    expect(metadata.attachments).toBeUndefined();
    expect(metadata.facts?.map((fact) => [fact.kind, fact.value])).toEqual([
      ["external-link", "Voir la fiche"],
      ["price", "15,00 € (177 annonces)"],
      ["rarity", "18/100"],
      ["genre", "Plateforme"],
      ["release-year", "1995"],
      ["developer", "Ubisoft"],
      ["publisher", "Ubisoft"],
    ]);
    expect(metadata.observations?.length).toBeGreaterThan(0);
  });
});
