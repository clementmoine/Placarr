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
});
