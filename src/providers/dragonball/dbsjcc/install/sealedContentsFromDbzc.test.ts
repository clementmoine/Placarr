import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { curatedProductsContentsPath } from "@/providers/shared/sealedProducts/curatedContents";

import { DBS_JCC_PACK_ID, dbsJccCuratedDir } from "../pack";
import { DBSJCC_DETECTEUR_PRINT_KEY } from "../printKey";
import {
  buildSealedContentsFromDbzcLedger,
  writeSealedContentsFromDbzc,
} from "./sealedContentsFromDbzc";

describe("buildSealedContentsFromDbzcLedger", () => {
  it("attaches partial guaranteed lists to themed starters", () => {
    const { skus, report } = buildSealedContentsFromDbzcLedger();
    expect(report.decks).toBeGreaterThanOrEqual(14);
    const saiyans = skus["part1-starter-1190"] as {
      guaranteedPrints: { printKey: string }[];
      contentsKnown: boolean;
    };
    expect(saiyans.guaranteedPrints.length).toBeGreaterThanOrEqual(20);
    expect(saiyans.contentsKnown).toBe(false);
    expect(skus["part2-starter-ruban-rouge"]).toBeTruthy();
    expect(skus["part3-starter-championnat"]).toBeTruthy();
  });

  it("adds the shared Détecteur print to Série 4–10 starters only", () => {
    const { skus } = buildSealedContentsFromDbzcLedger();
    const hasDetecteur = (slug: string) =>
      (
        (skus[slug] as { guaranteedPrints: { printKey: string }[] })
          ?.guaranteedPrints ?? []
      ).some((row) => row.printKey === DBSJCC_DETECTEUR_PRINT_KEY);

    expect(hasDetecteur("part1-starter-1190")).toBe(false);
    expect(hasDetecteur("part3-starter-1197")).toBe(false);
    expect(hasDetecteur("part4-starter-1200")).toBe(true);
    expect(hasDetecteur("part4-starter-forces-du-mal")).toBe(true);
    expect(hasDetecteur("part7-starter-1208")).toBe(true);
    expect(hasDetecteur("part10-starter-1219")).toBe(true);
  });
});

describe("writeSealedContentsFromDbzc", () => {
  const roots: string[] = [];
  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
    vi.unstubAllEnvs();
  });

  it("écrit l'overlay sous data/, sans dirty la graine curated", () => {
    const seedPath = path.join(dbsJccCuratedDir(), "products-contents.json");
    const before = readFileSync(seedPath, "utf8");
    const root = mkdtempSync(path.join(os.tmpdir(), "jcc-contents-"));
    roots.push(root);
    vi.stubEnv("PLACARR_DATA_DIR", root);

    writeSealedContentsFromDbzc();

    const dataPath = curatedProductsContentsPath(DBS_JCC_PACK_ID);
    expect(dataPath.startsWith(root)).toBe(true);
    const overlay = JSON.parse(readFileSync(dataPath, "utf8")) as {
      updatedAt: string;
      skus: Record<string, unknown>;
    };
    expect(overlay.skus["part1-starter-1190"]).toBeTruthy();
    expect(overlay.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(readFileSync(seedPath, "utf8")).toBe(before);
  });
});
