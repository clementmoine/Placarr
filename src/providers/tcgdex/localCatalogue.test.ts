import { describe, expect, it } from "vitest";

import { digitalOnlySetIds } from "./digitalOnly";
import { listTcgdexLocalSets, searchTcgdexRows } from "./indexStore";

/**
 * Le pack Pokémon a été bâti pour extraire le foil du client TCG Live : son
 * stockage local disait *comment une carte brille*, jamais *comment elle
 * s'appelle*. Mesuré le 2026-08-20 — `cards-index.json` tient 93 777 entrées et
 * **zéro nom**. L'identité venait de l'API, donc chaque recherche sortait sur
 * le réseau.
 *
 * Ces tests s'appuient sur le catalogue moissonné : ils se sautent d'eux-mêmes
 * quand il n'existe pas, plutôt que d'échouer sur une absence de données.
 */
const localSets = listTcgdexLocalSets("fr");
const hasCatalogue = localSets.length > 0;

describe.skipIf(!hasCatalogue)("catalogue Pokémon local", () => {
  it("trouve par nom, sans réseau", () => {
    const rows = searchTcgdexRows("pikachu", { limit: 5 });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => /pikachu/i.test(row.name))).toBe(true);
  });

  /*
    Une extension seule est une question complète : c'est ainsi qu'on parcourt
    un set sans savoir quoi y chercher.
  */
  it("parcourt une extension sans mot-clé", () => {
    const browsed = searchTcgdexRows("", {
      setId: localSets[0]!.id,
      limit: 10,
    });
    expect(browsed.length).toBeGreaterThan(0);
    expect(
      browsed.every(
        (row) => row.setId.toLowerCase() === localSets[0]!.id.toLowerCase(),
      ),
    ).toBe(true);
  });

  /*
    Une étagère tient du carton. Les sets 100 % numériques — Pokémon TCG Pocket
    — n'entrent pas au catalogue. Le filtre existait côté recherche distante ;
    la première moisson locale l'a oublié, et « pikachu » a rendu des cartes
    Pocket. Il vit désormais **à la moisson**, pour qu'aucun chemin de lecture
    n'ait à s'en souvenir.
  */
  it("ne garde aucun set 100 % numérique", async () => {
    const digital = await digitalOnlySetIds();
    const kept = localSets.filter((set) => digital.has(set.id.toLowerCase()));
    expect(kept).toEqual([]);
  });

  it("nomme les extensions dans la langue demandée", () => {
    const fr = new Map(listTcgdexLocalSets("fr").map((s) => [s.id, s.label]));
    const en = new Map(listTcgdexLocalSets("en").map((s) => [s.id, s.label]));
    const differing = [...fr.entries()].filter(
      ([id, label]) => en.get(id) && en.get(id) !== label,
    );
    expect(differing.length).toBeGreaterThan(0);
  });

  /*
    Le tiret sépare le set du numéro dans une `printKey`. Un identifiant qui en
    contient — `tk-ex-latia`, `P-A` — n'en produit pas, et ces cartes ne sont
    donc adressables par aucun chemin. La moisson les compte à part plutôt que
    de les mêler aux vraies pannes.
  */
  it("ne stocke que des clés de tirage lisibles", () => {
    const rows = searchTcgdexRows("pikachu", { limit: 20 });
    expect(
      rows.every((row) => /^pokemon:[^:]+-[^-]+$/.test(row.printKey)),
    ).toBe(true);
  });
});
