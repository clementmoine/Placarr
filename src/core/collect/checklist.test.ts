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

  /** Une check-list se lit pour savoir où il reste du travail. */
  it("puts the least complete sets first, the biggest first on a tie", () => {
    const list = buildShelfChecklist({
      sets: [
        { id: "plein", label: "Plein" },
        { id: "vide-petit", label: "Vide petit" },
        { id: "vide-gros", label: "Vide gros" },
      ],
      prints: [
        print("a", "plein", "A"),
        print("b", "vide-petit", "B"),
        print("c", "vide-gros", "C"),
        print("d", "vide-gros", "D"),
      ],
      owned: new Set(["a"]),
    });
    expect(list.sets.map((s) => s.id)).toEqual([
      "vide-gros",
      "vide-petit",
      "plein",
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
      prints: [print("a", "s", "NI-010"), print("b", "s", "NI-002")],
      owned: new Set(),
    });
    expect(list.sets[0].missing.map((m) => m.reference)).toEqual([
      "NI-002",
      "NI-010",
    ]);
  });
});
