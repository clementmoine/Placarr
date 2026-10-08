import { afterEach, describe, expect, it } from "vitest";

import {
  __resetEffectPacksForTests,
  registerEffectPack,
  resolveSharedCardBackSkeleton,
} from "@/core/render/foil/backend";
import { narutoCarddassEffectPack } from "./index";

const resolve = narutoCarddassEffectPack.resolveCardBack!;

/*
  Le pack `naruto/carddass` porte deux jeux. Le 疾風伝 (2007-2009) est japonais
  seul, et les dos étant servis par **langue**, ses 313 cartes héritaient de
  `back.ja.webp` — le dos Carddass, triskèle 忍/術/幻, sans un 疾風伝 dessus.
*/
describe("le dos du 疾風伝", () => {

  it("sert son propre dos aux quatre familles de la ligne", () => {
    for (const card of ["shi0061", "mju0065", "msa0026", "gaku0001"]) {
      expect(resolve({ printKey: `naruto:${card}`, setCode: null })).toContain(
        "/cards/shi/back.webp",
      );
    }
  });

  it("le sert aussi depuis le code de set, quand la carte manque", () => {
    expect(resolve({ setCode: "maku1", printKey: null })).toContain(
      "/cards/shi/back.webp",
    );
    expect(resolve({ setCode: "maku8", printKey: null })).toContain(
      "/cards/shi/back.webp",
    );
  });

  /*
    Le Carddass garde le sien. `ni0001` et `shi0001` sont tous deux
    うずまきナルト : c'est le préfixe qui sépare les deux jeux, rien d'autre.
  */
  it("laisse le Carddass sur son dos", () => {
    for (const card of ["ni0001", "te0001", "ta0001", "cl0001", "ki0001"]) {
      expect(resolve({ printKey: `naruto:${card}`, setCode: "s1" })).toBeNull();
    }
  });

  /*
    Le piège : le « Naruto Shippuden CCG » **anglais** (`s13`-`s28`) dit aussi
    « Shippuden » et n'est pas ce jeu. Il ne partage aucun tirage avec lui et
    garde le dos anglais (pas le losange 疾風伝).
  */
  it("sert le verso USA au CCG anglais (Storm 3 / Legacy), pas le dos 疾風伝", () => {
    expect(resolve({ printKey: "naruto:n0001", setCode: "s13" })).toContain(
      "/cards/back.en.webp",
    );
    expect(resolve({ printKey: "naruto:m0042", setCode: "s28" })).toContain(
      "/cards/back.en.webp",
    );
  });

  it("ne répond rien quand il n'a ni carte ni set", () => {
    expect(resolve({ setCode: null, printKey: null })).toBeNull();
  });
});

describe("skeleton grille — deux dos partagés", () => {
  afterEach(() => {
    __resetEffectPacksForTests();
  });

  it("Carddass reste sur le verso FR du pack", () => {
    expect(resolve({ printKey: "naruto:ni0001", setCode: "s1" })).toBeNull();
  });

  it("Storm 3 expose un dos set-scope (pas seulement print)", () => {
    expect(resolve({ printKey: "naruto:n1621", setCode: "s28" })).toBe(
      "/assets/naruto/carddass/cards/back.en.webp",
    );
  });

  it("le skeleton grille n'affiche plus le Carddass FR sur une Storm 3", () => {
    registerEffectPack(narutoCarddassEffectPack);
    expect(
      resolveSharedCardBackSkeleton({
        // Stamp print (filtré par le skeleton) — comme la fiche catalogue.
        printCardBackUrl: "/assets/naruto/carddass/cards/back.en.webp",
        printKey: "naruto:n1621",
        setCode: "s28",
        effectPackId: narutoCarddassEffectPack.id,
      }),
    ).toBe("/assets/naruto/carddass/cards/back.en.webp");
    expect(
      resolveSharedCardBackSkeleton({
        printKey: "naruto:ni0001",
        setCode: "s1",
        effectPackId: narutoCarddassEffectPack.id,
      }),
    ).toBe("/assets/naruto/carddass/cards/back.fr.webp");
  });
});
