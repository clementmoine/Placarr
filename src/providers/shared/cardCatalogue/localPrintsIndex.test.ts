import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createLocalPrintsIndex } from "./localPrintsIndex";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
  vi.unstubAllEnvs();
});

function tmpDataRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "local-prints-"));
  roots.push(root);
  vi.stubEnv("PLACARR_DATA_DIR", root);
  return root;
}

describe("createLocalPrintsIndex", () => {
  it("bootstraps an empty catalogue without inventing a card", () => {
    tmpDataRoot();
    const index = createLocalPrintsIndex("naruto/ninja-ranks");
    const written = index.bootstrapEmpty();
    expect(written.cards).toBe(0);
    expect(fs.existsSync(index.dbPath())).toBe(true);
    expect(JSON.parse(fs.readFileSync(written.path, "utf8"))).toMatchObject({
      version: 1,
      pack: "naruto/ninja-ranks",
      cards: {},
    });
    expect(index.searchRows("naruto")).toEqual([]);
    expect(index.lookupRow("naruto:ni-0001")).toBeNull();
    expect(index.listSets()).toEqual([]);
  });

  it("does not treat an empty query as a question", () => {
    tmpDataRoot();
    const index = createLocalPrintsIndex("naruto/ultra-challenge");
    index.bootstrapEmpty();
    expect(index.searchRows("")).toEqual([]);
    expect(index.searchRows("   ")).toEqual([]);
  });

  it("upserts attested titles without inventing art", () => {
    tmpDataRoot();
    const index = createLocalPrintsIndex("naruto/ninja-ranks");
    index.writePrints([
      {
        printKey: "naruto:nr-0001",
        setCode: "nr",
        number: "0001",
        cardType: "nr",
        titles: [{ lang: "en", fullName: "Title Card" }],
      },
    ]);
    expect(index.lookupRow("naruto:nr-0001")).toMatchObject({
      fullName: "Title Card",
      art: null,
    });
    expect(index.searchRows("title")).toHaveLength(1);
    expect(index.listSets().map((row) => row.id)).toEqual(["nr"]);
  });

  it("records an attested face without inventing the others", () => {
    tmpDataRoot();
    const index = createLocalPrintsIndex("naruto/ninja-ranks");
    index.writePrints([
      {
        printKey: "naruto:sd-0001",
        setCode: "sd",
        number: "0001",
        cardType: "sd",
        titles: [{ lang: "en", fullName: "Naruto" }],
      },
    ]);
    index.writeAssets([
      { printKey: "naruto:sd-0001", lang: "en", art: "art.inkworks.jpg" },
    ]);
    expect(index.lookupRow("naruto:sd-0001")?.art).toBe("art.inkworks.jpg");
  });
});
