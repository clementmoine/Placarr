import { describe, expect, it } from "vitest";

import {
  parseOkkazeoGameHtml,
  parseOkkazeoJsonLd,
  parseOkkazeoSearchHit,
} from "./fetch";

const GAME_HTML = `
<html><head>
<meta property="og:title" content="Mille Sabords - Jeu de société"/>
<meta property="og:description" content="Mille Sabords - 4 annonces à partir de 5€ - 2 à 5 joueurs - 2013 - Jeu de dés,Pirates"/>
<meta property="og:image" content="https://www.okkazeo.com/images/jeux/10267_1.jpg"/>
<script type="application/ld+json">
{
  "@context": "https://schema.org/",
  "@type": "Product",
  "name": "Mille Sabords",
  "description": "Le trésor se gagne aux dés. À l'aide des cartes Pirate, défiez la chance.",
  "image": "https://www.okkazeo.com/images/jeux/10267_1.jpg",
  "gtin13": "3421272109517",
  "weight": { "@type": "QuantitativeValue", "value": "212", "unitCode": "g" },
  "offers": { "@type": "AggregateOffer", "offerCount": 4, "lowPrice": 5, "highPrice": 10, "priceCurrency": "EUR" }
}
</script>
</head><body>
<div><i class="fas fa-fw fa-users" title="Nombre de joueurs"></i> 2 à 5 joueurs </div>
<div><i class="fas fa-fw fa-birthday-cake" title="Age conseillé"></i> 8+ </div>
<div><i class="fas fa-fw fa-clock" title="Durée d'une partie"></i> 30 mn </div>
</body></html>`;

const URL = "https://www.okkazeo.com/jeux/10267/mille-sabords";

describe("parseOkkazeoJsonLd", () => {
  it("extracts the clean canonical product data", () => {
    const data = parseOkkazeoJsonLd(GAME_HTML);
    expect(data.name).toBe("Mille Sabords");
    expect(data.gtin13).toBe("3421272109517");
    expect(data.image).toBe("https://www.okkazeo.com/images/jeux/10267_1.jpg");
    expect(data.description).toContain("Le trésor se gagne aux dés");
    expect(data.priceCents).toBe(500); // lowPrice 5€ → 500 cents
  });

  it("returns empty for HTML without a Product block", () => {
    expect(parseOkkazeoJsonLd("<html><body>nope</body></html>")).toEqual({});
  });
});

describe("parseOkkazeoGameHtml", () => {
  it("prefers the JSON-LD clean name over the noisy og:title", () => {
    const game = parseOkkazeoGameHtml(GAME_HTML, URL);
    // og:title is "Mille Sabords - Jeu de société"; JSON-LD name is clean.
    expect(game.title).toBe("Mille Sabords");
    expect(game.barcode).toBe("3421272109517");
    expect(game.imageUrl).toBe(
      "https://www.okkazeo.com/images/jeux/10267_1.jpg",
    );
  });

  it("extracts the labelled facts", () => {
    const game = parseOkkazeoGameHtml(GAME_HTML, URL);
    expect(game.players).toBe("2 à 5 joueurs");
    expect(game.playtime).toBe("30 mn");
    expect(game.ageRating).toBe("8+");
    expect(game.year).toBe("2013");
    expect(game.categories).toEqual(["Jeu de dés", "Pirates"]);
    expect(game.priceCents).toBe(500);
  });

  it("falls back to a cleaned og:title when JSON-LD has no name", () => {
    const noJsonLd = GAME_HTML.replace(
      /<script type="application\/ld\+json">[\s\S]*?<\/script>/,
      "",
    );
    const game = parseOkkazeoGameHtml(noJsonLd, URL);
    expect(game.title).toBe("Mille Sabords"); // " - Jeu de société" stripped
  });
});

describe("parseOkkazeoSearchHit", () => {
  it("resolves the EAN search to the canonical game page", () => {
    const searchHtml = `
      <div class="results">
        <a href="/jeux/10267/mille-sabords">Mille Sabords</a>
      </div>`;
    const hit = parseOkkazeoSearchHit(searchHtml);
    expect(hit?.url).toBe("https://www.okkazeo.com/jeux/10267/mille-sabords");
    expect(hit?.gameId).toBe("10267");
  });

  it("returns null when no game link is present", () => {
    expect(parseOkkazeoSearchHit("<div>aucun résultat</div>")).toBeNull();
  });
});
