import { describe, expect, it } from "vitest";

import { dedupeFacts, dedupeFieldEvidence } from "@/core/enrich/facts";
import type { MetadataFact } from "@/types/metadataProvider";

/**
 * Cas réel (7 Days to Die) : deux générations d'enrichissement coexistent en
 * base — HLTB autoritaire (« Histoire » 30 h / « Complétion » 284 h 34,
 * priorité 303) ET des durées IGDB historiquement mal attribuées à HLTB
 * (« Histoire + extras » / « Complétion » 187 h, priorité 76-78). Les kinds
 * divergent (`time-to-beat` vs `completion-time`) donc le dédup par
 * (kind, label, value) gardait tout → l'UI affichait deux « Complétion ».
 * Le dédup par créneau sémantique garantit UN fact temps principal + UN fact
 * complétion (priorité max), à l'écriture comme à la lecture.
 */
describe("dedupeFacts — provider slots", () => {
  it("collapses conflicting values from the same provider slot to the fresher row", () => {
    const deduped =
      dedupeFacts([
        {
          kind: "format",
          label: "Numéro",
          value: "11",
          source: "tcgdex",
          priority: 45,
        },
        {
          kind: "tag",
          label: "Type",
          value: "Pokémon",
          source: "tcgdex",
          priority: 31,
        },
        {
          kind: "format",
          label: "Numéro",
          value: "11/108",
          source: "tcgdex",
          priority: 45,
        },
        {
          kind: "tag",
          label: "Type",
          value: "Feu",
          source: "tcgdex",
          priority: 31,
        },
      ]) ?? [];

    expect(deduped.find((fact) => fact.label === "Numéro")?.value).toBe(
      "11/108",
    );
    expect(deduped.find((fact) => fact.label === "Type")?.value).toBe("Feu");
  });
});

describe("dedupeFieldEvidence — fact slots", () => {
  it("keeps one value per fact field+source, preferring the later row", () => {
    const deduped = dedupeFieldEvidence([
      {
        field: "format:Numéro",
        source: "tcgdex",
        value: "11",
        priority: 45,
      },
      {
        field: "format:Numéro",
        source: "tcgdex",
        value: "11/108",
        priority: 45,
      },
      {
        field: "cover",
        source: "tcgdex",
        value: "https://assets.tcgdex.net/a.png",
      },
      {
        field: "cover",
        source: "tcgdex",
        value: "/uploads/local.png",
      },
    ]);

    expect(
      deduped
        .filter((row) => row.field === "format:Numéro")
        .map((row) => row.value),
    ).toEqual(["11/108"]);
    expect(
      deduped.filter((row) => row.field === "cover").map((row) => row.value),
    ).toEqual(["https://assets.tcgdex.net/a.png", "/uploads/local.png"]);
  });
});

describe("dedupeFacts — créneaux temps de jeu", () => {
  const legacySevenDaysFacts: MetadataFact[] = [
    {
      kind: "time-to-beat",
      label: "Histoire",
      value: "30 h",
      source: "How Long to Beat",
      priority: 303,
    },
    {
      kind: "completion-time",
      label: "Complétion",
      value: "284 h 34",
      source: "How Long to Beat",
      priority: 303,
    },
    {
      kind: "time-to-beat",
      label: "Histoire + extras",
      value: "187 h",
      source: "How Long to Beat",
      confidence: 0.74,
      priority: 78,
    },
    {
      kind: "time-to-beat",
      label: "Complétion",
      value: "187 h",
      source: "How Long to Beat",
      confidence: 0.74,
      priority: 76,
    },
  ];

  it("garde un seul fact par créneau (principal / complétion), priorité max", () => {
    const deduped = dedupeFacts(legacySevenDaysFacts) ?? [];
    const timeFacts = deduped.filter((fact) =>
      ["duration", "time-to-beat", "completion-time"].includes(fact.kind),
    );

    expect(timeFacts).toHaveLength(2);
    expect(timeFacts.map((fact) => fact.value).sort()).toEqual([
      "284 h 34",
      "30 h",
    ]);
  });

  it("ne touche pas aux facts hors famille temps", () => {
    const facts: MetadataFact[] = [
      ...legacySevenDaysFacts,
      {
        kind: "genre",
        label: "Genre",
        value: "Survie",
        source: "IGDB",
        priority: 50,
      },
    ];
    const deduped = dedupeFacts(facts) ?? [];
    expect(deduped.some((fact) => fact.kind === "genre")).toBe(true);
  });

  it("sans complétion, garde le meilleur fact principal", () => {
    const facts: MetadataFact[] = [
      {
        kind: "time-to-beat",
        label: "Histoire",
        value: "12 h",
        source: "IGDB",
        priority: 80,
      },
      {
        kind: "time-to-beat",
        label: "Histoire + extras",
        value: "20 h",
        source: "IGDB",
        priority: 78,
      },
    ];
    const deduped = dedupeFacts(facts) ?? [];
    expect(deduped).toHaveLength(1);
    expect(deduped[0].value).toBe("12 h");
  });
});
