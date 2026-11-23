import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Contrat disque (`docs/data-layout.md`) : une face vit sous
 * `cards/{lang}/{set}/{card}/` — `packCardDir` le construit. Un writer qui
 * joint `packCardsDir(pack), set, lang, …` à la main recrée l'ancien ordre :
 * l'app sert alors une face périmée de l'autre arbre et les sondes (grille
 * lenticulaire Kayou, 2026-11-22) lisent la mauvaise image.
 */

const SRC = path.resolve(__dirname, "../..");

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "generated" || entry.name === "node_modules") continue;
      sourceFiles(full, out);
    } else if (
      /\.tsx?$/.test(entry.name) &&
      !/\.test\.tsx?$/.test(entry.name)
    ) {
      out.push(full);
    }
  }
  return out;
}

/** `path.join(packCardsDir(X), <set>, <lang>` — set first, lang second. */
const SET_FIRST_JOIN =
  /path\.join\(\s*packCardsDir\([^()]*\)\s*,\s*([^,()]+?)\s*,\s*([A-Za-z_.]*lang[A-Za-z_]*|[A-Z_]*LANG[A-Z_]*|"(?:en|fr|ja|zh|ko|de|it|es)")\s*[,)]/gi;

describe("card dir layout guard", () => {
  it("no writer builds cards/{set}/{lang}/ by hand (use packCardDir)", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(SRC)) {
      const text = readFileSync(file, "utf8");
      for (const m of text.matchAll(SET_FIRST_JOIN)) {
        const line = text.slice(0, m.index).split("\n").length;
        offenders.push(`${path.relative(SRC, file)}:${line}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
