import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { emptyProductsIndex, type SealedProductEntry } from "./indexFormat";
import {
  loadProductsIndexFromSqlite,
  writeProductsIndexToSqlite,
} from "./productsSqlite";

describe("productsSqlite", () => {
  let dir = "";

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it("round-trips products and content printKeys", () => {
    dir = mkdtempSync(path.join(os.tmpdir(), "placarr-products-sqlite-"));
    const dbPath = path.join(dir, "catalog.sqlite");
    const index = emptyProductsIndex("demo");
    const entry: SealedProductEntry = {
      slug: "booster-s1",
      path: "products/booster-s1",
      kind: "booster",
      behavior: "random",
      category: "booster",
      name: "Booster S1",
      image: null,
      imageBack: null,
      setLogo: null,
      setCode: "s1",
      lang: "fr",
      releaseDate: null,
      priceCents: 450,
      cardsPerPack: 5,
      packsContained: 1,
      guaranteedPrints: [],
      randomPoolScope: "set",
      randomPoolPrints: [],
      declaredCardCount: null,
      setCardCount: null,
      contentsKnown: true,
      containsPrintsIsPreview: false,
      prints: [
        {
          name: "Naruto",
          slug: "ni-0001",
          ref: "NI-001",
          printKey: "naruto:ni-0001",
          qty: 1,
        },
      ],
    };
    index.products["demo::booster-s1"] = entry;

    const written = writeProductsIndexToSqlite("demo", index, { dbPath });
    expect(written.products).toBe(1);
    expect(written.contents).toBe(1);

    const loaded = loadProductsIndexFromSqlite("demo", { dbPath });
    expect(loaded).not.toBeNull();
    expect(loaded!.products["demo::booster-s1"]?.prints[0]?.printKey).toBe(
      "naruto:ni-0001",
    );
    expect(loaded!.products["demo::booster-s1"]?.priceCents).toBe(450);
  });
});
