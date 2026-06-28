import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const PROVIDER_TERMS = [
  "achatmoinscher",
  "apriloshop",
  "chipweld",
  "archichouette",
  "bcdjeux",
  "bedetheque",
  "bgg",
  "boardgamegeek",
  "chasseauxlivres",
  "chocobonplan",
  "geedie",
  "coverproject",
  "deezer",
  "discogs",
  "freakxy",
  "googlebooks",
  "howlongtobeat",
  "icollect",
  "igdb",
  "launchbox",
  "ledenicheur",
  "lepassetemps",
  "ludifolie",
  "monsieurde",
  "musicbrainz",
  "okkazeo",
  "omdb",
  "openlibrary",
  "philibert",
  "picclick",
  "pricecharting",
  "rawg",
  "scandex",
  "screenscraper",
  "steam",
  "steamgriddb",
  "thegamesdb",
  "tmdb",
  "wikidata",
] as const;

type ProviderTerm = (typeof PROVIDER_TERMS)[number];
type ProviderLiteralInventory = Record<
  string,
  Partial<Record<ProviderTerm, number>>
>;

const ALLOWED_PROVIDER_LITERALS: ProviderLiteralInventory = {};

const SOURCE_ROOTS = ["src", "scripts"];
const SOURCE_EXTENSIONS = new Set([".cjs", ".js", ".ts", ".tsx"]);

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function listSourceFiles(dir: string, files: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const absolutePath = path.join(dir, entry.name);
    const relativePath = path.relative(process.cwd(), absolutePath);

    if (entry.isDirectory()) {
      if (relativePath === "src/services/providers") continue;
      if (relativePath.startsWith("src/services/providers/")) continue;
      listSourceFiles(absolutePath, files);
      continue;
    }

    if (!SOURCE_EXTENSIONS.has(path.extname(entry.name))) continue;
    if (/\.(test|spec)\.[tj]sx?$/.test(entry.name)) continue;
    if (entry.name.endsWith(".d.ts")) continue;

    files.push(absolutePath);
  }

  return files;
}

function inventoryProviderLiterals(): ProviderLiteralInventory {
  const inventory: ProviderLiteralInventory = {};
  const sourceFiles = SOURCE_ROOTS.flatMap((sourceRoot) =>
    listSourceFiles(path.join(process.cwd(), sourceRoot)),
  );

  for (const absolutePath of sourceFiles) {
    const text = fs.readFileSync(absolutePath, "utf8");
    const relativePath = path.relative(process.cwd(), absolutePath);
    const fileHits: Partial<Record<ProviderTerm, number>> = {};

    for (const term of PROVIDER_TERMS) {
      const quotedLiteral = new RegExp(
        `(["'\`])${escapeRegExp(term)}\\1`,
        "gi",
      );
      const matches = text.match(quotedLiteral);
      if (matches?.length) {
        fileHits[term] = matches.length;
      }
    }

    if (Object.keys(fileHits).length > 0) {
      inventory[relativePath] = fileHits;
    }
  }

  return Object.fromEntries(
    Object.entries(inventory).sort(([a], [b]) => a.localeCompare(b)),
  );
}

function diffInventory(
  actual: ProviderLiteralInventory,
  allowed: ProviderLiteralInventory,
): string[] {
  const files = Array.from(
    new Set([...Object.keys(actual), ...Object.keys(allowed)]),
  ).sort();
  const differences: string[] = [];

  for (const file of files) {
    const terms = Array.from(
      new Set([
        ...Object.keys(actual[file] ?? {}),
        ...Object.keys(allowed[file] ?? {}),
      ]),
    ).sort() as ProviderTerm[];

    for (const term of terms) {
      const actualCount = actual[file]?.[term] ?? 0;
      const allowedCount = allowed[file]?.[term] ?? 0;
      if (actualCount !== allowedCount) {
        differences.push(
          `${file} ${term}: expected ${allowedCount}, got ${actualCount}`,
        );
      }
    }
  }

  return differences;
}

describe("provider-blind core guard", () => {
  it("keeps provider literals outside provider modules on a shrinking allowlist", () => {
    const actual = inventoryProviderLiterals();
    const differences = diffInventory(actual, ALLOWED_PROVIDER_LITERALS);

    expect(differences).toEqual([]);
  });
});
