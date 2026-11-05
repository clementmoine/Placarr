/**
 * Disk helpers for Pokémon catalogue faces.
 *
 * Two layouts coexist under `data/pokemon/cards/`:
 * - Lang-first (paper harvest / canonical URL): `{lang}/{set}/{num}/`
 * - Set-first (Live CDN dump): `{set}/{lang}/{num}/`
 *
 * Same print = same card — Live `art.webp` counts as catalogue art, not
 * foil-only. Digital-only rows stay `printed=false` in sqlite (tcgp/misc).
 */
import path from "node:path";

import { parsePrintKey } from "@/core/identify/printKey";
import { liveSetCandidatesFromTcgdexSet } from "@/effects/pokemon/liveSetId";
import { remapCollectorNumberForLive } from "@/effects/pokemon/liveJoin";
import { assetsCardUrl } from "@/lib/packAssetUrls";
import { packCardsDir } from "@/lib/packPaths";
import type { MetadataAttachment } from "@/types/metadataProvider";

import {
  listPokemonArtFiles,
  pokemonFaceSourceOf,
  resolvePokemonArtFilename,
} from "./faceChoice";
import { POKEMON_GAME } from "../fetch";
import { normalizeTcgdexLocalId } from "../localSetIds";

/** Live-style 3-digit folder (`4` → `004`). Non-numeric localIds kept as-is. */
export function pokemonCardFolderId(localId: string): string {
  const raw = normalizeTcgdexLocalId(localId);
  if (/^\d+$/.test(raw)) return raw.padStart(3, "0");
  // `?` / `!` are awkward path segments — Unown punctuation forms.
  if (raw === "!") return "_excl";
  if (raw === "?") return "_qmark";
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
    opts.lang.trim().toLowerCase(),
    opts.setId.trim().toLowerCase(),
    pokemonCardFolderId(opts.localId),
  );
}

/** Live extract layout — set before language. */
export function pokemonLiveCardDir(opts: {
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

/**
 * Resolve an art basename from lang-first paper harvest, then Live set-first.
 * Sync on purpose — callers build `/assets/…/{file}` URLs; an accidental
 * `async` left Promises in the path (`…/[object%20Promise]`).
 */
export function resolvePokemonCatalogueArtFilename(opts: {
  setId: string;
  lang: string;
  localId: string;
  cardsRoot?: string;
}): string | null {
  const paper = resolvePokemonArtFilename(
    pokemonPaperCardDir(opts),
    opts.lang,
  );
  if (paper) return paper;
  return resolvePokemonArtFilename(pokemonLiveCardDir(opts), opts.lang);
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
 * `/assets/pokemon/cards/{lang}/{set}/{num}/{art}` when a local face exists.
 * Prefers the requested language, then `fr`, then `en` — unless `languages`
 * is passed (check-list FR must not silently serve an EN scan).
 *
 * Tries the catalogue set id first, then Live CDN stems with a remapped
 * collector number (Classic Collection `me05.5c` → `me5-5c`, etc.).
 */
export function localPokemonCatalogueArtUrl(
  printKey: string | null | undefined,
  language?: string | null,
  cardsRoot?: string,
  opts?: { languages?: readonly string[] },
): string | null {
  if (!printKey) return null;
  const id = parsePrintKey(printKey);
  if (!id || id.game !== POKEMON_GAME) return null;

  const langs = (
    opts?.languages?.length
      ? [...opts.languages]
      : [(language ?? "fr").trim().toLowerCase(), "fr", "en"]
  )
    .map((v) => v.trim().toLowerCase())
    .filter((v, i, arr) => v && arr.indexOf(v) === i);

  const liveNumber = remapCollectorNumberForLive(id.set, id.number);
  const liveStems = liveSetCandidatesFromTcgdexSet(id.set).filter(
    (stem) => stem !== id.set.toLowerCase(),
  );

  const tryArt = (setId: string, localId: string): string | null => {
    for (const lang of langs) {
      const art = resolvePokemonCatalogueArtFilename({
        setId,
        lang,
        localId,
        cardsRoot,
      });
      if (!art) continue;
      // Canonical URL stays lang-first; assets rewrite serves set-first bytes.
      return assetsCardUrl(
        "pokemon",
        {
          set: setId.trim().toLowerCase(),
          lang,
          card: pokemonCardFolderId(localId),
        },
        art,
      );
    }
    return null;
  };

  // Catalogue folder first (TCGdex id + printed localId).
  const catalogueHit = tryArt(id.set, id.number);
  if (catalogueHit) return catalogueHit;

  // Live CDN stems use Live numbering — never the unmapped TCGdex localId
  // (Classic Collection me05.5c #001 ≠ me5-5c/001).
  if (liveNumber) {
    for (const stem of liveStems) {
      const hit = tryArt(stem, liveNumber);
      if (hit) return hit;
    }
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
    const paperDir = pokemonPaperCardDir({
      setId: id.set,
      lang,
      localId: id.number,
      cardsRoot: opts.cardsRoot,
    });
    const liveDir = pokemonLiveCardDir({
      setId: id.set,
      lang,
      localId: id.number,
      cardsRoot: opts.cardsRoot,
    });
    const paperArts = listPokemonArtFiles(paperDir);
    const paperSet = new Set(paperArts);
    const arts = [
      ...paperArts,
      ...listPokemonArtFiles(liveDir).filter((file) => !paperSet.has(file)),
    ];
    if (arts.length === 0) continue;

    const diskId = {
      set: id.set.toLowerCase(),
      lang,
      card: pokemonCardFolderId(id.number),
    };
    const defaultArt = resolvePokemonCatalogueArtFilename({
      setId: id.set,
      lang,
      localId: id.number,
      cardsRoot: opts.cardsRoot,
    });
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
