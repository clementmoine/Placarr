import {
  detectVideoGamePlatformKey,
  type VideoGamePlatformKey,
} from "@/core/identify/platforms/platforms";
import { detectShelfGamePlatformKey } from "@/core/enrich/platform";
import { LISTING_PHYSICAL_SHELF_FORMAT_TERMS } from "@/core/identify/listingTerms";

export type { VideoGamePlatformKey } from "@/core/identify/platforms/platforms";

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
  hardware: [
    "consoles",
    "console",
    "manettes",
    "manette",
    "controllers",
    "controller",
    "hardware",
    "peripheriques",
    "peripherique",
    "accessoires console",
  ],
  tcg: [
    "cartes",
    "carte",
    "tcg",
    "trading cards",
    "trading card",
    "pokemon",
    "lorcana",
  ],
  toys: [
    "jouets",
    "jouet",
    "toys",
    "toy",
    "figurines",
    "figurine",
    "amiibo",
    "lego",
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

/** Physical-format tokens — derived from listing format taxonomy (+ 4k). */
const PHYSICAL_FORMAT_TOKENS = LISTING_PHYSICAL_SHELF_FORMAT_TERMS;

function compactShelfName(value: string): string {
  return normalizeShelfName(value).replace(/\s+/g, "");
}

function physicalFormatTokenIn(value: string): string | null {
  const normalized = normalizeShelfName(value);
  const compact = compactShelfName(value);
  for (const token of PHYSICAL_FORMAT_TOKENS) {
    const normalizedToken = normalizeShelfName(token);
    const compactToken = normalizedToken.replace(/\s+/g, "");
    if (
      normalized === normalizedToken ||
      compact === compactToken ||
      normalized.startsWith(`${normalizedToken} `) ||
      normalized.endsWith(` ${normalizedToken}`) ||
      ` ${normalized} `.includes(` ${normalizedToken} `)
    ) {
      return normalizedToken;
    }
  }
  return null;
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
    // Short format tokens ("dvd", "vhs") must still match branded shelves
    // ("DVD Disney") via word containment.
    if (
      normalizedHint.length >= 3 &&
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
  options?: { formatToken?: string | null },
): { shelfId: string; isGuessed: boolean } | null {
  if (!shelfType || !shelves.length) return null;

  const formatToken = options?.formatToken
    ? normalizeShelfName(options.formatToken)
    : null;

  let best: { shelfId: string; score: number } | null = null;
  for (const shelf of shelves) {
    if (shelf.type !== shelfType) continue;
    const shelfFormat = physicalFormatTokenIn(shelf.name);
    // When the scan knows the physical format, never recommend a competing
    // format shelf via the soft "movies" generic scorer (Bluray vs DVD).
    if (
      formatToken &&
      shelfFormat &&
      compactShelfName(shelfFormat) !== compactShelfName(formatToken) &&
      !(
        compactShelfName(formatToken).includes(compactShelfName(shelfFormat)) ||
        compactShelfName(shelfFormat).includes(compactShelfName(formatToken))
      )
    ) {
      continue;
    }
    if (formatToken && !shelfFormat) {
      // Soft category shelves ("Films") stay eligible as a last resort.
    } else if (formatToken && shelfFormat) {
      const normalizedShelf = normalizeShelfName(shelf.name);
      if (
        !normalizedShelf.includes(formatToken) &&
        !compactShelfName(shelf.name).includes(compactShelfName(formatToken))
      ) {
        continue;
      }
    }

    let score = scoreGenericShelfName(shelf.name, shelfType);
    if (formatToken && shelfFormat) {
      // Prefer the format-aligned shelf, and the more specific branded one.
      score += 10 + normalizeShelfName(shelf.name).length / 100;
    }
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
  const compactTitle = compactShelfName(productTitle);
  let best: { shelfId: string; score: number; nameLength: number } | null =
    null;
  for (const shelf of shelves) {
    const normalizedShelfName = normalizeShelfName(shelf.name);
    if (normalizedShelfName.length < 3) continue;
    const compactShelf = compactShelfName(shelf.name);

    let score = 0;
    if (
      normalizedTitle === normalizedShelfName ||
      compactTitle === compactShelf
    ) {
      score = 3;
    } else if (normalizedTitle.startsWith(`${normalizedShelfName} `)) {
      // Title is more specific than the shelf ("DVD Disney Collection" → "DVD").
      score = 2;
    } else if (normalizedShelfName.startsWith(`${normalizedTitle} `)) {
      // Format clue "DVD" → branded shelf "DVD Disney".
      score = 2.5;
    } else if (
      compactShelf.startsWith(compactTitle) &&
      compactTitle.length >= 3 &&
      compactShelf.length > compactTitle.length
    ) {
      score = 2.5;
    }

    if (
      score > 0 &&
      (!best ||
        score > best.score ||
        (score === best.score &&
          normalizedShelfName.length > best.nameLength))
    ) {
      best = {
        shelfId: shelf.id,
        score,
        nameLength: normalizedShelfName.length,
      };
    }
  }

  return best ? { shelfId: best.shelfId, isGuessed: true } : null;
}

/**
 * Prefer shelves whose non-format name tokens appear in search clues
 * (brand "DISNEY JUNIOR" → shelf "DVD Disney").
 */
export function guessShelfBySearchTokenOverlap(
  searchNames: string[],
  shelves: ShelfLike[],
): { shelfId: string; isGuessed: boolean } | null {
  if (!searchNames.length || !shelves.length) return null;

  const searchBlob = normalizeShelfName(searchNames.join(" "));
  if (!searchBlob) return null;
  const paddedSearch = ` ${searchBlob} `;

  let best: { shelfId: string; score: number } | null = null;
  for (const shelf of shelves) {
    const normalizedShelf = normalizeShelfName(shelf.name);
    const tokens = normalizedShelf
      .split(/\s+/)
      .filter((token) => token.length >= 4)
      .filter((token) => !physicalFormatTokenIn(token));
    if (tokens.length === 0) continue;

    let score = 0;
    for (const token of tokens) {
      if (paddedSearch.includes(` ${token} `)) {
        score += token.length;
      }
    }
    if (score > 0 && (!best || score > best.score)) {
      best = { shelfId: shelf.id, score };
    }
  }

  return best ? { shelfId: best.shelfId, isGuessed: true } : null;
}

function formatTokenFromSearchNames(searchNames: string[]): string | null {
  for (const name of searchNames) {
    const token = physicalFormatTokenIn(name);
    if (token) return token;
  }
  return null;
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

  // Brand / studio tokens ("DISNEY JUNIOR") → branded format shelves
  // ("DVD Disney") before a bare "DVD" exact match or soft "Bluray" generic.
  const tokenOverlapGuess = guessShelfBySearchTokenOverlap(
    searchNames,
    typeCompatibleShelves,
  );
  if (tokenOverlapGuess) return tokenOverlapGuess;

  for (const name of searchNames) {
    const guess = guessShelfByStrongNameMatch(name, typeCompatibleShelves);
    if (guess) return guess;
  }

  for (const name of searchNames) {
    const guess = guessShelfByTitlePlatform(name, shelves);
    if (guess) return guess;
  }

  const formatToken = formatTokenFromSearchNames(searchNames);
  const genericTypeGuess = guessGenericShelfByType(shelfType, shelves, {
    formatToken,
  });
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

/**
 * Extra shelf-estimation clues from a barcode payload: physical format plus
 * marketplace brand/category facts (e.g. "DISNEY JUNIOR" → "DVD Disney").
 */
export function shelfSearchHintsFromBarcodePayload(payload: {
  mediaFormat?: string | null;
  observations?: Array<{
    kind?: string;
    factKind?: string;
    value?: string;
  }> | null;
}): string[] {
  const hints: string[] = [];
  const push = (value?: string | null) => {
    const trimmed = value?.trim();
    if (!trimmed) return;
    if (hints.some((hint) => normalizeShelfName(hint) === normalizeShelfName(trimmed))) {
      return;
    }
    hints.push(trimmed);
  };

  push(payload.mediaFormat);
  for (const observation of payload.observations || []) {
    if (observation.kind !== "fact") continue;
    if (
      observation.factKind === "brand" ||
      observation.factKind === "media-format"
    ) {
      push(observation.value);
    }
  }
  return hints;
}
