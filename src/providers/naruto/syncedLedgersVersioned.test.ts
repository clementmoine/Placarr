/**
 * ADR-006 : un ledger que la Sync ne sait pas réécrire est un dig non
 * rejouable — il vit dans `curated/sources/` (versionné), pas seulement dans
 * `data/` (gitignoré).
 *
 * Écrit après la perte Synology du 2026-11-21 : 92 ledgers Carddass n'existaient
 * plus que dans `data/naruto/carddass/sources/` (sortis de git par `ab86fb92`
 * sans écrivain), et leur lecture au chargement des modules faisait planter
 * Next et les workers dès qu'un fichier manquait.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  readNarutoCarddassSyncedSource,
  readNarutoCarddassSyncedSourceIfPresent,
} from "./narutocarddass/syncedSources";
import { readNarutoShippudenSyncedSource } from "./narutoshippuden/assets";

const PACKS = [
  {
    dir: "narutocarddass",
    reader: "readNarutoCarddassSyncedSource",
  },
  {
    dir: "narutoshippuden",
    reader: "readNarutoShippudenSyncedSource",
  },
] as const;

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "curated") continue;
      out.push(...sourceFiles(full));
    } else if (/\.tsx?$/.test(entry) && !entry.includes(".test.")) {
      out.push(full);
    }
  }
  return out;
}

/** Noms littéraux passés au lecteur, appels multi-lignes et génériques compris. */
function ledgerNamesRead(packDir: string, reader: string): string[] {
  const re = new RegExp(`${reader}\\s*(?:<[^>]*>)?\\(\\s*"([^"]+)"`, "g");
  const names = new Set<string>();
  for (const file of sourceFiles(packDir)) {
    for (const match of readFileSync(file, "utf8").matchAll(re)) {
      names.add(match[1]!);
    }
  }
  return [...names].sort();
}

describe("ledgers Naruto lus au démarrage", () => {
  for (const pack of PACKS) {
    it(`${pack.dir} : chaque ledger lu existe dans curated/sources`, () => {
      const packDir = path.join(__dirname, pack.dir);
      const curated = new Set(
        readdirSync(path.join(packDir, "curated", "sources")),
      );
      const names = ledgerNamesRead(packDir, pack.reader);
      expect(names.length).toBeGreaterThan(0);
      expect(names.filter((name) => !curated.has(name))).toEqual([]);
    });
  }

  it("un ledger généré par la Sync et pas encore écrit se lit comme absent, sans planter", () => {
    expect(
      readNarutoCarddassSyncedSourceIfPresent("ledger-jamais-genere.json"),
    ).toBeNull();
  });

  it("le lecteur Carddass retombe sur curated/sources quand data/ n'a pas le fichier", () => {
    // Dig présent uniquement dans curated/ (jamais synchronisé dans data/).
    expect(readNarutoCarddassSyncedSource("attested-pairs.json")).toBeTruthy();
  });

  it("le lecteur Shippuden retombe sur curated/sources quand data/ n'a pas le fichier", () => {
    const curatedOnly = readdirSync(
      path.join(__dirname, "narutoshippuden", "curated", "sources"),
    ).find((name) => name.endsWith(".json"));
    if (!curatedOnly) return;
    expect(readNarutoShippudenSyncedSource(curatedOnly)).toBeTruthy();
  });
});
