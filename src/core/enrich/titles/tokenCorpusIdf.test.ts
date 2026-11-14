import { describe, expect, it } from "vitest";

import {
  buildTokenDocumentFrequency,
  isCorpusGenericToken,
  tokenIdf,
} from "./tokenCorpusIdf";

describe("tokenCorpusIdf", () => {
  const titles = [
    "Catan blister occasion",
    "Ticket to Ride blister FR",
    "Carcassonne occasion neuf",
    "Azul blister stock",
    "Splendor occasion",
    "Pandemic board game",
    "Mille Sabords Gigamic",
  ];

  it("counts document frequency once per title", () => {
    const stats = buildTokenDocumentFrequency([
      "blister blister blister",
      "autre blister",
    ]);
    expect(stats.docCount).toBe(2);
    expect(stats.documentFrequency.get("blister")).toBe(2);
  });

  it("treats frequent chrome as corpus-generic and rare franchise as signal", () => {
    const stats = buildTokenDocumentFrequency(titles);
    expect(isCorpusGenericToken("blister", stats)).toBe(true);
    expect(isCorpusGenericToken("occasion", stats)).toBe(true);
    expect(isCorpusGenericToken("sabords", stats)).toBe(false);
    expect(isCorpusGenericToken("mille", stats)).toBe(false);
  });

  it("keeps unknown / low-DF tokens as signal", () => {
    const stats = buildTokenDocumentFrequency(titles);
    expect(isCorpusGenericToken("zxqwv", stats)).toBe(false);
    expect(tokenIdf("zxqwv", stats)).toBeGreaterThan(
      tokenIdf("blister", stats),
    );
  });

  it("returns non-generic on empty corpus", () => {
    const stats = buildTokenDocumentFrequency([]);
    expect(stats.docCount).toBe(0);
    expect(isCorpusGenericToken("blister", stats)).toBe(false);
    expect(tokenIdf("blister", stats)).toBe(1);
  });
});
