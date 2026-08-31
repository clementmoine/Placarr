import { describe, expect, it } from "vitest";

import { narutoCarddassEffectPack } from "./index";

/*
  Le pack `naruto/carddass` porte deux jeux. Le 疾風伝 (2007-2009) est japonais
  seul, et les dos étant servis par **langue**, ses 313 cartes héritaient de
  `back.ja.webp` — le dos Carddass, triskèle 忍/術/幻, sans un 疾風伝 dessus.
*/
describe("le dos du 疾風伝", () => {
  const resolve = narutoCarddassEffectPack.resolveCardBack!;

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
    garde le dos anglais.
  */
  it("ne prend pas le CCG anglais pour le jeu japonais", () => {
    expect(resolve({ printKey: "naruto:n0001", setCode: "s13" })).toBeNull();
    expect(resolve({ printKey: "naruto:m0042", setCode: "s28" })).toBeNull();
  });

  it("ne répond rien quand il n'a ni carte ni set", () => {
    expect(resolve({ setCode: null, printKey: null })).toBeNull();
  });
});
