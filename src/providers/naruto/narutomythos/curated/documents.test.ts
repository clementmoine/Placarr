import { describe, expect, it } from "vitest";

import { loadMythosCuratedDocuments } from "./documents";

describe("mythos curated documents", () => {
  it("lists the four CICABOOM rulebook / tournament PDFs (CDN URLs)", () => {
    const docs = loadMythosCuratedDocuments();
    expect(docs).toHaveLength(4);
    expect(docs.map((d) => d.kind).sort()).toEqual([
      "op",
      "penalty",
      "rulebook",
      "rulebook",
    ]);
    expect(docs.filter((d) => d.lang === "fr")).toHaveLength(1);
    expect(docs.filter((d) => d.lang === "en")).toHaveLength(3);
    for (const doc of docs) {
      expect(doc.url).toContain("irp.cdn-website.com/99e556bf/");
      expect(doc.localPath).toBeUndefined();
    }
  });
});
