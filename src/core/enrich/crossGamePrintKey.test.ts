import { describe, expect, it } from "vitest";

import { PROVIDER_MODULES } from "@/core/catalog/registry";

/**
 * Un `printKey` d'un jeu ne doit jamais être enrichi par le provider d'un autre.
 *
 * Observé le 2026-08-20 sur une étagère Naruto de 36 objets : **quatre** portaient
 * la métadonnée d'une carte Lorcana, alors que leur `printKey` disait bien
 * `naruto:` — et le rapprochement se faisait par **sous-chaîne du nom** :
 *
 * | Objet | Métadonnée collée      | Le rapprochement |
 * | ----- | ---------------------- | ---------------- |
 * | Ami   | Amico Gufo             | préfixe          |
 * | Chou  | At**chou**m            | sous-chaîne      |
 * | Haku  | **Haku**na Matata      | préfixe          |
 * | Inari | Illum**inari**um       | sous-chaîne      |
 *
 * La cause : les providers qui savent chercher par nom sautaient bien la
 * recherche par clé quand le jeu n'était pas le leur, puis **retombaient sur le
 * nom** et rendaient la première carte approchante. Des noms courts suffisaient.
 *
 * Ce test interroge les vrais modules, sans réseau : une clé d'un jeu étranger
 * doit rendre `null` **avant** toute requête. Un provider qui partirait chercher
 * échouerait ici par le temps ou par l'erreur réseau, pas silencieusement.
 */
const FOREIGN_KEYS = [
  "naruto:cl-0001",
  "lorcana:6-48",
  "pokemon:sv01-001",
  "dbscg:fb01-001",
] as const;

function tcgModulesWithLookup() {
  return PROVIDER_MODULES.filter(
    (provider) =>
      typeof provider.lookupPrint === "function" &&
      provider.info.types.some((type) => type === "tcg"),
  );
}

describe("un tirage n'est jamais enrichi par le provider d'un autre jeu", () => {
  it("expose au moins deux providers de cartes", () => {
    // Sans quoi le test passerait à vide le jour où le registre change de forme.
    expect(tcgModulesWithLookup().length).toBeGreaterThanOrEqual(2);
  });

  /*
    Le cœur du défaut. `lookupPrint` était déjà gardé — c'est l'**adaptateur de
    métadonnées** qui retombait sur le nom. C'est donc lui qu'il faut interroger :
    une clé étrangère, un nom qui ressemble, et rien ne doit sortir.
  */
  it("l'adaptateur de métadonnées se tait sur une clé étrangère", async () => {
    const cases = [
      { printKey: "naruto:cl-0001", name: "Inari" },
      { printKey: "naruto:cl-0027", name: "Chou" },
      { printKey: "naruto:ni-0017", name: "Haku" },
      { printKey: "naruto:cl-0015", name: "Ami" },
    ];
    /*
      Restreint aux providers qui savent résoudre un tirage par sa clé : ce sont
      ceux qui possèdent un catalogue de cartes, donc ceux à qui la clé
      s'adresse. Les boutiques du type `tcg` — Play-In et consorts — n'ont pas
      de jeu à revendiquer, et les interroger ferait de ce test un test réseau.
    */
    for (const provider of tcgModulesWithLookup()) {
      if (typeof provider.createMetadataAdapter !== "function") continue;
      // Le provider qui possède ce jeu a évidemment le droit de répondre.
      if (provider.info.id === "narutocarddass") continue;
      const adapter = provider.createMetadataAdapter();
      if (!adapter) continue;
      for (const { printKey, name } of cases) {
        const found = await adapter.resolve({ name, printKey });
        // Le provider fautif se lit dans la trace de l'échec.
        expect(found).toBeNull();
      }
    }
  });

  it("rend null pour toute clé qui nomme un autre jeu", async () => {
    for (const provider of tcgModulesWithLookup()) {
      for (const printKey of FOREIGN_KEYS) {
        const found = await provider.lookupPrint!({ printKey });
        if (!found) continue;
        /*
          Un provider a le droit de répondre — mais alors la clé rendue doit
          être celle qu'on lui a demandée. Rendre une *autre* carte, c'est
          précisément le défaut qu'on interdit ici.
        */
        expect(found.printKey.trim().toLowerCase()).toBe(printKey);
      }
    }
  });
});
