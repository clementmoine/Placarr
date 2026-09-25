import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { mergeCuratedSealedContents } from "./curatedContents";
import type { SealedProductEntry } from "./indexFormat";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
  vi.unstubAllEnvs();
});

function stubPack(packId: string, curated: unknown) {
  const root = mkdtempSync(path.join(os.tmpdir(), "curated-sealed-"));
  roots.push(root);
  vi.stubEnv("PLACARR_DATA_DIR", root);
  const dir = path.join(root, ...packId.split("/"), "curated");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    path.join(dir, "products-contents.json"),
    `${JSON.stringify(curated)}\n`,
  );
}

function entry(partial: Partial<SealedProductEntry> & { slug: string }): SealedProductEntry {
  return {
    path: "",
    kind: "booster",
    behavior: "random_pack",
    category: "boosters",
    name: partial.slug,
    image: null,
    imageBack: null,
    setLogo: null,
    setCode: null,
    lang: null,
    releaseDate: null,
    priceCents: null,
    cardsPerPack: null,
    packsContained: null,
    guaranteedPrints: [],
    randomPoolScope: "unknown",
    randomPoolPrints: [],
    declaredCardCount: null,
    setCardCount: null,
    contentsKnown: false,
    containsPrintsIsPreview: true,
    prints: [],
    ...partial,
  };
}

describe("mergeCuratedSealedContents", () => {
  it("applies byKind then sku overrides", () => {
    stubPack("lorcana", {
      version: 1,
      pack: "lorcana",
      updatedAt: "2026-08-26",
      byKind: {
        booster: {
          source: "test",
          verifiedAt: "2026-08-26",
          cardsPerPack: 12,
          packsContained: 1,
          randomPoolScope: "set",
        },
      },
      skus: {
        "special-booster": {
          source: "test",
          verifiedAt: "2026-08-26",
          cardsPerPack: 6,
          randomPoolScope: "listed",
          randomPoolPrintKeys: ["lorcana:1-1"],
        },
      },
    });
    const merged = mergeCuratedSealedContents("lorcana", {
      a: entry({ slug: "normal-booster" }),
      b: entry({ slug: "special-booster" }),
    });
    expect(merged.a?.cardsPerPack).toBe(12);
    expect(merged.a?.randomPoolScope).toBe("set");
    expect(merged.b?.cardsPerPack).toBe(6);
    expect(merged.b?.randomPoolScope).toBe("listed");
    expect(merged.b?.randomPoolPrints[0]?.printKey).toBe("lorcana:1-1");
  });

  it("applies blister_case byKind as pack_container with 24 packs", () => {
    stubPack("lorcana", {
      version: 1,
      pack: "lorcana",
      updatedAt: "2026-09-14",
      byKind: {
        blister_case: {
          source: "test",
          verifiedAt: "2026-09-14",
          packsContained: 24,
          randomPoolScope: "none",
          behavior: "pack_container",
          contentsKnown: false,
        },
      },
      skus: {},
    });
    const merged = mergeCuratedSealedContents("lorcana", {
      carton: entry({
        slug: "booster-blister-carton-demo",
        kind: "blister_case",
        behavior: "pack_container",
        category: "boosters-blister",
      }),
    });
    expect(merged.carton?.packsContained).toBe(24);
    expect(merged.carton?.randomPoolScope).toBe("none");
    expect(merged.carton?.behavior).toBe("pack_container");
  });

  it("applies structured guaranteedPrints with qty and finish", () => {
    stubPack("naruto/carddass", {
      version: 1,
      pack: "naruto/carddass",
      updatedAt: "2026-08-30",
      skus: {
        "starter-demo": {
          source: "test",
          verifiedAt: "2026-08-30",
          contentsKnown: true,
          guaranteedPrints: [
            { printKey: "naruto:ni-0001", qty: 2, finish: "holo" },
            { printKey: "naruto:ni-0002", qty: 1 },
          ],
        },
      },
    });
    const merged = mergeCuratedSealedContents("naruto/carddass", {
      a: entry({ slug: "starter-demo", kind: "deck", behavior: "known_bundle" }),
    });
    expect(merged.a?.guaranteedPrints).toEqual([
      {
        name: "naruto:ni-0001",
        slug: "naruto:ni-0001",
        ref: null,
        printKey: "naruto:ni-0001",
        qty: 2,
        finish: "holo",
      },
      {
        name: "naruto:ni-0002",
        slug: "naruto:ni-0002",
        ref: null,
        printKey: "naruto:ni-0002",
        qty: 1,
      },
    ]);
    expect(merged.a?.contentsKnown).toBe(true);
  });

  it("merges guaranteedProducts for multi-SKU bundles", () => {
    stubPack("naruto/carddass", {
      version: 1,
      pack: "naruto/carddass",
      updatedAt: "2026-09-09",
      skus: {
        "pack-demo": {
          source: "test",
          verifiedAt: "2026-09-09",
          contentsKnown: true,
          guaranteedProducts: [
            { slug: "starter-a", qty: 1 },
            { slug: "booster-s1", qty: 2 },
          ],
        },
      },
    });
    const merged = mergeCuratedSealedContents("naruto/carddass", {
      a: entry({
        slug: "pack-demo",
        kind: "deck_bundle",
        behavior: "mixed_bundle",
      }),
    });
    expect(merged.a?.guaranteedProducts).toEqual([
      { slug: "starter-a", qty: 1 },
      { slug: "booster-s1", qty: 2 },
    ]);
    expect(merged.a?.contentsKnown).toBe(true);
  });

  it("does not wipe ingest guaranteedPrints with empty curated keys", () => {
    stubPack("dragonball/cg", {
      version: 1,
      pack: "dragonball/cg",
      updatedAt: "2026-09-13",
      skus: {
        "sd01-the-awakening": {
          source: "legacy stub",
          verifiedAt: "2026-08-26",
          contentsKnown: false,
          guaranteedPrintKeys: [],
        },
      },
    });
    const existing = [
      {
        name: "x",
        slug: "x",
        ref: "sd1-01",
        printKey: "dbscg:sd1-01",
      },
    ];
    const merged = mergeCuratedSealedContents("dragonball/cg", {
      a: entry({
        slug: "sd01-the-awakening",
        kind: "deck",
        behavior: "known_bundle",
        guaranteedPrints: existing,
        contentsKnown: false,
      }),
    });
    expect(merged.a?.guaranteedPrints).toEqual(existing);
  });
});
