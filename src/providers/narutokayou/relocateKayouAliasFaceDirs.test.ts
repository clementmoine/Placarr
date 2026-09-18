import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { relocateKayouAliasFaceDirs } from "./relocateKayouAliasFaceDirs";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
  vi.unstubAllEnvs();
});

function tmpDataRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "kayou-relocate-"));
  roots.push(root);
  vi.stubEnv("PLACARR_DATA_DIR", root);
  return root;
}

describe("relocateKayouAliasFaceDirs", () => {
  it("renames alias-only card folders onto canonical ids", () => {
    tmpDataRoot();
    const cardsRoot = path.join(process.env.PLACARR_DATA_DIR!, "naruto/kayou/cards");
    const aliasDir = path.join(cardsRoot, "ninjaagebox/en/nr.cc.xr.002l5");
    fs.mkdirSync(aliasDir, { recursive: true });
    fs.writeFileSync(path.join(aliasDir, "art.capsulecorpgear.webp"), "webp");

    const report = relocateKayouAliasFaceDirs({ cardsDir: cardsRoot });
    expect(report.renamed).toBe(1);
    expect(
      fs.existsSync(
        path.join(cardsRoot, "ninjaagebox/en/cc.xr.002l5/art.capsulecorpgear.webp"),
      ),
    ).toBe(true);
    expect(fs.existsSync(aliasDir)).toBe(false);
  });

  it("merges alternate art into an existing canonical folder", () => {
    tmpDataRoot();
    const cardsRoot = path.join(process.env.PLACARR_DATA_DIR!, "naruto/kayou/cards");
    const canonDir = path.join(cardsRoot, "ninjaagebox/en/cc.mr.001");
    const aliasDir = path.join(cardsRoot, "ninjaagebox/en/nr.cc.mr.001");
    fs.mkdirSync(canonDir, { recursive: true });
    fs.mkdirSync(aliasDir, { recursive: true });
    fs.writeFileSync(path.join(canonDir, "art.narutocards.webp"), "a");
    fs.writeFileSync(path.join(aliasDir, "art.capsulecorpgear.webp"), "b");

    const report = relocateKayouAliasFaceDirs({ cardsDir: cardsRoot });
    expect(report.merged).toBe(1);
    expect(fs.existsSync(path.join(canonDir, "art.capsulecorpgear.webp"))).toBe(
      true,
    );
    expect(fs.existsSync(aliasDir)).toBe(false);
  });
});
