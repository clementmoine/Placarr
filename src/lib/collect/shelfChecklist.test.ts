/*
  `Shelf` ne porte qu'un `type`, et `tcg` est partagé par Lorcana, Pokémon,
  Naruto et Dragon Ball. S'en contenter faisait compter les 292 extensions de
  tous les jeux : l'étagère Lorcana annonçait « 193 / 31 795 — 1 % », en
  additionnant des cartes Pokémon qu'elle ne contiendra jamais, et mettait
  vingt secondes à le faire.

  Le slug `naruto` est encore partagé par plusieurs catalogues (Carddass,
  Ninja Ranks, Ultra…). La check-list doit alors borner au catalogue, pas à
  toute la franchise.
*/
import { describe, expect, it } from "vitest";

import type { ProviderModule } from "@/types/providerModule";

import {
  cataloguesInShelf,
  gamesInShelf,
  resolveChecklistCatalogueIds,
} from "./shelfChecklist";

describe("le jeu d'une étagère se lit dans ses cartes", () => {
  it("reads the game slug out of every print key", () => {
    expect([...gamesInShelf(["lorcana:1-1", "lorcana:5-100"])]).toEqual([
      "lorcana",
    ]);
  });

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

function stubModule(
  id: string,
  setIds: readonly string[],
  label: string,
): ProviderModule {
  return {
    info: {
      id,
      label,
      catalogueLabel: label,
      types: ["tcg"],
      capabilities: ["identify"],
      auth: { kind: "none" },
      supplyMode: "local_catalog",
      canonical: false,
    },
    evidence: { label, sourceWeight: 0.5 },
    listPrintSets: () => setIds.map((setId) => ({ id: setId, label: setId })),
    printGames: ["naruto"],
  };
}

describe("le catalogue d'une étagère se lit dans ses sets", () => {
  const ranks = stubModule("narutoranks", ["nr", "ff", "nw", "bl"], "Naruto Ninja Ranks");
  const ultra = stubModule("narutoultra", ["uc"], "Naruto Ultra Challenge");
  const carddass = stubModule(
    "narutocarddass",
    ["s1", "ni", "maki1"],
    "Naruto Carddass",
  );
  const modules = [ranks, ultra, carddass];

  it("maps owned print keys to the catalogues that announce their sets", async () => {
    const owners = await cataloguesInShelf(modules, [
      "naruto:nr-0001",
      "naruto:nw-0002",
    ]);
    expect([...owners]).toEqual(["narutoranks"]);
  });

  it("keeps two catalogues when the shelf mixes their cards", async () => {
    const owners = await cataloguesInShelf(modules, [
      "naruto:nr-0001",
      "naruto:uc-0047",
    ]);
    expect([...owners].sort()).toEqual(["narutoranks", "narutoultra"]);
  });

  it("prefers a unique shelf name over the shared franchise slug", async () => {
    const ids = await resolveChecklistCatalogueIds({
      modules,
      shelfName: "Naruto Ninja Ranks",
      owned: new Set(["naruto:uc-0001"]),
    });
    expect([...ids]).toEqual(["narutoranks"]);
  });

  it("falls back to owned sets when the shelf name is ambiguous", async () => {
    const ids = await resolveChecklistCatalogueIds({
      modules,
      shelfName: "Naruto",
      owned: new Set(["naruto:uc-0001"]),
    });
    expect([...ids]).toEqual(["narutoultra"]);
  });

  it("stays empty when nothing names or owns a catalogue", async () => {
    const ids = await resolveChecklistCatalogueIds({
      modules,
      shelfName: "Naruto",
      owned: new Set(),
    });
    expect(ids.size).toBe(0);
  });
});
