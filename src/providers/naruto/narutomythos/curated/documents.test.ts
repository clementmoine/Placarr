import { describe, expect, it } from "vitest";

import { loadMythosCuratedDocuments } from "./documents";

describe("mythos curated documents", () => {
  it("lists CICABOOM rulebooks, tournament PDFs, checklists, and brand sheets", () => {
    const docs = loadMythosCuratedDocuments();
    expect(docs.length).toBeGreaterThanOrEqual(4);
    const kinds = new Set(docs.map((d) => d.kind));
    expect(kinds.has("rulebook")).toBe(true);
    expect(kinds.has("op")).toBe(true);
    expect(kinds.has("penalty")).toBe(true);
    expect(docs.some((d) => d.lang === "fr")).toBe(true);
    expect(docs.some((d) => d.lang === "en")).toBe(true);
    for (const doc of docs) {
      expect(doc.url.length).toBeGreaterThan(8);
    }
  });
});
