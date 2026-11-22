import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ensureTcgdexIndex,
  resetTcgdexIndexCache,
  tcgdexDbPath,
  tcgdexHarvestedSets,
  writeTcgdexSet,
} from "./indexStore";

const roots: string[] = [];

afterEach(() => {
  resetTcgdexIndexCache();
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

function tmpPokemonData(): void {
  const root = mkdtempSync(path.join(os.tmpdir(), "placarr-tcgdex-bootstrap-"));
  roots.push(root);
  vi.stubEnv("PLACARR_DATA_DIR", root);
}

describe("tcgdex — Sync depuis une base à moitié construite", () => {
  it("traite une catalog.sqlite sans tables cartes comme un catalogue vide, puis l'écrit", () => {
    tmpPokemonData();
    const dbPath = tcgdexDbPath();
    mkdirSync(path.dirname(dbPath), { recursive: true });
    // L'étape scellé / documents a créé la base avant la première moisson.
    const db = new DatabaseSync(dbPath);
    db.exec("CREATE TABLE products (id TEXT PRIMARY KEY)");
    db.close();

    expect(ensureTcgdexIndex()).toBeNull();
    expect(tcgdexHarvestedSets().size).toBe(0);

    writeTcgdexSet({
      set: {
        setId: "base1",
        lang: "en",
        name: "Base Set",
        serieName: "Base",
        releasedAt: "1999-01-09",
        totalCount: 0,
        officialCount: 0,
      },
      prints: [],
      titles: [],
    });
    expect(tcgdexHarvestedSets().get("base1|en")).toBe(0);
  });
});
