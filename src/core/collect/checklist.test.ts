/*
  Une check-list est une jointure : le catalogue dit ce qui existe, les items ce
  qu'on possède. Ce qui compte, c'est ce qu'elle refuse d'affirmer.
*/
import { describe, expect, it } from "vitest";

import {
  buildShelfChecklist,
  checklistOwnedKey,
  checklistSetOwnedKey,
  compareChecklistPrints,
  referenceWithinSet,
  resolveMasterSetOwned,
  type ChecklistPrint,
} from "./checklist";

const print = (
  printKey: string,
  setId: string,
  reference: string,
  finish?: string | null,
): ChecklistPrint => ({
  printKey,
  setId,
  reference,
  title: reference,
  ...(finish !== undefined ? { finish } : {}),
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
    Une seule liste, ordre de sortie — l'état se lit sur owned / completion /
    missing, pas sur un découpage en groupes.
  */
  it("keeps started, finished and never-started in one release-ordered list", () => {
    const list = buildShelfChecklist({
      sets: [
        { id: "encours", label: "En cours", sortKey: 2 },
        { id: "fini", label: "Fini", sortKey: 1 },
        { id: "jamais", label: "Jamais commencé", sortKey: 3 },
      ],
      prints: [
        print("a", "encours", "A"),
        print("b", "encours", "B"),
        print("c", "fini", "C"),
        print("d", "jamais", "D"),
      ],
      owned: new Set(["a", "c"]),
    });
    expect(list.sets.map((s) => s.id)).toEqual(["fini", "encours", "jamais"]);
    expect(list.sets.map((s) => s.completion)).toEqual([100, 50, 0]);
    expect(list.sets.find((s) => s.id === "jamais")?.missing).toHaveLength(1);
    // Tous comptent dans le total : ce sont des cartes qui existent.
    expect(list.totals.total).toBe(4);
  });

  /** Un set à 99 % n'est pas fini : c'est le zéro manquant qui le termine. */
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
    expect(list.sets[0]?.missing).toHaveLength(1);
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
    expect(list.sets.map((s) => s.id)).toEqual(["s1", "s7", "s19"]);
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
    expect(list.sets.map((s) => s.label)).toEqual(["Série 2", "Série 10"]);
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
      owned: new Set(["c"]),
    });
    expect(list.sets[0].missing.map((m) => m.reference)).toEqual([
      "NI-002",
      "NI-010",
    ]);
    expect(list.sets[0].cards.map((c) => [c.reference, c.owned])).toEqual([
      ["NI-001", true],
      ["NI-002", false],
      ["NI-010", false],
    ]);
  });

  it("keeps groups apart before comparing ranks", () => {
    const list = buildShelfChecklist({
      sets: [
        { id: "maki1", label: "巻ノ一", group: "Japon", sortKey: 1 },
        { id: "s1", label: "Série 1", group: "Europe", sortKey: 1 },
        { id: "s2", label: "Série 2", group: "Europe", sortKey: 2 },
      ],
      prints: [
        print("a", "maki1", "A"),
        print("b", "s1", "B"),
        print("c", "s2", "C"),
      ],
      owned: new Set(["a", "b", "c"]),
    });
    expect(list.sets.map((s) => s.id)).toEqual(["s1", "s2", "maki1"]);
  });
});

/*
  Les providers rendent une référence qui se suffit hors contexte — nom de
  l'extension compris. Dans une liste déjà titrée par ce nom, elle le répète à
  chaque ligne : « Premier Chapitre · 21/P1 » dans un bloc « Premier Chapitre ».
*/
describe("la référence dans son set", () => {
  it("drops the set name the block already carries", () => {
    expect(
      referenceWithinSet("Premier Chapitre · 21/P1", "Premier Chapitre"),
    ).toBe("21/P1");
    expect(
      referenceWithinSet("Premier Chapitre 205/204", "Premier Chapitre"),
    ).toBe("205/204");
  });

  it("strips against a code-prefixed set label (checklist selector)", () => {
    expect(
      referenceWithinSet("Premier Chapitre · 211/204", "1 — Premier Chapitre"),
    ).toBe("211/204");
    expect(
      referenceWithinSet(
        "Série 1 — Maître Hokage / Pays du Vent · NI-019",
        "S1 — Série 1 — Maître Hokage / Pays du Vent",
      ),
    ).toBe("NI-019");
  });

  it("leaves alone a reference that does not start with it", () => {
    expect(referenceWithinSet("NI-046", "Série 1")).toBe("NI-046");
  });

  /** Ne jamais rendre vide : une carte sans référence ne s'identifie plus. */
  it("never strips a reference down to nothing", () => {
    expect(referenceWithinSet("Série 1", "Série 1")).toBe("Série 1");
  });
});

/*
  Les promos d'un set (grouping dans le printKey) sortent après le retail —
  utile à l'intérieur d'une série Promo Year N.
*/
describe("ordre retail puis promos", () => {
  it("parks grouped prints after retail, grouping A→Z", () => {
    const list = buildShelfChecklist({
      sets: [{ id: "p1", label: "P1 — Promo Year 1" }],
      prints: [
        print("lorcana:1-20-p1", "p1", "20/P1"),
        print("lorcana:1-21-p1", "p1", "21/P1"),
        print("lorcana:1-1-p1", "p1", "1/P1"),
        print("lorcana:1-5-p1", "p1", "5/P1"),
      ],
      owned: new Set(),
    });
    expect(list.sets[0]!.cards.map((c) => c.reference)).toEqual([
      "1/P1",
      "5/P1",
      "20/P1",
      "21/P1",
    ]);
  });

  it("compareChecklistPrints is stable for plain retail", () => {
    expect(
      compareChecklistPrints(
        print("lorcana:1-2", "1", "2/204"),
        print("lorcana:1-10", "1", "10/204"),
      ),
    ).toBeLessThan(0);
  });

  it("compareChecklistPrints follows Naruto family binder order", async () => {
    // Registers the `naruto` printKey compare hook (Client → Ninja → …).
    await import("@/providers/naruto/narutocarddass/identity");
    const sorted = [
      print("naruto:ta-0001", "s1", "TA-001"),
      print("naruto:te-0001", "s1", "TE-001"),
      print("naruto:ni-0001", "s1", "NI-001"),
      print("naruto:cl-0001", "s1", "CL-001"),
    ].sort(compareChecklistPrints);
    expect(sorted.map((p) => p.reference)).toEqual([
      "CL-001",
      "NI-001",
      "TE-001",
      "TA-001",
    ]);
  });

  /*
    Master set : foil et normale sont deux cases. Posséder l'une ne coche
    pas l'autre — c'est le sens d'un master set.
  */
  it("master set treats each finish as its own slot", () => {
    const list = buildShelfChecklist({
      sets: [{ id: "s1", label: "Série 1" }],
      prints: [
        print("k:1", "s1", "NI-001", "None"),
        print("k:1", "s1", "NI-001", "Silver"),
        print("k:2", "s1", "NI-002", "None"),
        print("k:2", "s1", "NI-002", "Silver"),
      ],
      owned: new Set([
        checklistOwnedKey("k:1", "Silver"),
        checklistOwnedKey("k:2", "None"),
      ]),
      masterSet: true,
    });
    expect(list.totals).toEqual({ total: 4, owned: 2, completion: 50 });
    const cards = list.sets[0]!.cards;
    expect(
      cards.map((c) => `${c.reference}|${c.finish}|${c.owned}`),
    ).toEqual([
      "NI-001|None|false",
      "NI-001|Silver|true",
      "NI-002|None|true",
      "NI-002|Silver|false",
    ]);
    expect(list.sets[0]!.missing.map((m) => `${m.reference}|${m.finish}`)).toEqual([
      "NI-001|None",
      "NI-002|Silver",
    ]);
  });

  /*
    Items ajoutés avant le sélecteur de finish : variant null → `printKey|`.
    On ne devine pas None : une foil non taguée ne doit pas cocher la normale.
  */
  it("resolveMasterSetOwned does not invent a plain finish for blank variant", () => {
    const owned = resolveMasterSetOwned({
      owned: new Set([
        checklistOwnedKey("lorcana:1-1", null),
        checklistOwnedKey("lorcana:1-2", "Silver"),
      ]),
      finishesByPrintKey: new Map([
        ["lorcana:1-1", ["None", "Silver"]],
        ["lorcana:1-2", ["None", "Silver"]],
      ]),
      plainFinishesByPrintKey: new Map([
        ["lorcana:1-1", ["None"]],
        ["lorcana:1-2", ["None"]],
      ]),
    });
    expect(owned.has(checklistOwnedKey("lorcana:1-1", null))).toBe(true);
    expect(owned.has(checklistOwnedKey("lorcana:1-1", "None"))).toBe(false);
    expect(owned.has(checklistOwnedKey("lorcana:1-2", "Silver"))).toBe(true);

    const list = buildShelfChecklist({
      sets: [{ id: "1", label: "Premier Chapitre" }],
      prints: [
        print("lorcana:1-1", "1", "1/204", "None"),
        print("lorcana:1-1", "1", "1/204", "Silver"),
        print("lorcana:1-2", "1", "2/204", "None"),
        print("lorcana:1-2", "1", "2/204", "Silver"),
      ],
      owned,
      masterSet: true,
    });
    expect(list.totals).toEqual({ total: 4, owned: 1, completion: 25 });
  });

  it("without master set, any finish of a printKey counts once", () => {
    const list = buildShelfChecklist({
      sets: [{ id: "s1", label: "Série 1" }],
      prints: [print("k:1", "s1", "NI-001"), print("k:2", "s1", "NI-002")],
      owned: new Set(["k:1"]),
      masterSet: false,
    });
    expect(list.totals.owned).toBe(1);
    expect(list.sets[0]!.cards.find((c) => c.printKey === "k:1")!.owned).toBe(
      true,
    );
  });

  it("checklistOwnedKey folds printKey and finish", () => {
    expect(checklistOwnedKey("K:1", " Silver ")).toBe("k:1|silver");
    expect(checklistOwnedKey("k:1", null)).toBe("k:1|");
  });

  it("does not treat distinct art letters as the same owned card", () => {
    const list = buildShelfChecklist({
      sets: [
        { id: "part1", label: "Série 1", sortKey: 1 },
        { id: "part9", label: "Série 9", sortKey: 9 },
      ],
      prints: [
        print("dbsjcc:part1-d0123a", "part1", "D-123a"),
        print("dbsjcc:part9-d0123d", "part9", "D-123d"),
      ],
      owned: new Set(["dbsjcc:part1-d0123a"]),
    });
    expect(list.totals.owned).toBe(1);
    expect(
      list.sets.flatMap((s) => s.cards).find((c) => c.printKey.endsWith("d0123d"))
        ?.owned,
    ).toBe(false);
  });

  it("does not cross-own Lorcana cards that reuse numbers across sets", () => {
    const list = buildShelfChecklist({
      sets: [
        { id: "1", label: "Ch1", sortKey: 1 },
        { id: "2", label: "Ch2", sortKey: 2 },
      ],
      prints: [
        print("lorcana:1-1", "1", "1/204"),
        print("lorcana:2-1", "2", "1/204"),
      ],
      owned: new Set(["lorcana:1-1"]),
    });
    expect(list.totals.owned).toBe(1);
    expect(
      list.sets.flatMap((set) => set.cards).find((c) => c.printKey === "lorcana:2-1")
        ?.owned,
    ).toBe(false);
  });

  it("set-scoped ownership does not cross sets for the same printKey", () => {
    const list = buildShelfChecklist({
      sets: [
        { id: "s1", label: "Série 1", sortKey: 1 },
        { id: "s5", label: "Série 5", sortKey: 5 },
      ],
      prints: [
        print("naruto:ni-0049", "s1", "NI-049"),
        print("naruto:ni-0049", "s5", "NI-049"),
      ],
      owned: new Set([checklistSetOwnedKey("s5", "naruto:ni-0049")]),
    });
    expect(list.totals.owned).toBe(1);
    expect(
      list.sets.find((s) => s.id === "s5")?.cards[0]?.owned,
    ).toBe(true);
    expect(
      list.sets.find((s) => s.id === "s1")?.cards[0]?.owned,
    ).toBe(false);
  });

  it("legacy owned printKey without set still counts in every listing", () => {
    const list = buildShelfChecklist({
      sets: [
        { id: "s1", label: "Série 1", sortKey: 1 },
        { id: "s5", label: "Série 5", sortKey: 5 },
      ],
      prints: [
        print("naruto:ni-0049", "s1", "NI-049"),
        print("naruto:ni-0049", "s5", "NI-049"),
      ],
      owned: new Set(["naruto:ni-0049"]),
    });
    expect(list.totals.owned).toBe(2);
  });

  it("set-scoped master set keeps finish and set", () => {
    const list = buildShelfChecklist({
      sets: [
        { id: "part1", label: "Série 1", sortKey: 1 },
        { id: "part9", label: "Série 9", sortKey: 9 },
      ],
      prints: [
        print("dbsjcc:part1-d0107", "part1", "D-107", "holo"),
        print("dbsjcc:part9-d0107", "part9", "D-107", "holo"),
        print("dbsjcc:part9-d0107", "part9", "D-107", "normal"),
      ],
      owned: new Set([
        checklistSetOwnedKey("part1", "dbsjcc:part1-d0107", "holo"),
      ]),
      masterSet: true,
    });
    expect(
      list.sets
        .flatMap((s) => s.cards)
        .filter((c) => c.owned)
        .map((c) => `${c.setId}|${c.finish}`),
    ).toEqual(["part1|holo"]);
  });

  it("checklistSetOwnedKey folds set, printKey and optional finish", () => {
    expect(checklistSetOwnedKey("S5", "Naruto:ni-0049")).toBe(
      "s5|naruto:ni-0049",
    );
    expect(checklistSetOwnedKey("s5", "naruto:ni-0049", "Holo")).toBe(
      "s5|naruto:ni-0049|holo",
    );
    expect(checklistSetOwnedKey(null, "naruto:ni-0049", "holo")).toBe(
      "naruto:ni-0049|holo",
    );
  });
});
