/**
 * Choose which on-disk recto a catalogue tile shows.
 *
 * Language-specific prints keep the face of the tile locale. Everyone else may
 * borrow the best recto across `catalogueLocales` while the verso stays on the
 * tile locale (often localized — missing back is fine).
 */
import type {
  CardsIndexEntry,
  CardsIndexLangFiles,
} from "@/effects/cardsIndex";

export type CatalogueFaceSlot = {
  lang: string;
  files: CardsIndexLangFiles;
};

export type ResolvedCatalogueFace = {
  /** Locale whose `art` file is shown (may differ from the tile locale). */
  artLang: string;
  files: CardsIndexLangFiles;
  file: string | null;
  thumb: string | null;
};

export function catalogueFaceArtFile(
  files: CardsIndexLangFiles,
): string | null {
  if (files.art && /\.corrected\./i.test(files.art)) return files.art;
  if (files.art) return files.art;
  return files.thumb ?? null;
}

function catalogueFaceThumbFile(files: CardsIndexLangFiles): string | null {
  if (files.art) return files.thumb ?? null;
  return null;
}

function catalogueFaceSourceRank(artFile: string): number {
  const match = /^art\.([^.]+)\./i.exec(artFile.trim());
  const source = match?.[1]?.toLowerCase() ?? "";
  /*
    Filename convention across packs: `art.<source>.<ext>`. Rank reflects typical
    scan quality, not TCG identity — publisher/shop photos beat marketplace glare.
  */
  if (source.includes("corrected")) return 100;
  if (source.includes("reconstructed")) return 95;
  // AnimeCollection HD FR — source principale Ninja Ranks (au-dessus de Coleka).
  if (source === "animecollection") return 90;
  if (source === "inkworks" || source === "arcadegamecards") return 85;
  if (source === "imadoki") return 55;
  if (source === "coleka") return 35;
  if (source === "blogger") return 30;
  return 50;
}

/** Higher is better — area × source quality; unknown dims still beat missing art. */
export function catalogueFaceSlotScore(files: CardsIndexLangFiles): number {
  const art = catalogueFaceArtFile(files);
  if (!art) return -1;
  const w = files.artW ?? 0;
  const h = files.artH ?? 0;
  const area = w > 0 && h > 0 ? w * h : 1;
  let score = Math.floor(area * (catalogueFaceSourceRank(art) / 50));
  if (!files.art && files.thumb) score = Math.floor(score * 0.5);
  return score;
}

export function pickBestCatalogueFaceSlot(
  entry: CardsIndexEntry,
  catalogueLocales?: readonly string[],
  preferLang?: string,
): CatalogueFaceSlot | null {
  const candidates: CatalogueFaceSlot[] = catalogueLocales?.length
    ? catalogueLocales.map((lang) => ({
        lang,
        files: entry.langs[lang] ?? {},
      }))
    : Object.entries(entry.langs).map(([lang, files]) => ({
        lang,
        files: files ?? {},
      }));

  const prefer = preferLang?.trim().toLowerCase();
  let best: (CatalogueFaceSlot & { score: number }) | null = null;
  for (const slot of candidates) {
    const score = catalogueFaceSlotScore(slot.files);
    if (score < 0) continue;
    const beats =
      !best ||
      score > best.score ||
      (score === best.score &&
        prefer != null &&
        slot.lang.toLowerCase() === prefer);
    if (beats) {
      best = { ...slot, score };
    }
  }
  return best;
}

export function resolveCatalogueFace(input: {
  entry: CardsIndexEntry;
  tileLang: string;
  tileFiles: CardsIndexLangFiles;
  catalogueLocales?: readonly string[];
  languageSpecific: boolean;
  bestFaceAcrossLocales: boolean;
}): ResolvedCatalogueFace {
  const tileArt = catalogueFaceArtFile(input.tileFiles);
  if (input.languageSpecific || !input.bestFaceAcrossLocales) {
    return {
      artLang: input.tileLang,
      files: input.tileFiles,
      file: tileArt,
      thumb: catalogueFaceThumbFile(input.tileFiles),
    };
  }

  const best = pickBestCatalogueFaceSlot(
    input.entry,
    input.catalogueLocales,
    input.tileLang,
  );
  if (best && catalogueFaceArtFile(best.files)) {
    return {
      artLang: best.lang,
      files: best.files,
      file: catalogueFaceArtFile(best.files),
      thumb: catalogueFaceThumbFile(best.files),
    };
  }

  return {
    artLang: input.tileLang,
    files: input.tileFiles,
    file: tileArt,
    thumb: catalogueFaceThumbFile(input.tileFiles),
  };
}
