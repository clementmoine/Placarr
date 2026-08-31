import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/** Quoted effect-pack ids outside allowed trees should shrink to `{}`. */
const ALLOWED_PACK_LITERALS: Record<string, Partial<Record<string, number>>> = {
  // Shelf-name / title hints — game keywords, not effectPack routing.
  "src/core/identify/query.ts": { lorcana: 1, pokemon: 1 },
  "src/core/enrich/titles/searchVariants.ts": { pokemon: 1 },
  "src/core/enrich/titles/variantIdentity.ts": { pokemon: 1 },
};

const SOURCE_ROOTS = ["src", "scripts"];
const SOURCE_EXTENSIONS = new Set([".cjs", ".js", ".ts", ".tsx"]);

const SKIP_DIR_PREFIXES = [
  "src/effects/",
  "src/providers/",
  "src/providers/lorcanatcg/",
  "src/providers/pokemontcglive/",
  "src/providers/narutocarddass/",
  "src/providers/icollect/",
  "src/providers/launchbox/",
  "src/providers/nointro/",

  "src/app/api/admin/foil-",
  "src/components/admin/Foil",
  "src/components/admin/TcgEffects",
  "src/components/admin/WebAdb",
  "src/lib/admin/foilStatus",
  "src/lib/admin/catalogueExtractRunner.ts",
  "src/lib/admin/foilCatalogSync.ts",
  "src/lib/admin/foilGaps.ts",
  "src/lib/admin/foilGapMaps.ts",
  "src/lib/admin/cataloguePacks.ts",
  "src/lib/admin/catalogueCards.ts",
  "src/lib/admin/catalogueCardsTypes.ts",
  "src/app/api/admin/catalogue-",
  "src/components/admin/Catalogue",
  "src/lib/foilMetaLoad.ts",
  "src/lib/foilMetaLoad.server.ts",
  "src/lib/packAssetUrls.ts",
  "src/lib/packPaths.ts",
  "src/lib/client/catalogueExtract.ts",
  // Foil extract enqueue — pack ids are the job target surface.
  "src/core/collect/jobs/backgroundJobs.ts",
  "src/lib/api/backgroundJobs.ts",
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function discoverEffectPackIds(): string[] {
  const effectsDir = path.join(process.cwd(), "src/effects");
  const ids: string[] = [];

  for (const entry of fs.readdirSync(effectsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const indexPath = path.join(effectsDir, entry.name, "index.ts");
    if (!fs.existsSync(indexPath)) continue;

    const text = fs.readFileSync(indexPath, "utf8");
    const constantMatch = text.match(
      /export const \w+_EFFECT_PACK_ID = ["']([^"']+)["']/,
    );
    if (constantMatch) {
      ids.push(constantMatch[1]);
      continue;
    }

    const registerMatch = text.match(
      /registerEffectPack\(\{[^}]*\bid:\s*["']([^"']+)["']/s,
    );
    if (registerMatch) ids.push(registerMatch[1]);
  }

  return [...new Set(ids)].sort();
}

function shouldSkipRelativePath(relativePath: string): boolean {
  return SKIP_DIR_PREFIXES.some((prefix) => relativePath.startsWith(prefix));
}

function listSourceFiles(dir: string, files: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const absolutePath = path.join(dir, entry.name);
    const relativePath = path.relative(process.cwd(), absolutePath);

    if (entry.isDirectory()) {
      if (shouldSkipRelativePath(`${relativePath}/`)) continue;
      listSourceFiles(absolutePath, files);
      continue;
    }

    if (!SOURCE_EXTENSIONS.has(path.extname(entry.name))) continue;
    if (/\.(test|spec)\.[tj]sx?$/.test(entry.name)) continue;
    if (entry.name.endsWith(".d.ts")) continue;

    if (shouldSkipRelativePath(relativePath)) continue;

    files.push(absolutePath);
  }

  return files;
}

function inventoryPackLiterals(
  packTerms: readonly string[],
): Record<string, Partial<Record<string, number>>> {
  const inventory: Record<string, Partial<Record<string, number>>> = {};
  const sourceFiles = SOURCE_ROOTS.flatMap((sourceRoot) =>
    listSourceFiles(path.join(process.cwd(), sourceRoot)),
  );

  for (const absolutePath of sourceFiles) {
    const text = fs.readFileSync(absolutePath, "utf8");
    const relativePath = path.relative(process.cwd(), absolutePath);
    const fileHits: Partial<Record<string, number>> = {};

    for (const term of packTerms) {
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
  actual: Record<string, Partial<Record<string, number>>>,
  allowed: Record<string, Partial<Record<string, number>>>,
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
    ).sort();

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

describe("effect-pack blindness guard", () => {
  const packIds = discoverEffectPackIds();

  it("discovers at least the lorcana pack from src/effects/*/index.ts", () => {
    expect(packIds).toContain("lorcana");
  });

  it("keeps effect pack ids outside effects/providers/dump on a shrinking allowlist", () => {
    const actual = inventoryPackLiterals(packIds);
    const differences = diffInventory(actual, ALLOWED_PACK_LITERALS);
    expect(differences).toEqual([]);
  });
});
