import { describe, expect, it } from "vitest";

import {
  listLorcanaTcgSets,
  lookupLorcanaTcgSearchRow,
  searchLorcanaTcgRows,
} from "./indexStore";

/**
 * Lorcana tenait déjà son catalogue sur disque — 3 241 tirages, 12 318 titres
 * en quatre langues — pendant que la recherche interrogeait les JSON distants
 * de lorcanajson.org. Deux sources pour une même question, donc deux vérités
 * possibles : une extension choisie dans le sélecteur ne rendait **rien**, les
 * identifiants n'étant pas les mêmes des deux côtés (`set1` contre `1`).
 *
 * Ces tests s'appuient sur la base locale : ils sautent d'eux-mêmes quand elle
 * n'a pas été moissonnée, plutôt que d'échouer sur une absence de données.
 */
const rows = searchLorcanaTcgRows("elsa", { limit: 5 });
const hasLocalCatalogue = listLorcanaTcgSets().length > 0;

describe.skipIf(!hasLocalCatalogue)("recherche Lorcana locale", () => {
  it("trouve par nom, sans réseau", () => {
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => /elsa/i.test(row.fullName))).toBe(true);
  });

  it("résout le fill Lorcast p2-36 par clé exacte", () => {
    const row = lookupLorcanaTcgSearchRow("lorcana:p2-36", { language: "en" });
    expect(row?.printKey).toBe("lorcana:p2-36");
    expect(row?.setName).toMatch(/Promo Set 2/i);
    expect(row?.number).toBe("36");
    expect(row?.foilTypesJson).toContain("Glitter");
  });

  /*
    Le cœur du correctif : une extension seule est une question complète.
    Sans requête, la recherche rendait zéro — et le sélecteur proposait donc
    des sets qu'aucun chemin ne savait ouvrir.
  */
  it("parcourt une extension sans mot-clé", () => {
    const sets = listLorcanaTcgSets("fr");
    expect(sets.length).toBeGreaterThan(0);
    const browsed = searchLorcanaTcgRows("", { setId: sets[0]!.id, limit: 10 });
    expect(browsed.length).toBeGreaterThan(0);
    expect(
      browsed.every(
        (row) => row.setCode?.toLowerCase() === sets[0]!.id.toLowerCase(),
      ),
    ).toBe(true);
  });

  /*
    Les libellés suivent la langue demandée. Un `MIN()` sur toutes les langues
    rendait le premier par ordre alphabétique — donc de l'anglais à un
    utilisateur français, alors que le nom français est dans la même table.
  */
  it("nomme les extensions dans la langue demandée", () => {
    const fr = new Map(listLorcanaTcgSets("fr").map((s) => [s.id, s.label]));
    const en = new Map(listLorcanaTcgSets("en").map((s) => [s.id, s.label]));
    const differing = [...fr.entries()].filter(
      ([id, label]) => en.get(id) && en.get(id) !== label,
    );
    expect(differing.length).toBeGreaterThan(0);
  });

  /*
    La colonne des teintes de vernis a été ajoutée après coup. Une base déjà
    écrite ne l'avait pas, et une colonne manquante fait échouer la requête
    **entière** : la recherche rendait zéro sans rien dire.
  */
  it("lit une base migrée sans se plaindre", () => {
    expect(() => searchLorcanaTcgRows("ariel", { limit: 3 })).not.toThrow();
  });
});
