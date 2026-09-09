import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * `providers/shared/` ne connaît pas ses appelants.
 *
 * C'est de l'infrastructure : un pack s'en sert, elle ne se sert pas d'un pack.
 * L'inverse s'est pourtant installé — le code partagé importe Lorcana pour ses
 * logos de set, et l'ingest scellé appelle celui de Naruto. Deux conséquences,
 * mesurées le 2026-08-20 :
 *
 * - **ajouter un pack oblige à éditer le code partagé**, ce qui explique une
 *   bonne part des vingt points de contact d'un nouveau pack ;
 * - le graphe d'imports devient circulaire en pratique — `narutocarddass` importe
 *   `shared/sealedProducts`, qui réimporte `narutocarddass`.
 *
 * Le garde de cécité de `core/` ne pouvait rien voir : il saute `src/providers/`
 * en entier, et ne repère de toute façon qu'un id **exactement** entre
 * guillemets — `"@/providers/lorcanatcg/setLogos"` lui échappe deux fois.
 *
 * **La liste est vide depuis le 2026-08-21**, et doit le rester. Un pack fournit
 * son comportement, le code partagé l'appelle : un crochet déclaré au contrat
 * plutôt qu'un import. Rouvrir une exception, c'est réintroduire l'édition du
 * code partagé à chaque nouveau pack.
 */
const ALLOWED_SIBLING_IMPORTS: Readonly<Record<string, readonly string[]>> = {};

const SHARED_DIR = path.join(process.cwd(), "src", "providers", "shared");
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx"]);

function listSharedFiles(dir: string, files: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const absolutePath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      listSharedFiles(absolutePath, files);
      continue;
    }
    if (!SOURCE_EXTENSIONS.has(path.extname(entry.name))) continue;
    if (/\.(test|spec)\.tsx?$/.test(entry.name)) continue;
    if (entry.name.endsWith(".d.ts")) continue;
    files.push(absolutePath);
  }
  return files;
}

/** `@/providers/<name>/…` cité dans un import, sauf `shared` lui-même. */
function siblingProvidersImportedBy(text: string): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(
    /["'`]@\/providers\/([a-z0-9-]+)(?:\/[^"'`]*)?["'`]/gi,
  )) {
    const name = match[1]!;
    if (name === "shared") continue;
    found.add(name);
  }
  return [...found].sort();
}

describe("providers/shared ne dépend d'aucun provider", () => {
  it("n'importe un provider frère que sur une liste qui rétrécit", () => {
    const offenders: Record<string, string[]> = {};
    for (const absolutePath of listSharedFiles(SHARED_DIR)) {
      const rel = path
        .relative(SHARED_DIR, absolutePath)
        .split(path.sep)
        .join("/");
      const siblings = siblingProvidersImportedBy(
        fs.readFileSync(absolutePath, "utf8"),
      );
      if (siblings.length) offenders[rel] = siblings;
    }

    const expected = Object.fromEntries(
      Object.entries(ALLOWED_SIBLING_IMPORTS).map(([file, names]) => [
        file,
        [...names].sort(),
      ]),
    );
    expect(offenders).toEqual(expected);
  });

  /*
    Le compte, séparément du détail : un fichier de plus dans la liste est une
    régression même si chacun de ses imports y figurait déjà.
  */
  it("garde le nombre de fichiers fautifs à son plancher connu", () => {
    const count = listSharedFiles(SHARED_DIR).filter(
      (absolutePath) =>
        siblingProvidersImportedBy(fs.readFileSync(absolutePath, "utf8"))
          .length > 0,
    ).length;
    expect(count).toBeLessThanOrEqual(
      Object.keys(ALLOWED_SIBLING_IMPORTS).length,
    );
  });
});
