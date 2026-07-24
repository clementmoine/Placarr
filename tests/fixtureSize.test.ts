import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Garde-fou taille des fixtures réseau : GitHub rejette tout push contenant un
 * blob > 100 Mo (une capture de sitemap non tronquée a déjà atteint 362 Mo et
 * bloqué la branche). L'enregistrement tronque les corps à 128 ko et saute les
 * sitemaps (tests/helpers/httpReplay.ts) — ce test verrouille le résultat.
 */
const FIXTURES_DIR = join(process.cwd(), "tests/fixtures");
const MAX_FIXTURE_BYTES = 25 * 1024 * 1024;

function listFilesRecursively(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) listFilesRecursively(path, files);
    else files.push(path);
  }
  return files;
}

describe("fixtures réseau", () => {
  it("aucune fixture ne dépasse 25 Mo (limite GitHub : 100 Mo)", () => {
    const oversized = listFilesRecursively(FIXTURES_DIR)
      .map((path) => ({ path, size: statSync(path).size }))
      .filter((file) => file.size > MAX_FIXTURE_BYTES)
      .map(
        (file) => `${file.path} (${(file.size / 1024 / 1024).toFixed(1)} Mo)`,
      );

    expect(oversized).toEqual([]);
  });
});
