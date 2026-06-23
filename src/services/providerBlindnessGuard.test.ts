import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const PROVIDER_TERMS = [
  "achatmoinscher",
  "apriloshop",
  "archichouette",
  "bcdjeux",
  "bgg",
  "boardgamegeek",
  "chasseauxlivres",
  "coverproject",
  "deezer",
  "discogs",
  "freakxy",
  "googlebooks",
  "howlongtobeat",
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
type ProviderLiteralInventory = Record<string, Partial<Record<ProviderTerm, number>>>;

const ALLOWED_PROVIDER_LITERALS: ProviderLiteralInventory = {
  "scripts/boardGameSourceLiveTest.ts": {
    boardgamegeek: 1,
    philibert: 1,
    wikidata: 1,
  },
  "scripts/providerLiveAudit.ts": {
    achatmoinscher: 1,
    chasseauxlivres: 1,
    freakxy: 1,
    ledenicheur: 1,
    picclick: 1,
    pricecharting: 1,
  },
  "scripts/providerRuntimeCheck.ts": {
    achatmoinscher: 1,
    bgg: 1,
    chasseauxlivres: 1,
    coverproject: 1,
    deezer: 1,
    discogs: 1,
    freakxy: 1,
    howlongtobeat: 1,
    igdb: 1,
    ledenicheur: 1,
    musicbrainz: 1,
    omdb: 1,
    openlibrary: 1,
    picclick: 1,
    pricecharting: 1,
    rawg: 1,
    screenscraper: 1,
    steam: 1,
    steamgriddb: 1,
    tmdb: 1,
  },
  "src/app/api/admin/test-provider/route.ts": {
    scandex: 1,
  },
  "src/app/shelves/[shelfId]/[itemId]/page.tsx": {
    bgg: 1,
    boardgamegeek: 2,
    pricecharting: 1,
    screenscraper: 1,
    steam: 2,
  },
  "src/components/admin/MetadataRefreshPanel.tsx": {
    screenscraper: 1,
  },
  "src/lib/attachmentDisplayLabels.ts": {
    achatmoinscher: 1,
    archichouette: 1,
    boardgamegeek: 2,
    chasseauxlivres: 1,
    coverproject: 1,
    deezer: 1,
    discogs: 1,
    howlongtobeat: 1,
    igdb: 1,
    launchbox: 1,
    ledenicheur: 1,
    ludifolie: 1,
    musicbrainz: 1,
    omdb: 1,
    philibert: 1,
    pricecharting: 1,
    rawg: 1,
    steam: 1,
    steamgriddb: 1,
    tmdb: 1,
    wikidata: 1,
  },
  "src/lib/barcode/cachePayload.ts": {
    screenscraper: 2,
  },
  "src/lib/barcode/regressionCases.ts": {
    screenscraper: 2,
  },
  "src/lib/barcode/sourceAssembly.ts": {
    achatmoinscher: 5,
    chasseauxlivres: 5,
    deezer: 1,
    discogs: 1,
    freakxy: 1,
    ledenicheur: 5,
    musicbrainz: 1,
    okkazeo: 1,
    openlibrary: 1,
    philibert: 1,
    picclick: 4,
    pricecharting: 1,
    scandex: 2,
    screenscraper: 1,
    tmdb: 1,
  },
  "src/lib/metadataDiscogs.ts": {
    discogs: 1,
  },
  "src/lib/playerFacts.ts": {
    achatmoinscher: 2,
    bcdjeux: 1,
    bgg: 1,
    boardgamegeek: 1,
    chasseauxlivres: 1,
    igdb: 2,
    launchbox: 2,
    ledenicheur: 1,
    lepassetemps: 1,
    ludifolie: 2,
    monsieurde: 1,
    omdb: 2,
    philibert: 2,
    pricecharting: 2,
    rawg: 2,
    screenscraper: 1,
    steam: 2,
    steamgriddb: 2,
    thegamesdb: 1,
    tmdb: 2,
  },
  "src/lib/priceCachePolicy.ts": {
    pricecharting: 1,
  },
  "src/services/barcodeResolver.ts": {
    achatmoinscher: 2,
    chasseauxlivres: 2,
    ledenicheur: 1,
    philibert: 1,
    pricecharting: 3,
  },
  "src/services/metadataFetch.ts": {
    pricecharting: 4,
    screenscraper: 2,
  },
  "src/services/priceResolver.ts": {
    achatmoinscher: 3,
    chasseauxlivres: 2,
    ledenicheur: 2,
    picclick: 2,
    pricecharting: 5,
  },
  "src/services/providerMappingAudit.ts": {
    boardgamegeek: 2,
    googlebooks: 2,
    openlibrary: 1,
    screenscraper: 1,
  },
  "src/types/providerModule.ts": {
    scandex: 1,
  },
};

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
