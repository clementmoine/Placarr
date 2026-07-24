import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  metadataFindUnique: vi.fn(),
  metadataUpdate: vi.fn(),
  fieldEvidenceFindMany: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    metadata: {
      findUnique: h.metadataFindUnique,
      update: h.metadataUpdate,
    },
    fieldEvidence: {
      findMany: h.fieldEvidenceFindMany,
    },
  },
}));

import {
  displayFactsFromFieldEvidence,
  syncMetadataDisplayFactsFromFieldEvidence,
} from "./metadataFactsProjection";

describe("displayFactsFromFieldEvidence", () => {
  it("projects genre and series rows from field evidence", () => {
    const facts = displayFactsFromFieldEvidence([
      {
        field: "genre:Thèmes Booknode",
        source: "booknode",
        value: "Bande dessinée • Walt Disney",
        priority: 26,
      },
      {
        field: "series:Série",
        source: "bedetheque",
        value: "Super Picsou Géant n°1",
        sourceUrl:
          "https://www.bedetheque.com/serie-11795-BD-Super-Picsou-Geant.html",
        priority: 30,
      },
      {
        field: "title",
        source: "booknode",
        value: "Super Picsou Géant n°1",
      },
    ]);

    expect(facts).toHaveLength(2);
    expect(facts[0]).toMatchObject({
      kind: "genre",
      label: "Thèmes Booknode",
      source: "booknode",
    });
    expect(facts[1]).toMatchObject({
      kind: "series",
      label: "Série",
      source: "bedetheque",
      url: "https://www.bedetheque.com/serie-11795-BD-Super-Picsou-Geant.html",
    });
  });

  it("skips facts already present for the same provider slot", () => {
    const facts = displayFactsFromFieldEvidence(
      [
        {
          field: "genre:Thèmes Booknode",
          source: "booknode",
          value: "Bande dessinée",
        },
      ],
      [
        {
          kind: "genre",
          label: "Thèmes Booknode",
          value: "Humour",
          source: "booknode",
        },
      ],
    );

    expect(facts).toHaveLength(0);
  });
});

describe("syncMetadataDisplayFactsFromFieldEvidence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("backfills missing display facts into metadata JSON", async () => {
    h.metadataFindUnique.mockResolvedValue({
      facts: JSON.stringify([
        {
          kind: "external-link",
          label: "Booknode",
          value: "Voir la fiche",
          url: "https://booknode.com/example",
          source: "booknode",
        },
      ]),
    });
    h.fieldEvidenceFindMany.mockResolvedValue([
      {
        field: "genre:Thèmes Booknode",
        source: "booknode",
        value: "Bande dessinée • Walt Disney",
        sourceUrl: null,
        priority: 26,
        confidence: null,
      },
      {
        field: "release-date:Parution",
        source: "bedetheque",
        value: "1983",
        sourceUrl: null,
        priority: 22,
        confidence: null,
      },
    ]);
    h.metadataUpdate.mockResolvedValue({});

    const merged = await syncMetadataDisplayFactsFromFieldEvidence({
      metadataId: "meta-1",
    });

    expect(h.metadataUpdate).toHaveBeenCalledTimes(1);
    expect(
      merged?.some(
        (fact) => fact.kind === "genre" && fact.source === "booknode",
      ),
    ).toBe(true);
    expect(
      merged?.some(
        (fact) => fact.kind === "release-date" && fact.value === "1983",
      ),
    ).toBe(true);
  });

  it("normalizes legacy tag facts for weight and estimate", async () => {
    h.metadataFindUnique.mockResolvedValue({
      facts: JSON.stringify([
        {
          kind: "tag",
          label: "Poids",
          value: "390 g",
          source: "bedetheque",
        },
        {
          kind: "tag",
          label: "Estimation",
          value: "de 5 à 10 euros",
          source: "bedetheque",
        },
      ]),
    });
    h.fieldEvidenceFindMany.mockResolvedValue([]);
    h.metadataUpdate.mockResolvedValue({});

    const merged = await syncMetadataDisplayFactsFromFieldEvidence({
      metadataId: "meta-1",
    });

    expect(h.metadataUpdate).toHaveBeenCalledTimes(1);
    expect(merged?.find((fact) => fact.kind === "weight")?.value).toBe("390 g");
    expect(merged?.find((fact) => fact.kind === "price" && fact.label === "Estimation")?.value).toBe(
      "de 5 à 10 euros",
    );
  });

  it("normalizes legacy estimate kind to price", async () => {
    h.metadataFindUnique.mockResolvedValue({
      facts: JSON.stringify([
        {
          kind: "estimate",
          label: "Estimation",
          value: "de 5 à 10 euros",
          source: "bedetheque",
        },
        {
          kind: "price",
          label: "Estimation",
          value: "de 5 à 10 euros",
          source: "bedetheque",
        },
      ]),
    });
    h.fieldEvidenceFindMany.mockResolvedValue([]);
    h.metadataUpdate.mockResolvedValue({});

    const merged = await syncMetadataDisplayFactsFromFieldEvidence({
      metadataId: "meta-1",
    });

    const estimates = merged?.filter(
      (fact) => fact.label === "Estimation" && fact.value === "de 5 à 10 euros",
    );
    expect(estimates).toHaveLength(1);
    expect(estimates?.[0]?.kind).toBe("price");
  });

  it("purges contradicted marketplace links already on the metadata row", async () => {
    h.metadataFindUnique.mockResolvedValue({
      facts: JSON.stringify([
        {
          kind: "external-link",
          label: "Back Market",
          value: "Voir la fiche",
          url: "https://www.backmarket.fr/fr-fr/p/console-sony-playstation-1/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
          source: "backmarket",
        },
        {
          kind: "genre",
          label: "Type",
          value: "Console",
          source: "backmarket",
        },
      ]),
    });
    h.fieldEvidenceFindMany.mockResolvedValue([]);
    h.metadataUpdate.mockResolvedValue({});

    const merged = await syncMetadataDisplayFactsFromFieldEvidence({
      metadataId: "meta-1",
      itemTitle: "PlayStation 5",
      shelfType: "hardware",
    });

    expect(h.metadataUpdate).toHaveBeenCalledTimes(1);
    expect(
      merged?.some(
        (fact) =>
          fact.kind === "external-link" &&
          fact.url?.includes("playstation-1"),
      ),
    ).toBe(false);
    expect(merged?.some((fact) => fact.kind === "genre")).toBe(true);
  });
});
