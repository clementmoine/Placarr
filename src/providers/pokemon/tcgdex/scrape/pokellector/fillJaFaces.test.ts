import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  fillPokellectorJaFaces,
  parsePokellectorSetFaceUrls,
  pokellectorLocalIdNumber,
  POKELLECTOR_JA_SETS,
} from "./fillJaFaces";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("POKELLECTOR_JA_SETS", () => {
  it("only lists sets verified for JA collector order", () => {
    expect(POKELLECTOR_JA_SETS.vs1).toEqual({
      path: "/sets/VS-Pokemon-VS",
      code: "VS",
    });
    expect(POKELLECTOR_JA_SETS).not.toHaveProperty("neo1");
    expect(POKELLECTOR_JA_SETS).not.toHaveProperty("e1");
  });
});

describe("parsePokellectorSetFaceUrls", () => {
  it("keys full-size URLs by collector number and ignores .0.", () => {
    const html = `
      <img src="//den-cards.pokellector.com/276/Pryces-Articuno.VS.42.27739.thumb.png">
      <img src="https://den-cards.pokellector.com/276/Pryces-Sneasel.VS.43.27740.png">
      <img src="//den-cards.pokellector.com/276/Steel-Energy.VS.0.27847.thumb.png">
    `;
    const map = parsePokellectorSetFaceUrls(html, "VS");
    expect(map.get(42)).toBe(
      "https://den-cards.pokellector.com/276/Pryces-Articuno.VS.42.27739.png",
    );
    expect(map.get(43)).toBe(
      "https://den-cards.pokellector.com/276/Pryces-Sneasel.VS.43.27740.png",
    );
    expect(map.has(0)).toBe(false);
  });
});

describe("pokellectorLocalIdNumber", () => {
  it("parses positive collector numbers only", () => {
    expect(pokellectorLocalIdNumber("042")).toBe(42);
    expect(pokellectorLocalIdNumber("0")).toBeNull();
    expect(pokellectorLocalIdNumber("DAR")).toBeNull();
  });
});

describe("fillPokellectorJaFaces", () => {
  it("writes art.pokellector.png for vs1 localId hits", async () => {
    const cardsRoot = mkdtempSync(
      path.join(os.tmpdir(), "placarr-pokellector-"),
    );
    roots.push(cardsRoot);
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, ...Array(1200).fill(3)]);
    const report = await fillPokellectorJaFaces({
      cardsRoot,
      concurrency: 1,
      prints: [
        {
          printKey: "pokemon:vs1-042",
          setId: "vs1",
          localId: "042",
          providerId: "vs1-042",
        },
      ],
      fetchSetHtml: async () =>
        `<img src="//den-cards.pokellector.com/276/Pryces-Articuno.VS.42.27739.thumb.png">`,
      downloadImage: async (url) =>
        url.includes("Pryces-Articuno.VS.42") ? png : null,
    });
    expect(report.written).toBe(1);
    expect(
      readFileSync(
        path.join(cardsRoot, "ja", "vs1", "042", "art.pokellector.png"),
      ).equals(png),
    ).toBe(true);
  });

  it("counts unmapped when collector number is absent", async () => {
    const cardsRoot = mkdtempSync(
      path.join(os.tmpdir(), "placarr-pokellector-"),
    );
    roots.push(cardsRoot);
    const report = await fillPokellectorJaFaces({
      cardsRoot,
      concurrency: 1,
      prints: [
        {
          printKey: "pokemon:vs1-143",
          setId: "vs1",
          localId: "143",
          providerId: "vs1-143",
        },
      ],
      fetchSetHtml: async () =>
        `<img src="//den-cards.pokellector.com/276/Steel-Energy.VS.0.27847.thumb.png">`,
      downloadImage: async () => {
        throw new Error("should not download");
      },
    });
    expect(report.unmapped).toBe(1);
    expect(report.written).toBe(0);
  });
});
