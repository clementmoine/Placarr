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

describe("faces sans titre dans leur langue", () => {
  it("les fait entrer dans l'index, avec l'image et sans nom", () => {
    // Le cas réel : un scan de l'édition française sous des titres anglais.
    // Avant, la jointure par langue le faisait disparaître — 262 faces du
    // Carddass étaient ainsi perdues, présentes en base et nulle part visibles.
    tmpDataRoot();
    const index = createLocalPrintsIndex("naruto/ninja-ranks");
    index.writePrints([
      {
        printKey: "naruto:nr-0040",
        setCode: "nr",
        number: "0040",
        cardType: "nr",
        titles: [{ lang: "en", fullName: "Rock Lee", rarity: null }],
      },
    ]);
    index.writeAssets([
      { printKey: "naruto:nr-0040", lang: "fr", art: "art.coleka.webp" },
    ]);

    const written = index.exportIndex();
    expect(written).not.toBeNull();
    const entry = (
      JSON.parse(fs.readFileSync(written!.path, "utf8")) as {
        cards: Record<
          string,
          { langs: Record<string, { name?: string; art?: string }> }
        >;
      }
    ).cards["naruto:nr-0040"];
    expect(entry.langs.en?.name).toBe("Rock Lee");
    expect(entry.langs.fr?.art).toBe("art.coleka.webp");
    expect(entry.langs.fr?.name).toBeUndefined();
  });

  it("laisse cohabiter plusieurs éditions sur un même tirage", () => {
    // Un scan français et un scan italien de la même carte, sous un titre
    // anglais : trois faits indépendants, et aucun n'écrase les autres.
    tmpDataRoot();
    const index = createLocalPrintsIndex("naruto/ninja-ranks");
    index.writePrints([
      {
        printKey: "naruto:nr-0044",
        setCode: "nr",
        number: "0044",
        cardType: "nr",
        titles: [{ lang: "en", fullName: "Guy", rarity: null }],
      },
    ]);
    index.writeAssets([
      { printKey: "naruto:nr-0044", lang: "fr", art: "art.coleka.webp" },
      { printKey: "naruto:nr-0044", lang: "it", art: "art.imadoki.jpg" },
    ]);

    const written = index.exportIndex();
    const entry = (
      JSON.parse(fs.readFileSync(written!.path, "utf8")) as {
        cards: Record<
          string,
          { langs: Record<string, { name?: string; art?: string }> }
        >;
      }
    ).cards["naruto:nr-0044"];
    expect(entry.langs.en?.name).toBe("Guy");
    expect(entry.langs.fr?.art).toBe("art.coleka.webp");
    expect(entry.langs.it?.art).toBe("art.imadoki.jpg");
  });
});
