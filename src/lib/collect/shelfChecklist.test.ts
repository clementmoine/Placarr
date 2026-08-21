/*
  `Shelf` ne porte qu'un `type`, et `tcg` est partagé par Lorcana, Pokémon,
  Naruto et Dragon Ball. S'en contenter faisait compter les 292 extensions de
  tous les jeux : l'étagère Lorcana annonçait « 193 / 31 795 — 1 % », en
  additionnant des cartes Pokémon qu'elle ne contiendra jamais, et mettait
  vingt secondes à le faire.
*/
import { describe, expect, it } from "vitest";

import { gamesInShelf } from "./shelfChecklist";

describe("le jeu d'une étagère se lit dans ses cartes", () => {
  it("reads the game slug out of every print key", () => {
    expect([...gamesInShelf(["lorcana:1-1", "lorcana:5-100"])]).toEqual([
      "lorcana",
    ]);
  });

  /*
    Les deux jeux Naruto partagent le slug `naruto` — même franchise, deux
    catalogues. Une étagère Carddass doit donc voir les deux packs.
  */
  it("keeps a franchise together when two packs share its slug", () => {
    expect([...gamesInShelf(["naruto:ni-0001", "naruto:shi-0001"])]).toEqual([
      "naruto",
    ]);
  });

  it("reports a mixed shelf as mixed rather than picking one", () => {
    const games = gamesInShelf(["lorcana:1-1", "pokemon:base1-4"]);
    expect([...games].sort()).toEqual(["lorcana", "pokemon"]);
  });

  /*
    Une étagère vide n'impose rien : on retombe alors sur tous les packs du
    type, parce que mieux vaut trop montrer que de taire un jeu que
    l'utilisateur s'apprête à y ranger.
  */
  it("says nothing about an empty shelf", () => {
    expect(gamesInShelf([]).size).toBe(0);
    expect(gamesInShelf(["pas-une-clé"]).size).toBe(0);
  });
});
