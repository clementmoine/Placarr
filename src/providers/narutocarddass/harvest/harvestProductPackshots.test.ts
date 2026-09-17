import { describe, expect, it } from "vitest";

import comicplanet from "../curated/sources/comicplanet-de.json";
import official from "../curated/sources/carddass-official-products.json";
import suruga from "../curated/sources/suruga-ya-kaitori-packshots.json";
import tvtokyo from "../curated/sources/tvtokyo-goods.json";
import { volumeNumber, volumeOfficialProducts } from "../volumeOfficialProducts";

import { officialFilesByJan } from "./harvestProductPackshots";

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

  it("remoissonne aussi les sachets booster 12/16/17 (pas seulement vending)", () => {
    const byJan = officialFilesByJan();
    const boosterFiles = [...byJan.values()].filter((f) =>
      /^booster-vol(12|16|17)-jp\.jpg$/.test(f),
    );
    expect(boosterFiles.sort()).toEqual([
      "booster-vol12-jp.jpg",
      "booster-vol16-jp.jpg",
      "booster-vol17-jp.jpg",
    ]);
    for (const row of official.products) {
      const volume = volumeNumber(row.title);
      if (volume == null || ![12, 16, 17].includes(volume)) continue;
      if (!/ブースターパック/.test(row.title)) continue;
      expect(byJan.get(row.jan)).toBe(`booster-vol${volume}-jp.jpg`);
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

  it("moissonne toutes les vignettes TV Tokyo vol.1–11 (plus variantes)", () => {
    const vols = new Set(
      tvtokyo.products
        .map((row) => row.volumeNumber)
        .filter((n): n is number => typeof n === "number" && n > 0),
    );
    expect([...vols].sort((a, b) => a - b)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11,
    ]);
    expect(tvtokyo.products.some((row) => row.file === "card_package5s.jpg")).toBe(
      true,
    );
    expect(tvtokyo.products.some((row) => row.file === "card_package6s.jpg")).toBe(
      true,
    );
  });
});
