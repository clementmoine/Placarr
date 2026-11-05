import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  fillTrainersJaFaces,
  parseTrainersCollectorLine,
  trainersAbsoluteAssetUrl,
} from "./fillJaFaces";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("parseTrainersCollectorLine", () => {
  it("reads nbsp collector fractions from detail HTML", () => {
    expect(
      parseTrainersCollectorLine(
        "ビードル &nbsp;001&nbsp;/&nbsp;051&nbsp; No.013",
      ),
    ).toEqual({ number: "001", total: "051" });
  });
});

describe("trainersAbsoluteAssetUrl", () => {
  it("prefixes the Trainers origin for relative CDN paths", () => {
    expect(
      trainersAbsoluteAssetUrl(
        "/assets/images/card_images/large/BW8-Brn/028565_P_BIDORU.jpg",
      ),
    ).toBe(
      "https://www.pokemon-card.com/assets/images/card_images/large/BW8-Brn/028565_P_BIDORU.jpg",
    );
  });
});

describe("fillTrainersJaFaces", () => {
  it("writes art.trainers.jpg when product+detail resolve", async () => {
    const cardsRoot = mkdtempSync(path.join(os.tmpdir(), "placarr-trainers-"));
    roots.push(cardsRoot);
    const jpg = Buffer.from([0xff, 0xd8, 0xff, ...Array(1200).fill(1)]);
    const report = await fillTrainersJaFaces({
      cardsRoot,
      setProducts: { bw8a: [374] },
      prints: [
        {
          printKey: "pokemon:bw8a-001",
          setId: "bw8a",
          localId: "001",
          providerId: "BW8a-001",
        },
      ],
      listProductCards: async () => [{ cardID: "28565" }],
      fetchCardFace: async () => ({
        cardId: "28565",
        imageUrl:
          "https://www.pokemon-card.com/assets/images/card_images/large/BW8-Brn/028565_P_BIDORU.jpg",
        collectorNumber: "001",
        setTotal: "051",
      }),
      downloadImage: async () => jpg,
    });
    expect(report.written).toBe(1);
    expect(report.unmapped).toBe(0);
    const dest = path.join(
      cardsRoot,
      "ja",
      "bw8a",
      "001",
      "art.trainers.jpg",
    );
    expect(readFileSync(dest).equals(jpg)).toBe(true);
  });

  it("counts unmapped when collector is absent from product pages", async () => {
    const cardsRoot = mkdtempSync(path.join(os.tmpdir(), "placarr-trainers-"));
    roots.push(cardsRoot);
    const report = await fillTrainersJaFaces({
      cardsRoot,
      setProducts: { bw8a: [374] },
      prints: [
        {
          printKey: "pokemon:bw8a-099",
          setId: "bw8a",
          localId: "099",
          providerId: "BW8a-099",
        },
      ],
      listProductCards: async () => [{ cardID: "28565" }],
      fetchCardFace: async () => ({
        cardId: "28565",
        imageUrl: "https://www.pokemon-card.com/assets/images/card_images/large/BW8-Brn/x.jpg",
        collectorNumber: "001",
        setTotal: "051",
      }),
      downloadImage: async () => Buffer.alloc(2000, 1),
    });
    expect(report.unmapped).toBe(1);
    expect(report.written).toBe(0);
  });
});
