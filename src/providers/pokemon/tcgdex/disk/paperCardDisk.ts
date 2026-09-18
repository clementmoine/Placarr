/**
 * Disk helpers for Pokémon paper faces under `data/pokemon/cards/{set}/{lang}/{num}/`.
 */
import path from "node:path";

import { parsePrintKey } from "@/core/identify/printKey";
import { assetsCardUrl } from "@/lib/packAssetUrls";
import { packCardsDir } from "@/lib/packPaths";
import type { MetadataAttachment } from "@/types/metadataProvider";

import {
  listPokemonArtFiles,
  pokemonFaceSourceOf,
  resolvePokemonArtFilename,
} from "./faceChoice";
import { POKEMON_GAME } from "../fetch";

/** Live-style 3-digit folder (`4` → `004`). Non-numeric localIds kept as-is. */
export function pokemonCardFolderId(localId: string): string {
  const raw = localId.trim();
  if (/^\d+$/.test(raw)) return raw.padStart(3, "0");
  return raw.toLowerCase();
}

export function pokemonPaperCardDir(opts: {
  setId: string;
  lang: string;
  localId: string;
  cardsRoot?: string;
}): string {
  const root = opts.cardsRoot ?? packCardsDir("pokemon");
  return path.join(
    root,
    opts.setId.trim().toLowerCase(),
    opts.lang.trim().toLowerCase(),
    pokemonCardFolderId(opts.localId),
  );
}

export function pokemonPaperCardDirFromPrintKey(
  printKey: string,
  lang: string,
  cardsRoot?: string,
): string | null {
  const id = parsePrintKey(printKey);
  if (!id || id.game !== POKEMON_GAME) return null;
  return pokemonPaperCardDir({
    setId: id.set,
    lang,
    localId: id.number,
    cardsRoot,
  });
}

/**
 * `/assets/pokemon/cards/{set}/{lang}/{num}/{art}` when a local face exists.
 * Prefers the requested language, then `fr`, then `en`.
 */
export function localPokemonCatalogueArtUrl(
  printKey: string | null | undefined,
  language?: string | null,
  cardsRoot?: string,
): string | null {
  if (!printKey) return null;
  const id = parsePrintKey(printKey);
  if (!id || id.game !== POKEMON_GAME) return null;

  const langs = [
    (language ?? "fr").trim().toLowerCase(),
    "fr",
    "en",
  ].filter((v, i, arr) => v && arr.indexOf(v) === i);

  for (const lang of langs) {
    const cardDir = pokemonPaperCardDir({
      setId: id.set,
      lang,
      localId: id.number,
      cardsRoot,
    });
    const art = resolvePokemonArtFilename(cardDir, lang);
    if (!art) continue;
    return assetsCardUrl(
      "pokemon",
      {
        set: id.set.toLowerCase(),
        lang,
        card: pokemonCardFolderId(id.number),
      },
      art,
    );
  }
  return null;
}

/**
 * One cover attachment per `art.<source>.*` on disk. Default URL = face.json /
 * faceChoice winner (same as catalogue vignette). Core enrich + ItemModal pin
 * stay provider-blind.
 */
export function buildPokemonDiskArtAttachments(opts: {
  printKey: string;
  language?: string | null;
  source: string;
  title?: string | null;
  cardsRoot?: string;
}): { attachments: MetadataAttachment[]; defaultUrl: string | null } {
  const id = parsePrintKey(opts.printKey);
  if (!id || id.game !== POKEMON_GAME) {
    return { attachments: [], defaultUrl: null };
  }

  const langs = [
    (opts.language ?? "fr").trim().toLowerCase(),
    "fr",
    "en",
  ].filter((v, i, arr) => v && arr.indexOf(v) === i);

  for (const lang of langs) {
    const cardDir = pokemonPaperCardDir({
      setId: id.set,
      lang,
      localId: id.number,
      cardsRoot: opts.cardsRoot,
    });
    const arts = listPokemonArtFiles(cardDir);
    if (arts.length === 0) continue;

    const diskId = {
      set: id.set.toLowerCase(),
      lang,
      card: pokemonCardFolderId(id.number),
    };
    const defaultArt = resolvePokemonArtFilename(cardDir, lang);
    const defaultUrl = defaultArt
      ? assetsCardUrl("pokemon", diskId, defaultArt)
      : null;

    const ordered = defaultArt
      ? [defaultArt, ...arts.filter((a) => a !== defaultArt)]
      : arts;

    const attachments: MetadataAttachment[] = ordered.map((file) => {
      const faceSource = pokemonFaceSourceOf(file) ?? "live";
      return {
        type: "cover",
        url: assetsCardUrl("pokemon", diskId, file),
        title: opts.title?.trim() || faceSource,
        role: `pokemon-face-${faceSource}`,
        source: opts.source,
        coverProvenance: "catalog",
      };
    });

    return { attachments, defaultUrl };
  }

  return { attachments: [], defaultUrl: null };
}
