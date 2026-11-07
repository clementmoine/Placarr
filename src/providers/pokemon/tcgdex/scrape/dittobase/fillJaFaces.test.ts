import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  DITTOBASE_JA_SETS,
  dittobaseJaFaceUrl,
  dittobaseLocalIdStem,
  fillDittobaseJaFaces,
} from "./fillJaFaces";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("DITTOBASE_JA_SETS", () => {
  it("maps JA sets to case-sensitive CDN folders", () => {
    expect(DITTOBASE_JA_SETS.neo1).toBe("neo1");
    expect(DITTOBASE_JA_SETS.vs1).toBe("VS1");
    expect(DITTOBASE_JA_SETS.e2).toBe("E2");
    expect(DITTOBASE_JA_SETS).not.toHaveProperty("e1");
  });
});

describe("dittobaseLocalIdStem", () => {
  it("pads numeric collector numbers", () => {
    expect(dittobaseLocalIdStem("1")).toBe("001");
    expect(dittobaseLocalIdStem("042")).toBe("042");
    expect(dittobaseLocalIdStem("DAR")).toBeNull();
  });
});

describe("dittobaseJaFaceUrl", () => {
  it("builds CDN URLs with padded local ids", () => {
    expect(dittobaseJaFaceUrl("neo1", "2")).toBe(
      "https://assets.dittobase.com/tcg/cards/ja/neo1/002.webp",
    );
    expect(dittobaseJaFaceUrl("VS1", "143")).toBe(
      "https://assets.dittobase.com/tcg/cards/ja/VS1/143.webp",
    );
  });
});

describe("fillDittobaseJaFaces", () => {
  it("writes art.dittobase.webp on successful download", async () => {
    const cardsRoot = mkdtempSync(path.join(os.tmpdir(), "placarr-dittobase-"));
    roots.push(cardsRoot);
    const webp = Buffer.from([0x52, 0x49, 0x46, 0x46, ...Array(1200).fill(7)]);
    const report = await fillDittobaseJaFaces({
      cardsRoot,
      concurrency: 1,
      prints: [
        {
          printKey: "pokemon:neo1-073",
          setId: "neo1",
          localId: "073",
          providerId: "neo1-073",
        },
      ],
      downloadImage: async (url) =>
        url.endsWith("/neo1/073.webp") ? webp : null,
    });
    expect(report.written).toBe(1);
    expect(
      readFileSync(
        path.join(cardsRoot, "ja", "neo1", "073", "art.dittobase.webp"),
      ).equals(webp),
    ).toBe(true);
  });

  it("counts failed when CDN returns no bytes", async () => {
    const cardsRoot = mkdtempSync(path.join(os.tmpdir(), "placarr-dittobase-"));
    roots.push(cardsRoot);
    const report = await fillDittobaseJaFaces({
      cardsRoot,
      concurrency: 1,
      prints: [
        {
          printKey: "pokemon:neo1-099",
          setId: "neo1",
          localId: "099",
          providerId: "neo1-099",
        },
      ],
      downloadImage: async () => null,
    });
    expect(report.failed).toBe(1);
    expect(report.written).toBe(0);
  });
});
