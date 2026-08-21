/*
  Une check-list est une jointure : le catalogue dit ce qui existe, les items ce
  qu'on possède. Ce qui compte, c'est ce qu'elle refuse d'affirmer.
*/
import { describe, expect, it } from "vitest";

import { buildShelfChecklist, type ChecklistPrint } from "./checklist";

const print = (
  printKey: string,
  setId: string,
  reference: string,
): ChecklistPrint => ({
  printKey,
  setId,
  reference,
  title: reference,
});

describe("check-list d'étagère", () => {
  const prints = [
    print("k:1", "s1", "NI-001"),
    print("k:2", "s1", "NI-002"),
    print("k:3", "s1", "NI-003"),
    print("k:4", "s2", "NI-004"),
  ];
  const sets = [
    { id: "s1", label: "Série 1" },
    { id: "s2", label: "Série 2" },
  ];

  it("counts what exists against what is owned", () => {
    const list = buildShelfChecklist({
      sets,
      prints,
      owned: new Set(["k:1", "k:4"]),
    });
    expect(list.totals).toEqual({ total: 4, owned: 2, completion: 50 });
    const s1 = list.sets.find((s) => s.id === "s1")!;
    expect(s1.completion).toBe(33);
    expect(s1.missing.map((m) => m.reference)).toEqual(["NI-002", "NI-003"]);
  });

  /*
    Un set dont le catalogue ne tient aucune carte dans cette langue n'est pas
    « à 0 % » : c'est notre catalogue qui est incomplet, pas la collection. Les
    confondre annoncerait un manque qu'on ne peut pas mesurer.
  */
  it("separates 'you own none' from 'we hold none'", () => {
    const list = buildShelfChecklist({
      sets: [...sets, { id: "s24", label: "Sage's Legacy" }],
      prints,
      owned: new Set(),
    });
    expect(list.sets.map((s) => s.id)).not.toContain("s24");
    expect(list.setsWithoutCatalogue.map((s) => s.id)).toEqual(["s24"]);
    // Et un set vide ne compte pas dans le total, qui serait sinon faussé.
    expect(list.totals.total).toBe(4);
  });

  /*
    Trois états, pas un classement : rien commencé, en cours, terminé. Sur une
    étagère Lorcana où l'on ne suit que le Premier Chapitre, treize sets à 0 %
    noyaient le seul qui compte.
  */
  it("splits started, finished and never-started", () => {
    const list = buildShelfChecklist({
      sets: [
        { id: "encours", label: "En cours" },
        { id: "fini", label: "Fini" },
        { id: "jamais", label: "Jamais commencé" },
      ],
      prints: [
        print("a", "encours", "A"),
        print("b", "encours", "B"),
        print("c", "fini", "C"),
        print("d", "jamais", "D"),
      ],
      owned: new Set(["a", "c"]),
    });
    expect(list.sets.map((s) => s.id)).toEqual(["encours"]);
    expect(list.completedSets.map((s) => s.id)).toEqual(["fini"]);
    expect(list.untouchedSets.map((s) => s.id)).toEqual(["jamais"]);
    // Tous comptent dans le total : ce sont des cartes qui existent.
    expect(list.totals.total).toBe(4);
  });

  /** Un set à 99 % reste en cours : c'est le zéro manquant qui le termine. */
  it("calls a set finished only when nothing is missing", () => {
    const prints = Array.from({ length: 100 }, (_, i) =>
      print(`k${i}`, "s", `${i}`),
    );
    const list = buildShelfChecklist({
      sets: [{ id: "s", label: "S" }],
      prints,
      owned: new Set(prints.slice(0, 99).map((p) => p.printKey)),
    });
    expect(list.sets[0]?.completion).toBe(99);
    expect(list.completedSets).toHaveLength(0);
  });

  /*
    « Quest for Power » est la septième série, et son nom ne l'annonce pas :
    trié par libellé il tombe sous Q, entre « Path of Pain » et « Revenge ».
    Le rang le remet où il est sorti.
  */
  it("orders by the rank when the label does not carry it", () => {
    const list = buildShelfChecklist({
      sets: [
        { id: "s7", label: "Quest for Power", sortKey: 7 },
        { id: "s1", label: "Série 1", sortKey: 1 },
        { id: "s19", label: "Path of Pain", sortKey: 19 },
      ],
      prints: [
        print("a", "s7", "A"),
        print("b", "s1", "B"),
        print("c", "s19", "C"),
      ],
      owned: new Set(["a", "b", "c"]),
    });
    expect(list.completedSets.map((s) => s.id)).toEqual(["s1", "s7", "s19"]);
  });

  it("falls back to a numeric alphabetical order without a rank", () => {
    const list = buildShelfChecklist({
      sets: [
        { id: "b", label: "Série 10" },
        { id: "a", label: "Série 2" },
      ],
      prints: [print("x", "b", "X"), print("y", "a", "Y")],
      owned: new Set(["x", "y"]),
    });
    expect(list.completedSets.map((s) => s.label)).toEqual([
      "Série 2",
      "Série 10",
    ]);
  });

  it("says zero rather than NaN on an empty shelf", () => {
    const list = buildShelfChecklist({
      sets: [],
      prints: [],
      owned: new Set(),
    });
    expect(list.totals).toEqual({ total: 0, owned: 0, completion: 0 });
  });

  it("orders the missing by their printed reference, numerically", () => {
    const list = buildShelfChecklist({
      sets: [{ id: "s", label: "S" }],
      prints: [
        print("a", "s", "NI-010"),
        print("b", "s", "NI-002"),
        print("c", "s", "NI-001"),
      ],
      // Une carte possédée, sinon le set part chez les non entamés.
      owned: new Set(["c"]),
    });
    expect(list.sets[0].missing.map((m) => m.reference)).toEqual([
      "NI-002",
      "NI-010",
    ]);
  });
});
