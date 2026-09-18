/**
 * Passe d'un catalogue local : schéma + index JSON + versos curés.
 *
 * Sans `seed`, le pack s'ouvre à zéro carte — un onglet vrai, pas un trou.
 * Avec `seed`, on pose d'abord les tirages attestés (titres, pas des faces
 * inventées), puis on exporte. `seedProducts` pose le scellé à part : un
 * wrapper n'est pas une carte.
 */
import { enrichCardsIndexArtDimensions } from "./enrichCardsIndexArtDimensions";
import {
  createLocalPrintsIndex,
  type LocalPrintsIndex,
} from "./localPrintsIndex";

export async function runLocalTcgPipeline(input: {
  packId: string;
  curatedDir: string;
  label: string;
  seed?: (
    index: LocalPrintsIndex,
  ) =>
    | { prints: number; titles: number }
    | Promise<{ prints: number; titles: number }>;
  seedProducts?: () =>
    | { written: number; skipped: number }
    | Promise<{ written: number; skipped: number }>;
  /** Limit curated set backs when several packs share one curated tree. */
  curatedIncludeSetCodes?: readonly string[];
  /**
   * After export, write `locale-specific-faces.json` for prints that already
   * have art in ≥2 of these locales (stops cross-lang recto borrowing).
   */
  writeLocaleSpecificFacesFromIndex?: {
    catalogueLocales: readonly string[];
    note?: string;
  };
}): Promise<{ cards: number; products: number }> {
  const index = createLocalPrintsIndex(input.packId);
  if (input.seed) {
    const seeded = await input.seed(index);
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

  if (input.writeLocaleSpecificFacesFromIndex) {
    const { readFileSync } = await import("node:fs");
    const { isCardsIndexV1 } = await import("@/effects/cardsIndex");
    const {
      buildLocaleSpecificFacesFromIndex,
      writeLocaleSpecificFaces,
    } = await import("@/lib/admin/localeSpecificFaces");
    try {
      const raw = JSON.parse(readFileSync(written.path, "utf8")) as unknown;
      if (isCardsIndexV1(raw)) {
        const doc = buildLocaleSpecificFacesFromIndex(
          raw,
          input.writeLocaleSpecificFacesFromIndex.catalogueLocales,
          input.writeLocaleSpecificFacesFromIndex.note,
        );
        const out = writeLocaleSpecificFaces(input.packId, doc);
        console.log(
          `── ${input.label} — ${out.faces} recto(s) language-specific → ${out.path}`,
        );
      }
    } catch (err) {
      console.warn(
        `── ${input.label} — locale-specific-faces : ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  const dims = await enrichCardsIndexArtDimensions(input.packId);
  if (dims.probed) {
    console.log(
      `── ${input.label} — ${dims.probed} face${dims.probed === 1 ? "" : "s"} dimensionnée${dims.probed === 1 ? "" : "s"} (${dims.landscapePrints} paysage)`,
    );
  }

  const { ensureCuratedPackAssets } = await import(
    /* webpackIgnore: true */
    "@/providers/shared/cardCatalogue/curatedAssets"
  );
  await ensureCuratedPackAssets({
    packId: input.packId,
    curatedDir: input.curatedDir,
    options: input.curatedIncludeSetCodes
      ? { includeSetCodes: input.curatedIncludeSetCodes }
      : undefined,
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
