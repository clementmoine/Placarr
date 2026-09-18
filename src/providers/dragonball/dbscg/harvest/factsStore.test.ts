import { describe, expect, it, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { dbsCgFactsFor, resetDbsCgFactsCache } from "./factsStore";

function packWith(cards: Record<string, unknown>): string {
  const root = mkdtempSync(path.join(os.tmpdir(), "dbscg-facts-"));
  const dir = path.join(root, "dbs", "cg");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    path.join(dir, "facts.json"),
    JSON.stringify({ version: 1, locale: "en", cards }),
  );
  return root;
}

describe("dbsCgFactsFor", () => {
  const dirs: string[] = [];
  afterEach(() => {
    resetDbsCgFactsCache();
    while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
  });

  it("retrouve la fiche malgré les écritures différentes du numéro", () => {
    const root = packWith({
      "BT1-005": { cardNumber: "BT1-005", name: "Champa" },
      "EX06-035": { cardNumber: "EX06-035", name: "Fu" },
    });
    dirs.push(root);
    expect(dbsCgFactsFor("bt1", "005", { root })?.name).toBe("Champa");
    // Le pack écrit `ex06-35`, le dépôt `EX06-035`.
    expect(dbsCgFactsFor("ex06", "35", { root })?.name).toBe("Fu");
  });

  it("rend null plutôt qu'une fiche approchante", () => {
    const root = packWith({ "BT1-005": { cardNumber: "BT1-005" } });
    dirs.push(root);
    expect(dbsCgFactsFor("BT30", "016", { root })).toBeNull();
    expect(dbsCgFactsFor("", "005", { root })).toBeNull();
  });

  it("ne casse pas quand le pack n'a pas encore de faits", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "dbscg-vide-"));
    dirs.push(root);
    expect(dbsCgFactsFor("BT1", "005", { root })).toBeNull();
  });
});
