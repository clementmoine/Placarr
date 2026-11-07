import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";

import {
  buildCatalogLastGrowth,
  measureCatalogDbCorpus,
} from "./catalogCorpus";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("buildCatalogLastGrowth", () => {
  it("computes set deltas and addedSets from before/after snapshots", () => {
    expect(
      buildCatalogLastGrowth({
        before: {
          cards: 5,
          products: 1,
          sets: 1,
          setIds: ["s1"],
        },
        after: {
          cards: 10,
          products: 1,
          sets: 2,
          setIds: ["s1", "s2"],
        },
      }),
    ).toEqual({
      cards: 10,
      products: 1,
      sets: 2,
      cardsDelta: 5,
      setsDelta: 1,
      addedSets: ["s2"],
    });
  });

  it("falls back to pipeline totals when disk measure is empty", () => {
    expect(
      buildCatalogLastGrowth({
        pipeline: { cards: 42, products: 3 },
        before: { cards: 0, products: 0, sets: 0, setIds: [] },
        after: { cards: 0, products: 0, sets: 0, setIds: [] },
      }),
    ).toEqual({
      cards: 42,
      products: 3,
      cardsDelta: 42,
      productsDelta: 3,
    });
  });

  it("returns null when nothing changed and corpus stays empty", () => {
    expect(
      buildCatalogLastGrowth({
        before: { cards: 0, products: 0, sets: 0, setIds: [] },
        after: { cards: 0, products: 0, sets: 0, setIds: [] },
      }),
    ).toBeNull();
  });
});

describe("measureCatalogDbCorpus", () => {
  it("counts prints, products and distinct set codes", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "catalog-corpus-"));
    roots.push(root);
    const dbPath = path.join(root, "catalog.sqlite");
    const db = new DatabaseSync(dbPath);
    db.exec(`
      CREATE TABLE prints (
        print_key TEXT PRIMARY KEY,
        set_code TEXT NOT NULL
      );
      CREATE TABLE products (
        product_key TEXT PRIMARY KEY,
        entry_json TEXT
      );
      CREATE TABLE print_sets (
        print_key TEXT NOT NULL,
        set_code TEXT NOT NULL,
        PRIMARY KEY (print_key, set_code)
      );
    `);
    db.prepare(`INSERT INTO prints VALUES (?, ?)`).run("a", "s1");
    db.prepare(`INSERT INTO prints VALUES (?, ?)`).run("b", "s2");
    db.prepare(`INSERT INTO print_sets VALUES (?, ?)`).run("a", "s3");
    db.prepare(`INSERT INTO products VALUES (?, ?)`).run("p1", "{}");
    db.close();

    expect(measureCatalogDbCorpus(dbPath)).toEqual({
      cards: 2,
      products: 1,
      sets: 3,
      setIds: ["s1", "s2", "s3"],
    });
  });

  it("returns zeros when the file is missing", () => {
    expect(measureCatalogDbCorpus("/no/such/catalog.sqlite")).toEqual({
      cards: 0,
      products: 0,
      sets: 0,
      setIds: [],
    });
  });
});
