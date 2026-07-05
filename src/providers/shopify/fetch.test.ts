import { describe, expect, it } from "vitest";

import { extractProductHandles, stripHtml } from "./fetch";

describe("extractProductHandles", () => {
  it("renvoie tous les handles dédupliqués dans l'ordre (résultat ≠ premier lien)", () => {
    // Le bandeau/nav porte un lien non-résultat (carte-cadeaux) AVANT le produit
    // recherché — on doit récupérer les deux, le caller confirme par code-barres.
    const html = `
      <header><a href="/products/carte-cadeaux">Carte cadeau</a></header>
      <main>
        <a href="/products/mille-sabords-3421272109517"><img/></a>
        <a href="/products/mille-sabords-3421272109517">Mille Sabords</a>
      </main>`;
    expect(extractProductHandles(html)).toEqual([
      "carte-cadeaux",
      "mille-sabords-3421272109517",
    ]);
  });

  it("renvoie une liste vide sans lien produit", () => {
    expect(extractProductHandles("<div>aucun produit</div>")).toEqual([]);
  });
});

describe("stripHtml", () => {
  it("retire les balises et décode les entités courantes", () => {
    expect(stripHtml("<p>Jeu&nbsp;de <b>dés</b> &amp; pirates</p>")).toBe(
      "Jeu de dés & pirates",
    );
    expect(stripHtml(null)).toBeUndefined();
    expect(stripHtml("   ")).toBeUndefined();
  });
});
