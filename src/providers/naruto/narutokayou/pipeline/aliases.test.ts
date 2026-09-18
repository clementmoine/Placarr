import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createLocalPrintsIndex } from "@/providers/shared/cardCatalogue/localPrintsIndex";
import { purgeKayouAliasPrints } from "./purgeAliases";
import { relocateKayouAliasFaceDirs } from "./relocateAliases";

// —— purgeKayouAliasPrints ——
{
  const roots: string[] = [];
  afterEach(() => {
    for (const root of roots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
    vi.unstubAllEnvs();
  });

  function tmpDataRoot(): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "kayou-alias-"));
    roots.push(root);
    vi.stubEnv("PLACARR_DATA_DIR", root);
    return root;
  }

  describe("purgeKayouAliasPrints", () => {
    it("merges nr.ss alias into existing nrss print", () => {
      tmpDataRoot();
      const index = createLocalPrintsIndex("naruto/kayou");
      index.writePrints([
        {
          printKey: "kayou:newyeargiftbox-nrss.hr.011",
          setCode: "newyeargiftbox",
          number: "nrss.hr.011",
          cardType: "newyeargiftbox",
          titles: [{ lang: "en", fullName: "Jiraiya", rarity: "HR" }],
        },
        {
          printKey: "kayou:newyeargiftbox-nr.ss.hr.011",
          setCode: "newyeargiftbox",
          number: "nr.ss.hr.011",
          cardType: "newyeargiftbox",
          titles: [{ lang: "en", fullName: "Jiraiya CCG", rarity: "SS-HR" }],
        },
      ]);

      const report = purgeKayouAliasPrints({ index });
      expect(report.migrated).toBe(1);
      expect(report.removed).toBe(1);
      expect(index.lookupRow("kayou:newyeargiftbox-nr.ss.hr.011")).toBeNull();
      expect(index.lookupRow("kayou:newyeargiftbox-nrss.hr.011")?.fullName).toBe(
        "Jiraiya",
      );
    });

    it("renames alias when canonical is missing", () => {
      tmpDataRoot();
      const index = createLocalPrintsIndex("naruto/kayou");
      index.writePrints([
        {
          printKey: "kayou:ninjaagebox-nr.cc.r.001",
          setCode: "ninjaagebox",
          number: "nr.cc.r.001",
          cardType: "ninjaagebox",
          titles: [{ lang: "en", fullName: "Naruto", rarity: "CC-R" }],
        },
      ]);

      const report = purgeKayouAliasPrints({ index });
      expect(report.renamed).toBe(1);
      expect(report.removed).toBe(1);
      expect(index.lookupRow("kayou:ninjaagebox-nr.cc.r.001")).toBeNull();
      expect(index.lookupRow("kayou:ninjaagebox-cc.r.001")?.fullName).toBe(
        "Naruto",
      );
    });
  });
}

// —— relocateKayouAliasFaceDirs ——
{
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
}
