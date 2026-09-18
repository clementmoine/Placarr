import { describe, expect, it } from "vitest";

import {
  finalizeSetOptions,
  isAnsweredQuery,
  pickCatalogueSetName,
  pickCatalogueSetNameByCount,
  setScopedWhere,
} from "./sets";

/*
  Ces trois traitements avaient été écrits une fois par pack — cinq fois pour la
  clause SQL, sept pour le tri — et avaient déjà divergé : l'un laissait passer
  un set nommé `-`, l'autre rendait deux entrées rigoureusement identiques.
*/
describe("pickCatalogueSetName", () => {
  it("ignore un tiret décoratif face au vrai libellé promo", () => {
    expect(pickCatalogueSetName(["-", "Promotion Cartes", "Promotion Cartes"])).toBe(
      "Promotion Cartes",
    );
    expect(
      pickCatalogueSetNameByCount([
        { name: "-", count: 1 },
        { name: "Promotion Cartes", count: 889 },
      ]),
    ).toBe("Promotion Cartes");
  });

  it("rend null quand aucun nom n'est utilisable", () => {
    expect(pickCatalogueSetName(["-", " ", null])).toBeNull();
  });
});

describe("finalizeSetOptions", () => {
  it("retombe sur le code quand le nom ne se choisit pas", () => {
    expect(finalizeSetOptions([{ id: "fb01", label: "-" }])).toEqual([
      { id: "fb01", label: "FB01" },
    ]);
    expect(finalizeSetOptions([{ id: "fb01", label: "   " }])).toEqual([
      { id: "fb01", label: "FB01" },
    ]);
  });

  /*
    Le code d'abord : BT1 / TB1 / FB01 se lisent sur la carte, et plusieurs
    extensions DBS partagent aujourd'hui le même titre marketing — sans
    préfixe, la liste était illisible. Deux noms identiques n'ont plus besoin
    d'une parenthèse en fin de ligne.
  */
  it("préfixe le code set sur chaque libellé", () => {
    const rows = finalizeSetOptions([
      { id: "bt1", label: "Série 1 Booster ～GALACTIC BATTLE～" },
      { id: "tb1", label: "Tournament of Power" },
      { id: "fb01", label: "Awakened Pulse" },
    ]);
    expect(rows.map((row) => row.label)).toEqual([
      "BT1 — Série 1 Booster ～GALACTIC BATTLE～",
      "FB01 — Awakened Pulse",
      "TB1 — Tournament of Power",
    ]);
  });

  it("ne double pas un code déjà présent en tête de libellé", () => {
    expect(
      finalizeSetOptions([{ id: "bt1", label: "BT1 — Galactic Battle" }]),
    ).toEqual([{ id: "bt1", label: "BT1 — Galactic Battle" }]);
    expect(
      finalizeSetOptions([{ id: "promo", label: "Promo (off-series)" }]),
    ).toEqual([{ id: "promo", label: "PROMO — Promo (off-series)" }]);
  });

  it("départage les homonymes par le préfixe, sans parenthèse", () => {
    const rows = finalizeSetOptions([
      { id: "fb02", label: "Blazing Aura" },
      { id: "fs01", label: "Blazing Aura" },
      { id: "fb01", label: "Awakened Pulse" },
    ]);
    expect(rows.map((row) => row.label)).toEqual([
      "FB01 — Awakened Pulse",
      "FB02 — Blazing Aura",
      "FS01 — Blazing Aura",
    ]);
  });

  it("trie en français, et numériquement", () => {
    const rows = finalizeSetOptions([
      { id: "s10", label: "Série 10" },
      { id: "s2", label: "Série 2" },
      { id: "e", label: "Épée" },
    ]);
    // « S2 » avant « S10 », et l'accent ne rejette pas en fin de liste.
    expect(rows.map((row) => row.label)).toEqual([
      "E — Épée",
      "S2 — Série 2",
      "S10 — Série 10",
    ]);
  });

  it("ignore les lignes sans identifiant", () => {
    expect(finalizeSetOptions([{ id: "  ", label: "Fantôme" }])).toEqual([]);
  });

  it("accepte un code affiché distinct de l'id disque", () => {
    expect(
      finalizeSetOptions([
        {
          id: "tempete",
          code: "S11",
          label: "Série 11 — La Tempête Approche",
        },
      ]),
    ).toEqual([
      {
        id: "tempete",
        label: "S11 — Série 11 — La Tempête Approche",
      },
    ]);
  });
});

/*
  Le tri par libellé suppose que l'ordre se lit dedans. Il ne s'y lit pas
  toujours : les actes du 疾風伝 s'écrivent 第一幕…第四幕, et triés par texte ils
  sortaient dans l'ordre des codes des kanji — 一, 三, 二, 四.
*/
describe("finalizeSetOptions — rang donné par le pack", () => {
  it("orders by sortKey, not by what the label happens to spell", () => {
    const sets = finalizeSetOptions([
      { id: "b", label: "第三幕", sortKey: 3 },
      { id: "a", label: "第一幕", sortKey: 1 },
      { id: "d", label: "第四幕", sortKey: 4 },
      { id: "c", label: "第二幕", sortKey: 2 },
    ]);
    expect(sets.map((row) => row.id)).toEqual(["a", "c", "b", "d"]);
  });

  it("puts what has no rank last — a side series is not a fifth act", () => {
    const sets = finalizeSetOptions([
      { id: "gaku", label: "école" },
      { id: "maku2", label: "第二幕", sortKey: 2 },
      { id: "maku1", label: "第一幕", sortKey: 1 },
    ]);
    expect(sets.map((row) => row.id)).toEqual(["maku1", "maku2", "gaku"]);
  });

  it("still sorts by label when no pack gives a rank", () => {
    const sets = finalizeSetOptions([
      { id: "s10", label: "Série 10" },
      { id: "s2", label: "Série 2" },
    ]);
    expect(sets.map((row) => row.id)).toEqual(["s2", "s10"]);
  });

  /*
    Le rang est **rendu** à l'appelant depuis le 2026-08-21. Il était jeté en
    sortie, ce qui obligeait la check-list à retrier par libellé — et « Quest
    for Power », septième série, tombait sous Q.
  */
  it("hands the rank back to the caller", () => {
    const [set] = finalizeSetOptions([{ id: "a", label: "A", sortKey: 7 }]);
    expect(set.sortKey).toBe(7);
    // Sans rang, la clé reste absente plutôt que nulle.
    const [sans] = finalizeSetOptions([{ id: "b", label: "B" }]);
    expect("sortKey" in sans).toBe(false);
  });
});

describe("setScopedWhere", () => {
  /*
    Le cœur : une extension seule est une question complète. Sans ce chemin, un
    set choisi dans le sélecteur ne rendait rien.
  */
  it("borne au set quand il n'y a pas de mot-clé", () => {
    const { where, params } = setScopedWhere({
      setColumn: "p.set_code",
      setId: "S1",
    });
    expect(where).toContain("LOWER(p.set_code) = ?");
    expect(where).toContain("(1 = 1)");
    // Le set est normalisé en minuscules, comme la colonne l'est dans le SQL.
    expect(params).toEqual(["s1"]);
  });

  it("combine set et texte, paramètres dans l'ordre", () => {
    const { where, params } = setScopedWhere({
      setColumn: "p.set_code",
      setId: "s1",
      textClause: "LOWER(t.name) LIKE ? OR LOWER(p.number) LIKE ?",
      textParams: ["%elsa%", "%elsa%"],
    });
    expect(where).toContain("LOWER(p.set_code) = ?");
    expect(where).toContain("LOWER(t.name) LIKE ?");
    expect(params).toEqual(["s1", "%elsa%", "%elsa%"]);
  });

  it("neutralise l'axe inutilisé plutôt que de bâtir quatre requêtes", () => {
    const { where, params } = setScopedWhere({
      setColumn: "p.set_code",
      textClause: "LOWER(t.name) LIKE ?",
      textParams: ["%elsa%"],
    });
    expect(where.startsWith("1 = 1")).toBe(true);
    expect(params).toEqual(["%elsa%"]);
  });

  /* Un texte vide ne doit pas laisser traîner ses paramètres. */
  it("laisse tomber les paramètres d'une clause absente", () => {
    expect(
      setScopedWhere({
        setColumn: "p.set_code",
        setId: "s1",
        textClause: "",
        textParams: ["%orphelin%"],
      }).params,
    ).toEqual(["s1"]);
  });
});

describe("isAnsweredQuery", () => {
  it("refuse le vide, accepte l'un ou l'autre", () => {
    expect(isAnsweredQuery("", null)).toBe(false);
    expect(isAnsweredQuery("   ", "  ")).toBe(false);
    expect(isAnsweredQuery("elsa", null)).toBe(true);
    expect(isAnsweredQuery("", "s1")).toBe(true);
  });
});
