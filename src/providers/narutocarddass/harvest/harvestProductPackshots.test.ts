import { describe, expect, it } from "vitest";

import comicplanet from "../curated/sources/comicplanet-de.json";
import official from "../curated/sources/carddass-official-products.json";
import suruga from "../curated/sources/suruga-ya-kaitori-packshots.json";
import { volumeOfficialProducts } from "../volumeOfficialProducts";

/*
  `staging/` doit se reconstruire depuis un relevé. Ces tests ne téléchargent
  rien : ils vérifient que chaque fichier qu'un spec attend en staging a bien
  une ligne de relevé derrière lui — sans quoi la moisson laisserait un trou
  qu'aucune erreur ne signalerait.
*/
describe("chaque visuel de staging a son relevé", () => {
  /*
    Les specs du 疾風伝 sont parties avec leur jeu le 2026-08-21, et son pack
    porte le même test sur son propre relevé. Ici : les 巻ノ, et eux seuls.
  */
  it("couvre les specs 巻ノ par un JAN de la base Bandai", () => {
    const jans = new Set(official.products.map((p) => p.jan));
    const specs = volumeOfficialProducts()
      .map((spec) => spec.jan)
      .filter((jan): jan is string => Boolean(jan));
    expect(specs.length).toBeGreaterThan(0);
    for (const jan of specs) {
      expect(jans.has(jan)).toBe(true);
    }
  });

  it("donne une image à chaque produit officiel qu'un spec réclame", () => {
    const wanted = new Set(
      volumeOfficialProducts()
        .map((s) => s.jan)
        .filter((jan): jan is string => Boolean(jan)),
    );
    for (const row of official.products) {
      if (!wanted.has(row.jan)) continue;
      expect(row.image).toBeTruthy();
    }
  });

  it("nomme chaque packshot allemand d'après son slug", () => {
    for (const row of comicplanet.products) {
      expect(row.slug).toMatch(/^(booster|display)-s\d{1,2}-de$/);
      expect(row.image).toBeTruthy();
    }
  });

  it("garde un identifiant Suruga par SKU, jamais une URL de page", () => {
    // Le site est derrière Cloudflare : seul le CDN est interrogé, par id.
    for (const row of suruga.products) {
      expect(row.id).toMatch(/^\d{9,}$/);
      expect(row.slug.length).toBeGreaterThan(0);
    }
  });
});
