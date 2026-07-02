import {
  detectVideoGamePlatformKey,
  type VideoGamePlatformKey,
} from "@/lib/games/platforms";
import { detectShelfGamePlatformKey } from "@/lib/metadata/platform";

export type { VideoGamePlatformKey } from "@/lib/games/platforms";

export function cleanCode(barcode?: string | null): string {
  if (!barcode) return "";

  return barcode.replace(/[^\d]/g, "").trim();
}

export function detectPlatformKey(
  name?: string | null,
): VideoGamePlatformKey | null {
  return detectVideoGamePlatformKey(name);
}

type ShelfLike = { id: string; name: string; type: string };

const GENERIC_SHELF_NAME_HINTS: Record<string, string[]> = {
  games: [
    "jeux video",
    "jeu video",
    "jeux videos",
    "jeu videos",
    "video games",
    "video game",
    "jeux",
    "games",
    "jv",
  ],
  movies: [
    "films",
    "film",
    "movies",
    "movie",
    "cinema",
    "dvd",
    "blu ray",
    "bluray",
    "vhs",
    "laserdisc",
    "series",
  ],
  books: ["livres", "livre", "books", "book", "bibliotheque", "library"],
  musics: [
    "musiques",
    "musique",
    "music",
    "musics",
    "albums",
    "album",
    "cd",
    "vinyles",
    "vinyle",
    "vinyl",
  ],
  boardgames: [
    "jeux de societe",
    "jeu de societe",
    "jeux de societes",
    "jeu de societes",
    "jeux de plateau",
    "jeu de plateau",
    "board games",
    "board game",
    "boardgames",
    "tabletop games",
    "jds",
  ],
};

function normalizeShelfName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function scoreGenericShelfName(shelfName: string, shelfType: string): number {
  const normalizedName = normalizeShelfName(shelfName);
  if (!normalizedName) return 0;

  const hints = GENERIC_SHELF_NAME_HINTS[shelfType] || [];
  const paddedName = ` ${normalizedName} `;
  let score = 0;

  for (const hint of hints) {
    const normalizedHint = normalizeShelfName(hint);
    if (!normalizedHint) continue;
    if (normalizedName === normalizedHint) {
      score = Math.max(score, 3);
      continue;
    }
    if (
      normalizedHint.length >= 4 &&
      paddedName.includes(` ${normalizedHint} `)
    ) {
      score = Math.max(score, 2);
    }
  }

  return score;
}

export function guessGenericShelfByType(
  shelfType: string | null | undefined,
  shelves: ShelfLike[],
): { shelfId: string; isGuessed: boolean } | null {
  if (!shelfType || !shelves.length) return null;

  let best: { shelfId: string; score: number } | null = null;
  for (const shelf of shelves) {
    if (shelf.type !== shelfType) continue;
    const score = scoreGenericShelfName(shelf.name, shelfType);
    if (score > 0 && (!best || score > best.score)) {
      best = { shelfId: shelf.id, score };
    }
  }

  return best ? { shelfId: best.shelfId, isGuessed: true } : null;
}

export function guessShelfByStrongNameMatch(
  productTitle: string,
  shelves: ShelfLike[],
): { shelfId: string; isGuessed: boolean } | null {
  const normalizedTitle = normalizeShelfName(productTitle);
  if (!normalizedTitle || !shelves.length) return null;

  // Spacing/punctuation-insensitive form so a "LaserDisc" clue matches a
  // "Laser Disc" / "Laser-Disc" shelf (and vice-versa).
  const compactTitle = normalizedTitle.replace(/\s+/g, "");
  let best: { shelfId: string; score: number } | null = null;
  for (const shelf of shelves) {
    const normalizedShelfName = normalizeShelfName(shelf.name);
    if (normalizedShelfName.length < 3) continue;

    let score = 0;
    if (
      normalizedTitle === normalizedShelfName ||
      compactTitle === normalizedShelfName.replace(/\s+/g, "")
    ) {
      score = 3;
    } else if (normalizedTitle.startsWith(`${normalizedShelfName} `)) {
      score = 2;
    }

    if (score > 0 && (!best || score > best.score)) {
      best = { shelfId: shelf.id, score };
    }
  }

  return best ? { shelfId: best.shelfId, isGuessed: true } : null;
}

function guessFirstShelfByType(
  shelfType: string | null | undefined,
  shelves: ShelfLike[],
): { shelfId: string; isGuessed: boolean } | null {
  if (!shelfType) return null;
  const typedShelf = shelves.find((shelf) => shelf.type === shelfType);
  return typedShelf ? { shelfId: typedShelf.id, isGuessed: true } : null;
}

function guessShelfByTitlePlatform(
  productTitle: string,
  shelves: ShelfLike[],
): { shelfId: string; isGuessed: boolean } | null {
  const titlePlatformKey = detectPlatformKey(productTitle);
  return guessShelfByPlatformKey(titlePlatformKey, shelves);
}

export function isShelfCompatibleWithPlatformKey(
  shelf: ShelfLike,
  platformKey: string | null | undefined,
): boolean {
  if (!platformKey) return true;
  if (shelf.type !== "games") return true;
  const shelfPlatformKey = detectShelfGamePlatformKey(shelf.name);
  if (!shelfPlatformKey) return true;
  return shelfPlatformKey === platformKey;
}

export function guessShelfFromBarcodeLookup(params: {
  shelfType?: string | null;
  platformKey?: string | null;
  searchNames?: string[];
  shelves: ShelfLike[];
  preferredShelfId?: string | null;
}): { shelfId: string; isGuessed: boolean } | null {
  const {
    shelfType,
    platformKey,
    searchNames = [],
    shelves,
    preferredShelfId,
  } = params;
  if (!shelves.length) return null;
  const typeCompatibleShelves = shelfType
    ? shelves.filter((shelf) => shelf.type === shelfType)
    : shelves;

  // Video games: a platform-specific shelf is the most precise match.
  const platformGuess = guessShelfByPlatformKey(platformKey, shelves);
  if (platformGuess) return platformGuess;

  for (const name of searchNames) {
    const guess = guessShelfByStrongNameMatch(name, typeCompatibleShelves);
    if (guess) return guess;
  }

  for (const name of searchNames) {
    const guess = guessShelfByTitlePlatform(name, shelves);
    if (guess) return guess;
  }

  const genericTypeGuess = guessGenericShelfByType(shelfType, shelves);
  if (genericTypeGuess) return genericTypeGuess;

  for (const name of searchNames) {
    const guess = guessBestShelf(name, typeCompatibleShelves);
    if (guess) return guess;
  }

  // Otherwise fall back to a shelf of the *resolved* type — the right home for a
  // board game / book / album / movie (and a single-games-shelf fallback). This
  // is what lets a freshly-created "Jeux de société" shelf be recommended.
  const typedShelfGuess = guessFirstShelfByType(shelfType, shelves);
  if (typedShelfGuess) return typedShelfGuess;

  if (preferredShelfId && platformKey) {
    const preferred = shelves.find((shelf) => shelf.id === preferredShelfId);
    if (preferred && isShelfCompatibleWithPlatformKey(preferred, platformKey)) {
      return { shelfId: preferred.id, isGuessed: false };
    }
  }

  return null;
}

export function guessBestShelf(
  productTitle: string,
  shelves: { id: string; name: string; type: string }[],
): { shelfId: string; isGuessed: boolean } | null {
  if (!productTitle || !shelves || shelves.length === 0) return null;

  const titlePlatformKey = detectPlatformKey(productTitle);
  if (titlePlatformKey) {
    // Look for a shelf of type 'games' that matches this platform key
    const matchingShelf = shelves.find((shelf) => {
      if (shelf.type !== "games") return false;
      const shelfPlatformKey = detectShelfGamePlatformKey(shelf.name);
      return shelfPlatformKey === titlePlatformKey;
    });

    if (matchingShelf) {
      return { shelfId: matchingShelf.id, isGuessed: true };
    }
  }

  // 2. If no platform match, try simple substring containment for category keyword matching.
  const titleLower = productTitle.toLowerCase();
  for (const shelf of shelves) {
    const shelfNameLower = shelf.name.toLowerCase().trim();
    // Ignore extremely short or generic shelf names
    if (
      shelfNameLower.length >= 3 &&
      ![
        "jeux",
        "games",
        "livres",
        "books",
        "films",
        "movies",
        "musics",
        "music",
      ].includes(shelfNameLower)
    ) {
      if (
        titleLower.includes(shelfNameLower) ||
        shelfNameLower.includes(titleLower)
      ) {
        return { shelfId: shelf.id, isGuessed: true };
      }
    }
  }

  return null;
}

export function guessShelfByPlatformKey(
  platformKey: string | null | undefined,
  shelves: { id: string; name: string; type: string }[],
): { shelfId: string; isGuessed: boolean } | null {
  if (!platformKey || !shelves || shelves.length === 0) return null;

  const matchingShelf = shelves.find((shelf) => {
    if (shelf.type !== "games") return false;
    return detectShelfGamePlatformKey(shelf.name) === platformKey;
  });

  return matchingShelf ? { shelfId: matchingShelf.id, isGuessed: true } : null;
}
