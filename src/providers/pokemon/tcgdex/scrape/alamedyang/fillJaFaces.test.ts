import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  ALAMEDYANG_JA_SETS,
  alamedyangFaceUrl,
  alamedyangLocalPadFile,
  alamedyangUniqueDexLevelFiles,
  alamedyangUniqueDexPadFiles,
  fillAlamedyangJaFaces,
  parseAlamedyangIndexFiles,
} from "./fillJaFaces";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("ALAMEDYANG_JA_SETS", () => {
  it("maps vintage JA sets to archive folders without inventing ids", () => {
    expect(ALAMEDYANG_JA_SETS.neo1).toEqual({
      folder: "n1",
      mode: "dexLevel",
    });
    expect(ALAMEDYANG_JA_SETS.vs1).toEqual({
      folder: "vs",
      mode: "localPad",
    });
    expect(ALAMEDYANG_JA_SETS.web1?.folder).toBe("web");
  });
});

describe("parseAlamedyangIndexFiles", () => {
  it("keeps only basename jpg hrefs", () => {
    const html = `
      <a href="152-12.jpg">152-12.jpg</a>
      <a href="../../boosterpics/jap-e1.jpg">booster</a>
      <a href="001.jpg">001</a>
    `;
    expect(parseAlamedyangIndexFiles(html)).toEqual(["152-12.jpg", "001.jpg"]);
  });
});

describe("alamedyangUniqueDexLevelFiles", () => {
  it("keeps only unique dex→file bindings", () => {
    const map = alamedyangUniqueDexLevelFiles([
      "152-12.jpg",
      "181-16.jpg",
      "191-16.jpg",
      "191-40.jpg",
    ]);
    expect(map.get(152)).toBe("152-12.jpg");
    expect(map.get(181)).toBe("181-16.jpg");
    expect(map.has(191)).toBe(false);
  });
});

describe("alamedyangUniqueDexPadFiles", () => {
  it("ignores dark/light stems and keeps plain dex files", () => {
    const map = alamedyangUniqueDexPadFiles([
      "010.jpg",
      "013.jpg",
      "168-warui.jpg",
      "192-yasashii.jpg",
    ]);
    expect(map.get(10)).toBe("010.jpg");
    expect(map.get(13)).toBe("013.jpg");
    expect(map.has(168)).toBe(false);
    expect(map.has(192)).toBe(false);
  });
});

describe("alamedyangLocalPadFile", () => {
  it("matches padded and unpadded collector numbers", () => {
    const files = ["001.jpg", "42.jpg", "029.jpg"];
    expect(alamedyangLocalPadFile(files, "1")).toBe("001.jpg");
    expect(alamedyangLocalPadFile(files, "042")).toBe("42.jpg");
    expect(alamedyangLocalPadFile(files, "29")).toBe("029.jpg");
    expect(alamedyangLocalPadFile(files, "99")).toBeNull();
  });
});

describe("alamedyangFaceUrl", () => {
  it("builds absolute scan URLs", () => {
    expect(alamedyangFaceUrl("n1", "152-12.jpg")).toBe(
      "http://alamedyang.tejat.net/cards/scans/jap/n1/152-12.jpg",
    );
  });
});

describe("fillAlamedyangJaFaces", () => {
  it("writes art.alamedyang.jpg via unique dexLevel match", async () => {
    const cardsRoot = mkdtempSync(path.join(os.tmpdir(), "placarr-alamedyang-"));
    roots.push(cardsRoot);
    const jpg = Buffer.from([0xff, 0xd8, 0xff, ...Array(1200).fill(1)]);
    const report = await fillAlamedyangJaFaces({
      cardsRoot,
      concurrency: 1,
      prints: [
        {
          printKey: "pokemon:neo1-002",
          setId: "neo1",
          localId: "002",
          providerId: "neo1-002",
          dexId: 152,
        },
      ],
      fetchIndex: async () =>
        `<a href="152-12.jpg">152-12.jpg</a><a href="043-07.jpg">043-07.jpg</a>`,
      downloadImage: async (url) =>
        url.endsWith("/n1/152-12.jpg") ? jpg : null,
    });
    expect(report.written).toBe(1);
    expect(report.failed).toBe(0);
    expect(report.unmapped).toBe(0);
    const dest = path.join(
      cardsRoot,
      "ja",
      "neo1",
      "002",
      "art.alamedyang.jpg",
    );
    expect(readFileSync(dest).equals(jpg)).toBe(true);
  });

  it("writes via localPad for vs1", async () => {
    const cardsRoot = mkdtempSync(path.join(os.tmpdir(), "placarr-alamedyang-"));
    roots.push(cardsRoot);
    const jpg = Buffer.from([0xff, 0xd8, 0xff, ...Array(1200).fill(2)]);
    const report = await fillAlamedyangJaFaces({
      cardsRoot,
      concurrency: 1,
      prints: [
        {
          printKey: "pokemon:vs1-001",
          setId: "vs1",
          localId: "001",
          providerId: "vs1-001",
        },
      ],
      fetchIndex: async () => `<a href="001.jpg">001.jpg</a>`,
      downloadImage: async (url) =>
        url.endsWith("/vs/001.jpg") ? jpg : null,
    });
    expect(report.written).toBe(1);
    expect(
      readFileSync(
        path.join(cardsRoot, "ja", "vs1", "001", "art.alamedyang.jpg"),
      ).equals(jpg),
    ).toBe(true);
  });

  it("counts unmapped when dex has multiple archive files", async () => {
    const cardsRoot = mkdtempSync(path.join(os.tmpdir(), "placarr-alamedyang-"));
    roots.push(cardsRoot);
    const report = await fillAlamedyangJaFaces({
      cardsRoot,
      concurrency: 1,
      prints: [
        {
          printKey: "pokemon:neo1-006",
          setId: "neo1",
          localId: "006",
          providerId: "neo1-006",
          dexId: 191,
        },
      ],
      fetchIndex: async () =>
        `<a href="191-16.jpg">191-16.jpg</a><a href="191-40.jpg">191-40.jpg</a>`,
      downloadImage: async () => {
        throw new Error("should not download ambiguous dex");
      },
    });
    expect(report.unmapped).toBe(1);
    expect(report.written).toBe(0);
  });
});
