import { describe, expect, it } from "vitest";

import {
  corpusStatusLabel,
  formatCorpusLastGrowth,
  formatIdentifyIndexes,
} from "./CatalogueCorporaPanel";
import type { CatalogueCorpusRow } from "@/lib/client/catalogueCorpora";

function row(
  status: CatalogueCorpusRow["status"],
): CatalogueCorpusRow {
  return {
    providerId: "onepiece",
    label: "One Piece",
    dataPack: "onepiece",
    supplyMode: "local_catalog",
    status,
  };
}

describe("formatCorpusLastGrowth", () => {
  it("omits empty growth", () => {
    expect(formatCorpusLastGrowth(null, true)).toBe("");
    expect(formatCorpusLastGrowth(undefined, true)).toBe("");
    expect(formatCorpusLastGrowth({}, true)).toBe("");
  });

  it("formats cards and sealed in FR / EN", () => {
    expect(formatCorpusLastGrowth({ cards: 42, products: 3 }, true)).toBe(
      " · 42 cartes · 3 scellés",
    );
    expect(formatCorpusLastGrowth({ cards: 42, products: 3 }, false)).toBe(
      " · 42 cards · 3 sealed",
    );
  });

  it("appends set totals, deltas and added set codes", () => {
    expect(
      formatCorpusLastGrowth(
        {
          cards: 100,
          cardsDelta: 5,
          sets: 12,
          setsDelta: 2,
          addedSets: ["op13", "op14"],
        },
        true,
      ),
    ).toBe(" · 100 cartes (+5) · 12 sets (+2): op13, op14");
  });
});

describe("formatIdentifyIndexes", () => {
  it("omits packs without visual faces", () => {
    expect(
      formatIdentifyIndexes(
        {
          visualEntries: 0,
          embeddingEntries: 0,
          embeddingModel: null,
          embeddingsStale: false,
          hasVisual: false,
        },
        true,
      ),
    ).toBe("");
  });

  it("flags stale CLIP coverage", () => {
    expect(
      formatIdentifyIndexes(
        {
          visualEntries: 1200,
          embeddingEntries: 0,
          embeddingModel: null,
          embeddingsStale: true,
          hasVisual: true,
        },
        true,
      ),
    ).toContain("à reconstruire");
  });
});

describe("corpusStatusLabel", () => {
  it("appends lastGrowth after sync timestamp", () => {
    const label = corpusStatusLabel(
      row({
        empty: false,
        stale: false,
        lastSyncAt: "2026-10-10T12:00:00.000Z",
        lastGrowth: { cards: 100, products: 2 },
      }),
      true,
    );
    expect(label).toContain("onepiece");
    expect(label).toContain("à jour");
    expect(label).toContain("100 cartes");
    expect(label).toContain("2 scellés");
  });

  it("appends identify index counts when present", () => {
    const base = row({
      empty: false,
      stale: false,
      lastSyncAt: null,
    });
    const label = corpusStatusLabel(
      {
        ...base,
        identifyIndexes: {
          visualEntries: 10,
          embeddingEntries: 10,
          embeddingModel: "Xenova/clip-vit-base-patch32",
          embeddingsStale: false,
          hasVisual: true,
        },
      },
      false,
    );
    expect(label).toContain("camera 10 vis · 10 CLIP");
  });
});
