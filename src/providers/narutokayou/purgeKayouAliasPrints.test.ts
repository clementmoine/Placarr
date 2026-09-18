import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createLocalPrintsIndex } from "@/providers/shared/cardCatalogue/localPrintsIndex";

import { purgeKayouAliasPrints } from "./purgeKayouAliasPrints";

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
