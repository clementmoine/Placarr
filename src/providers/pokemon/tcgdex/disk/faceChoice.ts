/**
 * Which stored face a Pokémon print shows.
 *
 * Live dumps still use bare `art.webp` (source `live`). Coleka / TCGPlayer /
 * pokemontcg.io keep `art.<source>.<ext>` like Naruto. Ranking = shared
 * cardFaces (pixels + provenance) — no FACE_PRIORITY name lists.
 */
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { probeFaceFileDimensionsSync } from "@/providers/shared/faceFileDimensions";
import {
  CARD_FACE_DECISION_FILE,
  CARD_FACE_ROLES,
  createCardFaceChoice,
  promoteResolvedFace,
  type CardFaceRole,
  type FaceDecision,
  type StoredFace as SharedStoredFace,
} from "@/providers/shared/cardFaces";

export const POKEMON_FACE_SOURCES = [
  "live",
  "mcdn",
  "pokemoncom",
  "trainers",
  "pokecardex",
  "pokellector",
  "coleka",
  "tcgdex",
  "limitless",
  "dittobase",
  "alamedyang",
  "cardnexus",
  "tcgplayer",
  "pokemontcg",
  "pkmcards",
] as const;

export type PokemonFaceSource = (typeof POKEMON_FACE_SOURCES)[number];

const POKEMON_LISTING_PHOTO = new Set<PokemonFaceSource>([
  "coleka",
  "tcgplayer",
  "pokemontcg",
  "pkmcards",
]);

export function pokemonFaceCoverProvenance(
  source: PokemonFaceSource,
): "catalog" | "listing_photo" {
  return POKEMON_LISTING_PHOTO.has(source) ? "listing_photo" : "catalog";
}

const choice = createCardFaceChoice<PokemonFaceSource>({
  sources: POKEMON_FACE_SOURCES,
  coverProvenance: "catalog",
  sourceCoverProvenance: pokemonFaceCoverProvenance,
});

export const POKEMON_FACE_ROLES = CARD_FACE_ROLES;
export type PokemonFaceRole = CardFaceRole;
export const POKEMON_FACE_DECISION_FILE = CARD_FACE_DECISION_FILE;
export type { FaceDecision };
export type StoredFace = SharedStoredFace<PokemonFaceSource>;

export const pokemonFaceFilename = choice.faceFilename;
export const pokemonFaceFileOf = choice.faceFileOf;
export const pickBestPokemonFace = choice.pickBestFace;
export const parsePokemonFaceDecision = choice.parseFaceDecision;
export const serializePokemonFaceDecision = choice.serializeFaceDecision;
export const recordPokemonFaceDecision = choice.recordFaceDecision;

const LIVE_ART_RE = /^art\.(webp|png|jpe?g)$/i;

/** `art.webp` → live; `art.coleka.webp` → coleka. */
export function pokemonFaceSourceOf(
  filename: string,
): PokemonFaceSource | null {
  const base = path.basename(filename);
  if (LIVE_ART_RE.test(base)) return "live";
  return choice.faceSourceOf(base);
}

export function listPokemonArtFiles(cardDir: string): string[] {
  if (!existsSync(cardDir) || !statSync(cardDir).isDirectory()) return [];
  return readdirSync(cardDir).filter((name) => {
    const low = name.toLowerCase();
    if (!low.startsWith("art.")) return false;
    if (low === "art.reconstructed.webp") return false;
    return pokemonFaceSourceOf(name) != null;
  });
}

function loadStoredPokemonFaces(
  cardDir: string,
  arts: readonly string[],
): StoredFace[] {
  const out: StoredFace[] = [];
  for (const file of arts) {
    const source = pokemonFaceSourceOf(file);
    if (!source) continue;
    // Soft-fill when probe fails — a lone dump on disk must still win over remote.
    const dims = probeFaceFileDimensionsSync(path.join(cardDir, file)) ?? {
      width: 1,
      height: 1,
    };
    out.push({
      source,
      file,
      width: dims.width,
      height: dims.height,
    });
  }
  return out;
}

/**
 * Displayed art filename — re-rank by pixels + provenance every time.
 * `face.json` is not SSOT (kept as optional dig audit trail only).
 */
export function resolvePokemonArtFilename(
  cardDir: string,
  lang = "fr",
): string | null {
  const arts = listPokemonArtFiles(cardDir);
  if (arts.length === 0) return null;
  // Lone dump — skip pixel probe (admin browse walks thousands of folders).
  if (arts.length === 1) return arts[0]!;

  const faces = loadStoredPokemonFaces(cardDir, arts);
  const best = pickBestPokemonFace(faces, lang);
  if (!best) return null;
  if (best === "live") {
    const live = arts.find((f) => LIVE_ART_RE.test(f));
    return live ?? null;
  }
  return (
    arts.find((f) => pokemonFaceSourceOf(f) === best) ??
    pokemonFaceFilename(best, "art", "webp")
  );
}

/** Refresh dig audit sidecar from files present in the card folder. */
export function refreshPokemonFaceDecision(
  cardDir: string,
  lang = "fr",
): string | null {
  return promoteResolvedFace({
    cardDir,
    filename: resolvePokemonArtFilename(cardDir, lang),
  });
}
