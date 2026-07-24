import { afterEach, describe, expect, it } from "vitest";

import { buildTokenDocumentFrequency } from "@/core/enrich/titles/tokenCorpusIdf";
import {
  __resetTokenCorpusIndexForTests,
  __setTokenCorpusIndexForTests,
} from "@/core/enrich/titles/tokenCorpusIndex";

import {
  isStrictTitleSubset,
  titleSpecificityTokens,
} from "./matchUtils";

describe("titleSpecificityTokens + corpus IDF", () => {
  afterEach(() => {
    __resetTokenCorpusIndexForTests();
  });
  const clusterTitles = [
    "Catan blister occasion",
    "Ticket to Ride blister FR",
    "Carcassonne occasion neuf",
    "Azul blister stock",
    "Splendor occasion",
    "Pandemic board game",
    "Mille Sabords Gigamic",
  ];

  it("drops corpus-generic chrome while keeping rare franchise tokens", () => {
    const stats = buildTokenDocumentFrequency(clusterTitles);
    const withoutStats = titleSpecificityTokens(
      "Mille Sabords blister occasion",
    );
    const withStats = titleSpecificityTokens(
      "Mille Sabords blister occasion",
      stats,
    );

    expect(withoutStats.has("blister")).toBe(true);
    expect(withoutStats.has("occasion")).toBe(true);
    expect(withStats.has("blister")).toBe(false);
    expect(withStats.has("occasion")).toBe(false);
    expect(withStats.has("mille")).toBe(true);
    expect(withStats.has("sabords")).toBe(true);
  });

  it("leaves default specificity unchanged when no stats are passed", () => {
    const tokens = titleSpecificityTokens("Ghost Recon Classics edition");
    expect(tokens.has("ghost")).toBe(true);
    expect(tokens.has("recon")).toBe(true);
    expect(tokens.has("edition")).toBe(false);
  });

  it("does not treat rare franchise overlap as a strict subset via chrome alone", () => {
    const stats = buildTokenDocumentFrequency(clusterTitles);
    // Without IDF, shared blister/occasion chrome can inflate overlap.
    expect(
      isStrictTitleSubset(
        "Catan blister",
        "Catan blister occasion deluxe",
        stats,
      ),
    ).toBe(false);
  });

  it("builds in-memory cluster stats inside mergeDuplicateMatches path", () => {
    // Shared marketplace chrome must not make a short title look like a
    // strict subset of a longer chrome-padded listing when the batch itself
    // shows blister/occasion everywhere.
    const stats = buildTokenDocumentFrequency([
      ...clusterTitles,
      "Catan board",
      "Catan board blister occasion",
    ]);
    expect(titleSpecificityTokens("Catan blister", stats).has("blister")).toBe(
      false,
    );
    // Without IDF this would be a strict subset (blister/occasion pad the other).
    expect(
      isStrictTitleSubset("Catan board", "Catan board blister occasion", stats),
    ).toBe(false);
    expect(
      isStrictTitleSubset("Catan board", "Catan board blister occasion"),
    ).toBe(true);
  });
});
