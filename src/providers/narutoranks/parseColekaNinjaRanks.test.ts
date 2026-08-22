import { describe, expect, it } from "vitest";

import {
  COLEKA_NINJA_RANKS_LANG,
  colekaNinjaRanksFaceUrl,
  colekaNinjaRanksListingPageUrls,
  NINJA_RANKS_BASE_CARDS,
  parseColekaNinjaRanksListing,
  thumbCorroboratesRef,
  thumbIsPlaceholder,
} from "./parseColekaNinjaRanks";

/** Une fiche du listing, telle que Coleka l'écrit. */
function item(ref: string, title: string, stem: string): string {
  return `<a class="lib_has_2_lines" href="/en/trading-cards/panini-cards/naruto-ninja-ranks/x_i1${ref}" data-id="1${ref}">
    <img src="https://thumbs.coleka.com/media/item/202206/09/${stem}_250x250.webp">
    <h3 class="product-title">${title}</h3>
    <span class="ref"> Ref. ${ref} </span>
  </a>`;
}

describe("parseColekaNinjaRanksListing", () => {
  it("retient une fiche dont le nom de fichier répète le numéro", () => {
    const { cards } = parseColekaNinjaRanksListing(
      item("007", "Carte n°7", "naruto-ninja-ranks-carte-n-7-007"),
    );
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ number: "0007", colekaRef: 7 });
    expect(cards[0]!.faceUrl).toBe(
      "https://thumbs.coleka.com/media/item/202206/09/naruto-ninja-ranks-carte-n-7-007.webp",
    );
  });

  it("refuse une vignette générique — un seul signal ne suffit pas", () => {
    // Le cas réel de la carte 3 : la référence dit 3, le fichier ne dit rien.
    const { cards, rejected } = parseColekaNinjaRanksListing(
      item("003", "Groupe 7 kakashi sasuke", "coleka-carte-panini-naruto"),
    );
    expect(cards).toHaveLength(0);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]!.reason).toMatch(/nom de fichier/);
  });

  it("refuse tout numéro hors du set de base, plutôt que de deviner un insert", () => {
    const { cards, rejected } = parseColekaNinjaRanksListing(
      item("073", "Carte n°73", "naruto-ninja-ranks-carte-n-73-073"),
    );
    expect(cards).toHaveLength(0);
    expect(rejected[0]!.reason).toMatch(/hors du set de base/);
    expect(NINJA_RANKS_BASE_CARDS).toBe(72);
  });

  it("ne rend qu'une carte par numéro, même vue deux fois", () => {
    const html =
      item("012", "Carte n°12", "naruto-ninja-ranks-carte-n-12-012") +
      item("012", "Carte n°12 bis", "naruto-ninja-ranks-carte-n-12-012");
    expect(parseColekaNinjaRanksListing(html).cards).toHaveLength(1);
  });

  it("rend les cartes dans l'ordre des numéros", () => {
    const html =
      item("040", "Carte n°40", "naruto-ninja-ranks-carte-n-40-040") +
      item("002", "Carte n°2", "naruto-ninja-ranks-carte-n-2-002");
    expect(
      parseColekaNinjaRanksListing(html).cards.map((c) => c.colekaRef),
    ).toEqual([2, 40]);
  });

  it("ignore une fiche sans référence", () => {
    const html = `<a class="lib_has_2_lines" href="/x"><img src="https://thumbs.coleka.com/media/item/x_250x250.webp"><h3 class="product-title">X</h3></a>`;
    const { cards, rejected } = parseColekaNinjaRanksListing(html);
    expect(cards).toHaveLength(0);
    expect(rejected).toHaveLength(0);
  });
});

describe("helpers", () => {
  it("dérive la pleine taille en retirant le suffixe de taille", () => {
    expect(
      colekaNinjaRanksFaceUrl("https://thumbs.coleka.com/a/b_250x250.webp"),
    ).toBe("https://thumbs.coleka.com/a/b.webp");
    // Un chemin déjà nu ne bouge pas.
    expect(colekaNinjaRanksFaceUrl("https://thumbs.coleka.com/a/b.webp")).toBe(
      "https://thumbs.coleka.com/a/b.webp",
    );
  });

  it("lit le numéro dans le nom de fichier, zéros de tête compris", () => {
    expect(
      thumbCorroboratesRef("https://x/carte-n-7-007_250x250.webp", 7),
    ).toBe(true);
    expect(
      thumbCorroboratesRef("https://x/coleka-carte-panini_250x250.webp", 3),
    ).toBe(false);
    // 17 ne doit pas valider la carte 7.
    expect(
      thumbCorroboratesRef("https://x/carte-n-17-017_250x250.webp", 7),
    ).toBe(false);
  });

  it("vise la branche EN, qui tient mieux que la FR", () => {
    const urls = colekaNinjaRanksListingPageUrls();
    expect(urls).toHaveLength(3);
    expect(urls[0]).toContain("/en/trading-cards/panini-cards/");
    expect(urls[2]).toMatch(/\?p=2$/);
  });
});

describe("gabarits « pas encore photographiée »", () => {
  it("refuse le gabarit dont le fichier répète le slug de la collection", () => {
    // Douze cartes en portaient un le 2026-08-22 : un cadre blanc, le numéro
    // au centre, 436×600 pour tout le monde. Le numéro s'y relit pourtant —
    // c'est bien un second signal qu'il faut, pas le même deux fois.
    const { cards, rejected } = parseColekaNinjaRanksListing(
      item(
        "006",
        "Carte n°6",
        "naruto-ninja-ranks-panini-naruto-ninja-ranks-6-006",
      ),
    );
    expect(cards).toHaveLength(0);
    expect(rejected[0]!.reason).toMatch(/gabarit/);
  });

  it("laisse passer un vrai scan dont le titre nomme la carte", () => {
    const { cards } = parseColekaNinjaRanksListing(
      item(
        "068",
        "Secon examen des survivants",
        "naruto-ninja-ranks-secon-examen-des-survivants-068",
      ),
    );
    expect(cards).toHaveLength(1);
    expect(cards[0]!.number).toBe("0068");
  });

  it("reconnaît le gabarit sur son seul nom de fichier", () => {
    expect(
      thumbIsPlaceholder(
        "https://x/naruto-ninja-ranks-panini-naruto-ninja-ranks-20-020_250x250.webp",
      ),
    ).toBe(true);
    expect(
      thumbIsPlaceholder(
        "https://x/naruto-ninja-ranks-carte-n-7-007_250x250.webp",
      ),
    ).toBe(false);
  });

  it("étiquette les faces de l'édition photographiée, pas de celle des titres", () => {
    // Coleka photographie l'édition française ; les titres du pack restent
    // anglais. Les deux peuvent différer : l'index accepte une face sans nom.
    expect(COLEKA_NINJA_RANKS_LANG).toBe("fr");
  });
});
