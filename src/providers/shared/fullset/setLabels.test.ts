import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { afterEach, describe, expect, it } from "vitest";

import { migrateProductsSchema } from "@/providers/shared/sealedProducts/productsSqlite";

import type { FullsetSetsLedger } from "./parseSets";
import {
  fullsetSetLabel,
  installFullsetSetLabelsFromLedger,
  readFullsetSetLabels,
} from "./setLabels";

const tmpDirs: string[] = [];

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function tempDb(): string {
  const root = mkdtempSync(path.join(os.tmpdir(), "placarr-fullset-labels-"));
  tmpDirs.push(root);
  const dbPath = path.join(root, "catalog.sqlite");
  const db = new DatabaseSync(dbPath);
  migrateProductsSchema(db);
  db.close();
  return dbPath;
}

describe("installFullsetSetLabelsFromLedger", () => {
  it("indexes by lowercase set ref and serves FR/EN labels", () => {
    const dbPath = tempDb();
    const ledger: FullsetSetsLedger = {
      source: "https://fullset.fr/yugioh/sets",
      observed: "2026-10-28T00:00:00.000Z",
      game: "yugioh",
      sets: [
        {
          fullsetId: "667",
          nameFr: "Le Labyrinthe des Morts",
          nameEn: "Maze of Muertos",
          ref: "MZMU",
          releasedAt: "2025-10-23",
          path: null,
          iconPath: null,
          imagePath: null,
          setType: "1",
        },
        {
          fullsetId: "1",
          nameFr: "Sans ref",
          nameEn: "No ref",
          ref: null,
          releasedAt: null,
          path: null,
          iconPath: null,
          imagePath: null,
          setType: null,
        },
      ],
    };
    const { codes } = installFullsetSetLabelsFromLedger("yugioh", ledger, {
      dbPath,
    });
    expect(codes).toBe(1);
    const doc = readFullsetSetLabels("yugioh", { dbPath });
    expect(doc?.byCode.mzmu).toMatchObject({
      nameFr: "Le Labyrinthe des Morts",
      nameEn: "Maze of Muertos",
      fullsetId: "667",
    });
    expect(fullsetSetLabel("yugioh", "MZMU", "fr", { dbPath })).toBe(
      "Le Labyrinthe des Morts",
    );
    expect(fullsetSetLabel("yugioh", "mzmu", "en", { dbPath })).toBe(
      "Maze of Muertos",
    );
    expect(fullsetSetLabel("yugioh", "missing", "fr", { dbPath })).toBeNull();
  });
});
