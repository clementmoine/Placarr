import { describe, expect, it } from "vitest";

import { mergeMetadataFactsForStorage } from "./metadataFactsMerge";
import { normalizeProviderSourceKey } from "./providerExternalLinks";

describe("mergeMetadataFactsForStorage", () => {
  it("preserves existing genre when refresh omits it", () => {
    const existing = [
      {
        kind: "genre" as const,
        label: "Thèmes Booknode",
        value: "Bande dessinée",
        source: "booknode",
      },
    ];
    const incoming = [
      {
        kind: "external-link" as const,
        label: "Booknode",
        value: "Voir la fiche",
        url: "https://booknode.com/example",
        source: "booknode",
      },
    ];

    const merged = mergeMetadataFactsForStorage(existing, incoming);
    expect(
      merged.some(
        (fact) => fact.kind === "genre" && fact.source === "booknode",
      ),
    ).toBe(true);
  });

  it("preserves existing external-link when refresh omits it", () => {
    const existing = [
      {
        kind: "external-link" as const,
        label: "Bédéthèque",
        value: "Voir la fiche",
        url: "https://www.bedetheque.com/BD-example.html",
        source: "bedetheque",
      },
    ];
    const incoming = [
      {
        kind: "genre" as const,
        label: "Thèmes Booknode",
        value: "Humour",
        source: "booknode",
      },
    ];

    const merged = mergeMetadataFactsForStorage(existing, incoming);
    expect(
      merged.some(
        (fact) =>
          fact.kind === "external-link" &&
          fact.url === "https://www.bedetheque.com/BD-example.html",
      ),
    ).toBe(true);
  });

  it("preserves price facts until the same provider contributes fresh prices", () => {
    const existing = [
      {
        kind: "price" as const,
        label: "Occasion dès",
        value: "11,00 €",
        source: "booknode",
      },
    ];
    const incoming = [
      {
        kind: "genre" as const,
        label: "Thèmes Booknode",
        value: "Humour",
        source: "booknode",
      },
    ];

    const merged = mergeMetadataFactsForStorage(existing, incoming);
    expect(
      merged.some(
        (fact) => fact.kind === "price" && fact.value === "11,00 €",
      ),
    ).toBe(true);
  });

  it("replaces price facts when the same provider emits new prices", () => {
    const existing = [
      {
        kind: "price" as const,
        label: "Occasion dès",
        value: "11,00 €",
        source: "booknode",
      },
    ];
    const incoming = [
      {
        kind: "price" as const,
        label: "Occasion dès",
        value: "9,50 €",
        source: "booknode",
      },
    ];

    const merged = mergeMetadataFactsForStorage(existing, incoming);
    expect(
      merged.filter(
        (fact) => fact.kind === "price" && fact.source === "booknode",
      ),
    ).toEqual([
      expect.objectContaining({ value: "9,50 €" }),
    ]);
  });

  it("incoming external-link replaces stale link from the same provider", () => {
    const existing = [
      {
        kind: "external-link" as const,
        label: "Bédéthèque",
        value: "Voir la fiche",
        url: "https://www.bedetheque.com/old.html",
        source: "bedetheque",
      },
    ];
    const incoming = [
      {
        kind: "external-link" as const,
        label: "Bédéthèque",
        value: "Voir la fiche",
        url: "https://www.bedetheque.com/new.html",
        source: "bedetheque",
      },
    ];

    const merged = mergeMetadataFactsForStorage(existing, incoming);
    expect(
      merged.filter(
        (fact) =>
          fact.kind === "external-link" &&
          normalizeProviderSourceKey(fact.source ?? "") === "bedetheque",
      ),
    ).toEqual([expect.objectContaining({ url: "https://www.bedetheque.com/new.html" })]);
  });
});
