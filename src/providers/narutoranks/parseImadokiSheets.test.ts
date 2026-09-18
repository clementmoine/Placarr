import { describe, expect, it } from "vitest";

import {
  contiguousBands,
  IMADOKI_LANG,
  IMADOKI_SHEETS,
  IMADOKI_SHEETS_SKIPPED,
  imadokiSheetUrl,
  splitAxis,
} from "./parseImadokiSheets";

describe("manifeste des planches", () => {
  it("déclare autant de cases que la grille en porte", () => {
    for (const sheet of IMADOKI_SHEETS) {
      expect(sheet.slots, sheet.file).toHaveLength(sheet.columns * sheet.rows);
    }
  });

  it("ne nomme jamais deux fois le même tirage", () => {
    const seen = new Set<string>();
    for (const sheet of IMADOKI_SHEETS) {
      for (const slot of sheet.slots) {
        if (!slot) continue;
        const key = `${slot.setCode}-${slot.number}`;
        expect(seen.has(key), key).toBe(false);
        seen.add(key);
      }
    }
    // 72 de base + FF6 + NW9 + NS5 (Guy absent) + SD5 (la 4 manque) + BL3.
    expect(seen.size).toBe(72 + 6 + 9 + 5 + 5 + 3);
  });

  it("laisse la case de `sd-0004` vide, absente de la galerie", () => {
    const sheet = IMADOKI_SHEETS.find((s) => s.file.includes("sd01-06"))!;
    expect(sheet.slots[3]).toBeNull();
    expect(sheet.slots[4]).toEqual({ setCode: "sd", number: "0005" });
    // GS1-3 sont nos box loaders.
    expect(sheet.slots[6]).toEqual({ setCode: "bl", number: "0001" });
  });

  it("écarte le sachet, en disant pourquoi", () => {
    expect(IMADOKI_SHEETS_SKIPPED).toHaveLength(1);
    expect(IMADOKI_SHEETS_SKIPPED[0]!.file).toBe("naruto_premiumtc_pack.JPG");
    const files = IMADOKI_SHEETS.map((s) => s.file);
    for (const skipped of IMADOKI_SHEETS_SKIPPED) {
      expect(files).not.toContain(skipped.file);
    }
  });

  it("mappe la planche NS sur les tirages EU-only (grille 2×3 paysage)", () => {
    const sheet = IMADOKI_SHEETS.find((s) => s.file.includes("ns01-06"))!;
    expect(sheet.columns).toBe(2);
    expect(sheet.rows).toBe(3);
    expect(sheet.gridMode).toBe("equal");
    expect(sheet.slots).toEqual([
      { setCode: "ns", number: "0004" },
      { setCode: "ns", number: "0001" },
      { setCode: "ns", number: "0005" },
      { setCode: "ns", number: "0002" },
      { setCode: "ns", number: "0006" },
      null,
    ]);
  });

  it("étiquette les faces dans la langue de l'édition photographiée", () => {
    expect(IMADOKI_LANG).toBe("it");
  });

  it("construit l'URL d'une planche", () => {
    expect(imadokiSheetUrl("x.JPG")).toBe(
      "https://www.imadokicollection.it/WebImadoki_04_Card_Gallery/image_world/x.JPG",
    );
  });
});

describe("découpe de la grille", () => {
  /** Un axe de `size` px : `cells` cases séparées par des gouttières blanches. */
  function axis(size: number, cells: number, gutter = 20): number[] {
    const cell = Math.floor((size - gutter * (cells - 1)) / cells);
    const out = new Array<number>(size).fill(0);
    for (let c = 0; c < cells - 1; c += 1) {
      const start = (c + 1) * cell + c * gutter;
      for (let i = start; i < start + gutter; i += 1) out[i] = 1;
    }
    return out;
  }

  it("coupe en trois quand les deux gouttières sont là", () => {
    const cuts = splitAxis(axis(750, 3), 3);
    expect(cuts).not.toBeNull();
    expect(cuts).toHaveLength(3);
    expect(cuts![0]![0]).toBe(0);
  });

  it("extrapole le pas quand une rangée vide avale sa gouttière", () => {
    // Le cas réel de la planche 19-27 : la troisième rangée est blanche, donc
    // la gouttière qui la précède ne se distingue plus du fond.
    const full = axis(1035, 3);
    const oneGutter = full.map((v, i) => (i > 600 ? 0 : v));
    const cuts = splitAxis(oneGutter, 3);
    expect(cuts).not.toBeNull();
    expect(cuts).toHaveLength(3);
    // Le pas reste régulier : les trois cases ont sensiblement la même hauteur.
    const heights = cuts!.map(([a, b]) => b - a);
    expect(Math.max(...heights) - Math.min(...heights)).toBeLessThan(30);
  });

  it("refuse une planche qui a trop de gouttières pour sa grille", () => {
    expect(splitAxis(axis(750, 5), 3)).toBeNull();
  });

  it("trouve les bandes contiguës, et ignore les trop courtes", () => {
    expect(contiguousBands([false, true, true, true, false], 3)).toEqual([
      [1, 4],
    ]);
    expect(contiguousBands([true, true, false], 3)).toEqual([]);
  });
});
