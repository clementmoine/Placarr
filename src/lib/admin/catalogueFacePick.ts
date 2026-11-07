/**
 * Choose which on-disk recto a catalogue tile shows.
 *
 * Language-specific prints keep the face of the tile locale. Everyone else may
 * borrow the best recto across `catalogueLocales` while the verso stays on the
 * tile locale (often localized — missing back is fine).
 *
 * Ranking = core criteria (pixels + provenance + filename markers) — see
 * {@link catalogueFaceRankScore}. No provider-name lists.
 */
import { catalogueFaceRankScore } from "@/core/enrich/media/catalogueFaceRank";
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

/** Higher is better — pixels + provenance + filename markers (core). */
export function catalogueFaceSlotScore(files: CardsIndexLangFiles): number {
  const art = catalogueFaceArtFile(files);
  if (!art) return -1;
  return catalogueFaceRankScore({
    artFile: art,
    width: files.artW,
    height: files.artH,
    coverProvenance:
      (files as { coverProvenance?: string | null }).coverProvenance ?? null,
    thumbOnly: !files.art && Boolean(files.thumb),
  });
}

function slotHasArtDims(files: CardsIndexLangFiles): boolean {
  return (files.artW ?? 0) > 0 && (files.artH ?? 0) > 0;
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
  const tileFace = (): ResolvedCatalogueFace => ({
    artLang: input.tileLang,
    files: input.tileFiles,
    file: tileArt,
    thumb: catalogueFaceThumbFile(input.tileFiles),
  });

  if (input.languageSpecific || !input.bestFaceAcrossLocales) {
    return tileFace();
  }

  const best = pickBestCatalogueFaceSlot(
    input.entry,
    input.catalogueLocales,
    input.tileLang,
  );
  const bestArt = best ? catalogueFaceArtFile(best.files) : null;
  if (!best || !bestArt) return tileFace();

  /*
    JA rectos carry different printed text (Carddass 忍/術 vs EU NI/TE). Empty
    FR shells may still borrow a JA scan when the print is neutral — never the
    reverse: a JA tile must not show a FR/EN retail face.
  */
  if (
    input.tileLang.toLowerCase() === "ja" &&
    best.lang.toLowerCase() !== "ja"
  ) {
    return tileFace();
  }

  if (tileArt) {
    const tileScore = catalogueFaceSlotScore(input.tileFiles);
    const bestScore = catalogueFaceSlotScore(best.files);
    /*
      Rank-only comparisons (neither side probed) must not steal a locale's own
      face — see N-412 FR Coleka vs EN drive without artW/artH.
    */
    if (!slotHasArtDims(input.tileFiles) && !slotHasArtDims(best.files)) {
      return tileFace();
    }
    if (bestScore <= tileScore) return tileFace();
  }

  return {
    artLang: best.lang,
    files: best.files,
    file: bestArt,
    thumb: catalogueFaceThumbFile(best.files),
  };
}
