import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  fillLimitlessJaFaces,
  limitlessJaFaceUrlCandidates,
  limitlessLocalIdCandidates,
  limitlessSetCodeCandidates,
} from "./fillJaFaces";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("limitlessSetCodeCandidates", () => {
  it("maps sv-p provider to SVP forms Limitless hosts", () => {
    const codes = limitlessSetCodeCandidates("sv-p", "SV-P-001");
    expect(codes).toContain("SV-P");
    expect(codes).toContain("SVP");
  });

  it("keeps M2a casing from provider", () => {
    expect(limitlessSetCodeCandidates("m2a", "M2a-001")).toContain("M2a");
  });
});

describe("limitlessLocalIdCandidates", () => {
  it("maps basic-energy stems to Limitless one-letter codes", () => {
    expect(limitlessLocalIdCandidates("DAR")).toEqual(["D", "DAR"]);
    expect(limitlessLocalIdCandidates("FIR")).toEqual(["R", "FIR"]);
  });
});

describe("limitlessJaFaceUrlCandidates", () => {
  it("prefers LG then SM with unpadded numbers", () => {
    const urls = limitlessJaFaceUrlCandidates("sv11b", "SV11B-001", "001");
    expect(urls[0]).toBe(
      "https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/SV11B/SV11B_1_R_JP_LG.png",
    );
    expect(urls.some((u) => u.endsWith("_R_JP_SM.png"))).toBe(true);
  });

  it("builds MC energy URLs from DAR→D", () => {
    const urls = limitlessJaFaceUrlCandidates("mc", "MC-DAR", "DAR");
    expect(urls[0]).toBe(
      "https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/MC/MC_D_R_JP_LG.png",
    );
  });
});

describe("fillLimitlessJaFaces", () => {
  it("writes art.limitless.png when CDN download succeeds", async () => {
    const cardsRoot = mkdtempSync(path.join(os.tmpdir(), "placarr-limitless-"));
    roots.push(cardsRoot);
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, ...Array(1200).fill(1)]);
    const report = await fillLimitlessJaFaces({
      cardsRoot,
      concurrency: 1,
      prints: [
        {
          printKey: "pokemon:sv11b-001",
          setId: "sv11b",
          localId: "001",
          providerId: "SV11B-001",
        },
      ],
      downloadImage: async (url) =>
        url.includes("SV11B_1_R_JP_LG.png") ? png : null,
    });
    expect(report.written).toBe(1);
    expect(report.failed).toBe(0);
    const dest = path.join(
      cardsRoot,
      "ja",
      "sv11b",
      "001",
      "art.limitless.png",
    );
    expect(readFileSync(dest).equals(png)).toBe(true);
  });

  it("counts failed when no candidate URL returns bytes", async () => {
    const cardsRoot = mkdtempSync(path.join(os.tmpdir(), "placarr-limitless-"));
    roots.push(cardsRoot);
    const report = await fillLimitlessJaFaces({
      cardsRoot,
      concurrency: 1,
      prints: [
        {
          printKey: "pokemon:vs1-001",
          setId: "vs1",
          localId: "001",
          providerId: "VS1-001",
        },
      ],
      downloadImage: async () => null,
    });
    expect(report.failed).toBe(1);
    expect(report.written).toBe(0);
  });
});
