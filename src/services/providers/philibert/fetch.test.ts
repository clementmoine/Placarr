import { describe, expect, it } from "vitest";

import {
  parsePhilibertFeatureRows,
  parsePhilibertGalleryImages,
  parsePhilibertProductId,
  parsePhilibertReviewSummary,
  parsePhilibertReviewsHtml,
  parsePhilibertTopFeatures,
  philibertImageId,
} from "./fetch";

describe("parsePhilibertTopFeatures", () => {
  it("extrait joueurs, durée, âge et langue", () => {
    const html = `
      <span class="product-top-features__item-label h6">Français</span>
      <span class="product-top-features__item-label h6">à partir de 10 ans</span>
      <span class="product-top-features__item-label h6">1 à 2h</span>
      <span class="product-top-features__item-label h6">3 à 4 joueurs</span>
    `;

    expect(parsePhilibertTopFeatures(html)).toEqual({
      language: "Français",
      ageRating: "10+",
      playtime: "1 à 2h",
      players: "3 à 4",
    });
  });
});

describe("parsePhilibertFeatureRows", () => {
  it("extrait les paires nom/valeur de la fiche technique", () => {
    const html = `
      <li class="product-features__item">
        <span class="product-features__name">Création</span>
        <a class="product-features__value"><span>Klaus Teuber</span></a>
      </li>
      <li class="product-features__item">
        <span class="product-features__name">Editeur</span>
        <a class="product-features__value"><span>Kosmos</span></a>
      </li>
      <li class="product-features__item">
        <span class="product-features__name">Note globale</span>
        <span class="product-features__value">4.6</span>
      </li>
    `;

    expect(parsePhilibertFeatureRows(html)).toEqual({
      Création: ["Klaus Teuber"],
      Editeur: ["Kosmos"],
      "Note globale": ["4.6"],
    });
  });
});

describe("parsePhilibertReviewSummary", () => {
  it("extrait la note agrégée et le nombre d'avis", () => {
    const html = `
      <div class="product-reviews d-flex">
        <div class="note-value">4.6/5</div>
      </div>
      <a href="#product-reviews-profiles"><span>Voir les 56 avis</span></a>
    `;

    expect(parsePhilibertReviewSummary(html)).toEqual({
      rating: "4.6",
      reviewCount: 56,
    });
  });
});

describe("parsePhilibertReviewsHtml", () => {
  it("extrait auteur, note et extrait d'avis", () => {
    const html = `
      <div class="review-content__reviews-item shadow-light">
        <p class="review-content__reviews-item-header-content-name">L'avis de Guillaume Ghrenassia</p>
        <div class="note-value">5/5</div>
        <div class="review-content__reviews-item-content mt-3"><p>Un classique indémodable.</p></div>
      </div>
    `;

    expect(parsePhilibertReviewsHtml(html)).toEqual([
      {
        author: "Guillaume Ghrenassia",
        rating: "5",
        text: "Un classique indémodable.",
      },
    ]);
  });
});

describe("parsePhilibertProductId", () => {
  it("extrait l'id produit depuis l'url Philibert", () => {
    expect(
      parsePhilibertProductId(
        "https://www.philibertnet.com/fr/kosmos/10772-catane-3558380126133.html",
      ),
    ).toBe("10772");
  });
});

describe("philibertImageId", () => {
  it("extrait l'id image depuis une url CDN, quelle que soit la taille", () => {
    expect(
      philibertImageId(
        "https://cdn1.philibertnet.com/547785-large_default/x--3558380099505.jpg",
      ),
    ).toBe("547785");
    expect(
      philibertImageId(
        "https://cdn1.philibertnet.com/547785/x--3558380099505.jpg",
      ),
    ).toBe("547785");
    expect(philibertImageId(null)).toBeNull();
  });
});

describe("parsePhilibertGalleryImages", () => {
  it("récupère les images distinctes du produit (originaux) et ignore les produits liés", () => {
    const url =
      "https://www.philibertnet.com/fr/space-cowboys/111299-mon-jeu--3558380099505.html";
    const html = `
      <img src="https://cdn1.philibertnet.com/100-large_default/mon-jeu--3558380099505.jpg">
      <img src="https://cdn1.philibertnet.com/100-thickbox_default/mon-jeu--3558380099505.jpg">
      <img src="https://cdn1.philibertnet.com/100/mon-jeu--3558380099505.jpg">
      <img src="https://cdn1.philibertnet.com/200-large_default/mon-jeu--3558380099505.jpg">
      <img src="https://cdn1.philibertnet.com/999-home_default/autre-jeu--3558380099499.jpg">
    `;

    expect(parsePhilibertGalleryImages(html, url)).toEqual([
      "https://cdn1.philibertnet.com/100/mon-jeu--3558380099505.jpg",
      "https://cdn1.philibertnet.com/200/mon-jeu--3558380099505.jpg",
    ]);
  });

  it("renvoie une liste vide quand l'url de la fiche n'a pas de slug exploitable", () => {
    expect(parsePhilibertGalleryImages("<img src=''>", "")).toEqual([]);
  });
});
