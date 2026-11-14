import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { resolveNarutoDiskArtFilename } from "../diskArtAttachments";

import { materializePeerRetailFaces } from "./materializePeerRetailFaces";

function tempCardsRoot(): string {
  return mkdtempSync(path.join(tmpdir(), "peer-faces-"));
}

function writeArt(cardsRoot: string, lang: string, set: string, card: string) {
  const dir = path.join(cardsRoot, lang, set, card);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "art.carddass.jpg"), "fake");
}

describe("materializePeerRetailFaces", () => {
  it("copies S2 art onto S3 when S3 folder lacks a recto", () => {
    const root = tempCardsRoot();
    writeArt(root, "fr", "s2", "ni0079");
    mkdirSync(path.join(root, "fr", "s3", "ni0079"), { recursive: true });

    const { installed, skipped } = materializePeerRetailFaces(root, {
      checklistSetsForNumber: () => [],
    });
    expect(installed).toContain("fr/s3/ni0079");
    expect(skipped).toContain("fr/s2/ni0079");
    expect(
      resolveNarutoDiskArtFilename(path.join(root, "fr", "s3", "ni0079")),
    ).toBe("art.carddass.jpg");
  });

  it("never copies S1 art into S2–S5", () => {
    const root = tempCardsRoot();
    writeArt(root, "fr", "s1", "ni0079");
    mkdirSync(path.join(root, "fr", "s2", "ni0079"), { recursive: true });

    const { installed } = materializePeerRetailFaces(root, {
      checklistSetsForNumber: () => ["s1", "s2"],
    });
    expect(installed).toEqual([]);
    expect(
      resolveNarutoDiskArtFilename(path.join(root, "fr", "s2", "ni0079")),
    ).toBeNull();
  });

  it("creates a checklist peer folder from an earlier peer donor", () => {
    const root = tempCardsRoot();
    writeArt(root, "fr", "s3", "ni0079");

    const { installed } = materializePeerRetailFaces(root, {
      checklistSetsForNumber: (number) =>
        number.toLowerCase().includes("079") ? ["s3", "s4"] : [],
      deckSetsByCollector: new Map(),
    });
    expect(installed).toContain("fr/s4/ni0079");
    expect(
      resolveNarutoDiskArtFilename(path.join(root, "fr", "s4", "ni0079")),
    ).toBe("art.carddass.jpg");
  });

  it("copies S2→S4 when membership is deck-guarantee only (Temari NI-114)", () => {
    const root = tempCardsRoot();
    writeArt(root, "fr", "s2", "ni0114");

    const { installed } = materializePeerRetailFaces(root, {
      checklistSetsForNumber: () => ["s2"],
      deckSetsByCollector: new Map([["ni0114", new Set(["s2", "s4"])]]),
    });
    expect(installed).toContain("fr/s4/ni0114");
    expect(
      resolveNarutoDiskArtFilename(path.join(root, "fr", "s4", "ni0114")),
    ).toBe("art.carddass.jpg");
  });

  it("copies S5→S3 when only a later peer has art (bidirectional)", () => {
    const root = tempCardsRoot();
    writeArt(root, "fr", "s5", "ni0029");

    const { installed } = materializePeerRetailFaces(root, {
      checklistSetsForNumber: () => ["s1", "s5"],
      deckSetsByCollector: new Map([
        ["ni0029", new Set(["s1", "s3", "s5"])],
      ]),
    });
    expect(installed).toContain("fr/s3/ni0029");
    expect(
      resolveNarutoDiskArtFilename(path.join(root, "fr", "s3", "ni0029")),
    ).toBe("art.carddass.jpg");
  });
});
