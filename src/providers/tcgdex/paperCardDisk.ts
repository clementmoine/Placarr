/**
 * Disk helpers for Pokémon paper faces under `data/pokemon/cards/{set}/{lang}/{num}/`.
 */
import path from "node:path";

import { parsePrintKey } from "@/core/identify/printKey";
import { assetsCardUrl } from "@/lib/packAssetUrls";
import { packCardsDir } from "@/lib/packPaths";

import { resolvePokemonArtFilename } from "./faceChoice";
import { POKEMON_GAME } from "./fetch";

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
