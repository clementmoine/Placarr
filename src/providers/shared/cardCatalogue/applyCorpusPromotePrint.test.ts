import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { applyCorpusPromotePrint } from "./applyCorpusPromotePrint";
import { createLocalPrintsIndex } from "./localPrintsIndex";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
  vi.unstubAllEnvs();
});

function tmpDataRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "promote-print-"));
  roots.push(root);
  vi.stubEnv("PLACARR_DATA_DIR", root);
  return root;
}

describe("applyCorpusPromotePrint", () => {
  it("writes a LocalPrintsIndex row for a matching printGame", () => {
    tmpDataRoot();
    const packId = "naruto/ninja-ranks";
    createLocalPrintsIndex(packId).bootstrapEmpty();

    const result = applyCorpusPromotePrint({
      packId,
      printGame: "naruto",
      printKey: "naruto:nr-0042",
      title: "Kakashi Hatake",
      language: "en",
    });

    expect(result).toEqual({
      written: true,
      printKey: "naruto:nr-0042",
    });

    const row = createLocalPrintsIndex(packId).lookupRow("naruto:nr-0042");
    expect(row).toMatchObject({
      printKey: "naruto:nr-0042",
      setCode: "nr",
      number: "0042",
      fullName: "Kakashi Hatake",
      lang: "en",
    });
  });

  it("rejects a foreign printGame without writing", () => {
    tmpDataRoot();
    const packId = "lorcana";
    createLocalPrintsIndex(packId).bootstrapEmpty();

    const result = applyCorpusPromotePrint({
      packId,
      printGame: "lorcana",
      printKey: "naruto:nr-0001",
      title: "Wrong game",
    });

    expect(result.written).toBe(false);
    if (!result.written) {
      expect(result.reason).toMatch(/≠ corpus lorcana/);
    }
    expect(createLocalPrintsIndex(packId).lookupRow("naruto:nr-0001")).toBeNull();
  });

  it("rejects an unparseable printKey", () => {
    tmpDataRoot();
    const result = applyCorpusPromotePrint({
      packId: "naruto/ninja-ranks",
      printGame: "naruto",
      printKey: "not-a-print-key",
    });
    expect(result).toEqual({
      written: false,
      reason: "unparseable printKey: not-a-print-key",
    });
  });
});
