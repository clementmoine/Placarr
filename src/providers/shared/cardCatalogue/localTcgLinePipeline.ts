/**
 * Passe d'un catalogue local : schéma + index JSON + versos curés.
 *
 * Sans `seed`, le pack s'ouvre à zéro carte — un onglet vrai, pas un trou.
 * Avec `seed`, on pose d'abord les tirages attestés (titres, pas des faces
 * inventées), puis on exporte. `seedProducts` pose le scellé à part : un
 * wrapper n'est pas une carte.
 */
import { packCardsDir } from "@/lib/packPaths";

import {
  createLocalPrintsIndex,
  type LocalPrintsIndex,
} from "./localPrintsIndex";

export async function runLocalTcgPipeline(input: {
  packId: string;
  curatedDir: string;
  label: string;
  seed?: (index: LocalPrintsIndex) => { prints: number; titles: number };
  seedProducts?: () =>
    | { written: number; skipped: number }
    | Promise<{ written: number; skipped: number }>;
}): Promise<{ cards: number; products: number }> {
  const index = createLocalPrintsIndex(input.packId);
  if (input.seed) {
    const seeded = input.seed(index);
    console.log(
      `── ${input.label} — ${seeded.prints} tirage${seeded.prints === 1 ? "" : "s"}, ${seeded.titles} titre${seeded.titles === 1 ? "" : "s"}`,
    );
  }
  const written = input.seed
    ? (index.exportIndex() ?? index.bootstrapEmpty())
    : index.bootstrapEmpty();
  console.log(
    `── ${input.label} — ${written.cards} carte${written.cards === 1 ? "" : "s"} → ${written.path}`,
  );

  const { installCuratedCardBacks, curatedCardsDir } = await import(
    /* webpackIgnore: true */
    "@/providers/shared/curatedCardsInstall"
  );
  await installCuratedCardBacks({
    curatedCardsDir: curatedCardsDir(input.curatedDir),
    destCardsDir: packCardsDir(input.packId),
  });

  let products = 0;
  if (input.seedProducts) {
    const sealed = await input.seedProducts();
    products = sealed.written;
    console.log(
      `── ${input.label} — ${sealed.written} produit${sealed.written === 1 ? "" : "s"} scellé${sealed.written === 1 ? "" : "s"}`,
    );
  }
  return { cards: written.cards, products };
}

export async function runEmptyLocalTcgPipeline(input: {
  packId: string;
  curatedDir: string;
  label: string;
}): Promise<{ cards: number; products: number }> {
  return runLocalTcgPipeline(input);
}
