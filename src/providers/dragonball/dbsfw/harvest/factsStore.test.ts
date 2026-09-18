import { describe, expect, it, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { dbsFwFactsFor, resetDbsFwFactsCache } from "./factsStore";

function packWith(cards: Record<string, unknown>): string {
  const root = mkdtempSync(path.join(os.tmpdir(), "dbsfw-facts-"));
  const dir = path.join(root, "dbs", "fw");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    path.join(dir, "facts.json"),
    JSON.stringify({ version: 1, locale: "en", cards }),
  );
  return root;
}

describe("dbsFwFactsFor", () => {
  const dirs: string[] = [];
  afterEach(() => {
    resetDbsFwFactsCache();
    while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
  });

  it("retrouve la fiche par set et numéro", () => {
    const root = packWith({
      "ST01-001": { cardNumber: "ST01-001", rarity: "L" },
    });
    dirs.push(root);
    expect(dbsFwFactsFor("ST01", "001", { root })?.rarity).toBe("L");
  });

  it("fait retomber une autre illustration sur la fiche de la carte", () => {
    // `_p1` est un second visuel du même numéro : une seule fiche détaillée.
    const root = packWith({
      "FB01-045": { cardNumber: "FB01-045", rarity: "SR" },
    });
    dirs.push(root);
    expect(dbsFwFactsFor("FB01", "045_p1", { root })?.rarity).toBe("SR");
    expect(dbsFwFactsFor("FB01", "045-p2", { root })?.rarity).toBe("SR");
  });

  it("rend null sur un numéro que la récolte n'a pas — pas un objet vide", () => {
    const root = packWith({ "ST01-001": { cardNumber: "ST01-001" } });
    dirs.push(root);
    // `FP-022` répond 200 mais la page est un gabarit sans carte.
    expect(dbsFwFactsFor("FP", "022", { root })).toBeNull();
    expect(dbsFwFactsFor("", "001", { root })).toBeNull();
  });

  it("ne casse pas quand le pack n'a pas encore de faits", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "dbsfw-vide-"));
    dirs.push(root);
    expect(dbsFwFactsFor("ST01", "001", { root })).toBeNull();
  });
});
