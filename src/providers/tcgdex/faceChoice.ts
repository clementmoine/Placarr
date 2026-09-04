/**
 * Which stored face a Pokémon print shows.
 *
 * Live dumps still use bare `art.webp` (source `live`). Coleka / TCGPlayer /
 * pokemontcg.io keep `art.<source>.<ext>` like Naruto. Ranking via shared
 * cardFaces; `art.webp` is treated as live without renaming the dump.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import {
  CARD_FACE_DECISION_FILE,
  CARD_FACE_ROLES,
  createCardFaceChoice,
  type CardFaceRole,
  type FaceDecision,
  type StoredFace as SharedStoredFace,
} from "@/providers/shared/cardFaces";

export const POKEMON_FACE_SOURCES = [
  "live",
  "coleka",
  "tcgplayer",
  "pokemontcg",
  "pkmcards",
] as const;

export type PokemonFaceSource = (typeof POKEMON_FACE_SOURCES)[number];

/** Prefer Live dump, then Coleka (FR), then EN CDNs, then pkmcards. */
export const POKEMON_FACE_PRIORITY: Record<
  string,
  readonly PokemonFaceSource[]
> = {
  fr: ["live", "coleka", "tcgplayer", "pokemontcg", "pkmcards"],
  en: ["live", "coleka", "tcgplayer", "pokemontcg", "pkmcards"],
};

const choice = createCardFaceChoice<PokemonFaceSource>({
  sources: POKEMON_FACE_SOURCES,
  priority: POKEMON_FACE_PRIORITY,
  coverProvenance: "catalog",
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

/**
 * Displayed art filename: face.json winner if still on disk, else re-rank by
 * source priority (dimensions unknown → priority only).
 */
export function resolvePokemonArtFilename(
  cardDir: string,
  lang = "fr",
): string | null {
  const arts = listPokemonArtFiles(cardDir);
  if (arts.length === 0) return null;

  const decisionPath = path.join(cardDir, POKEMON_FACE_DECISION_FILE);
  if (existsSync(decisionPath)) {
    try {
      const raw = JSON.parse(readFileSync(decisionPath, "utf8")) as {
        art?: string;
      };
      const named = raw.art?.trim();
      // `art.webp` (live) is not `art.<source>.<ext>` — still honour it.
      if (named && arts.includes(named) && pokemonFaceSourceOf(named)) {
        return named;
      }
      const parsed = named ? parsePokemonFaceDecision(
        readFileSync(decisionPath, "utf8"),
        "art",
      ) : null;
      if (parsed && arts.includes(parsed)) return parsed;
    } catch {
      /* re-rank */
    }
  }

  const faces: StoredFace[] = arts.map((file) => ({
    source: pokemonFaceSourceOf(file)!,
    file,
    width: 0,
    height: 0,
  }));
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

/** Refresh face.json from files present in the card folder. */
export function refreshPokemonFaceDecision(
  cardDir: string,
  lang = "fr",
): string | null {
  const winner = resolvePokemonArtFilename(cardDir, lang);
  if (!winner) return null;
  // Always re-pick from priority when dimensions are unknown so policy changes apply.
  const arts = listPokemonArtFiles(cardDir);
  const faces: StoredFace[] = arts.map((file) => ({
    source: pokemonFaceSourceOf(file)!,
    file,
    width: 0,
    height: 0,
  }));
  const best = pickBestPokemonFace(faces, lang);
  let file: string | null = null;
  if (best === "live") {
    file = arts.find((f) => LIVE_ART_RE.test(f)) ?? null;
  } else if (best) {
    file = arts.find((f) => pokemonFaceSourceOf(f) === best) ?? null;
  }
  if (!file) file = winner;
  recordPokemonFaceDecision(cardDir, "art", file);
  return file;
}
