import { BOARDGAME_CATEGORY_CHROME_RE } from "@/core/identify/listingMerch";
import { VIDEO_GAME_PLATFORM_TOKEN_TERMS } from "@/core/identify/platforms/platforms";

export type GameEditionDefinition = {
  label: string;
  terms: readonly string[];
  /** Budget / classics reissue line (Player's Choice, Greatest Hits, …). */
  classicsLine?: boolean;
  /** Must stay on catalog art when present on the product title. */
  catalogRequired?: boolean;
};

export const GAME_EDITION_DEFINITIONS = [
  {
    label: "Player's Choice",
    terms: ["players choice", "player's choice"],
    classicsLine: true,
  },
  {
    label: "Nintendo Selects",
    terms: ["nintendo selects"],
    classicsLine: true,
  },
  { label: "Greatest Hits", terms: ["greatest hits"], classicsLine: true },
  { label: "Platinum", terms: ["platinum"], classicsLine: true },
  {
    label: "Essentials",
    terms: ["essential", "essentials"],
    classicsLine: true,
  },
  { label: "Classics", terms: ["classics"], classicsLine: true },
  { label: "Best Of", terms: ["best of"], classicsLine: true },
  { label: "Game of the Year", terms: ["goty", "game of the year"], catalogRequired: true },
  { label: "Deluxe", terms: ["deluxe"] },
  { label: "Ultimate", terms: ["ultimate"] },
  { label: "Legendary", terms: ["legendary"] },
  { label: "Premium", terms: ["premium"] },
  { label: "Gold", terms: ["gold"] },
  { label: "Remake", terms: ["remake"] },
  { label: "Definitive Edition", terms: ["definitive"] },
  { label: "Anniversary", terms: ["anniversary"] },
  { label: "Remastered", terms: ["remaster", "remastered"] },
  {
    label: "Edition Collector",
    terms: [
      "edition collector",
      "édition collector",
      "collector edition",
      "collectors edition",
    ],
  },
  {
    label: "Édition Limitée",
    terms: ["edition limitee", "édition limitée", "limited edition"],
  },
  {
    label: "Special Edition",
    terms: ["special edition", "édition spéciale", "edition speciale"],
    catalogRequired: true,
  },
  { label: "Collector", terms: ["collector", "collectors"] },
  { label: "Limited", terms: ["limited", "limitee"] },
  { label: "Edition", terms: ["edition", "editions", "édition", "éditions"] },
] as const satisfies readonly GameEditionDefinition[];

export const GAME_EDITION_TERMS = Array.from(
  new Set(GAME_EDITION_DEFINITIONS.flatMap((edition) => edition.terms)),
);

/**
 * Marketplace completeness / tier words that are edition-*packaging* noise but
 * must not become display editions ("Complete CIB" ≠ Complete Edition SKU).
 */
export const LISTING_EDITION_PACKAGING_EXTRA_TERMS = [
  "complete",
  "standard",
  "plus",
] as const;

/** Budget / classics reissue markers — derived from edition definitions. */
export const GAME_CLASSICS_KEYWORDS = Array.from(
  new Set(
    GAME_EDITION_DEFINITIONS.filter((edition) => edition.classicsLine).flatMap(
      (edition) => [...edition.terms],
    ),
  ),
);

export const LISTING_CONDITION_TERMS = [
  "neuf sous blister",
  "sous blister",
  "avec notice",
  "sans notice",
  "avec livret",
  "sans livret",
  "livret",
  "new",
  "neuf",
  "used",
  "occasion",
  "scelle",
  "scellé",
  "blister",
  "cib",
  "loose",
  "bon etat",
  "bon état",
  "tres bon etat",
  "très bon état",
  "excellent etat",
  "excellent état",
  "etat correct",
  "état correct",
  "comme neuf",
  "complet",
  "complete",
  "complet vf",
  "complet fr",
  "complet fr pal",
  "teste",
  "testé",
  "teste et fonctionnel",
  "testé et fonctionnel",
  "teste & fonctionnel",
  "testé & fonctionnel",
  "fonctionnel",
  "working",
  "tested",
  "tbe",
  "hs",
  "ottime condizioni",
  "condizioni ottime",
  "multilingua",
  "originale",
  "brand new",
  "sealed",
  "like new",
  "very good",
  "good condition",
  "von not specified",
  "zustand gut",
  "zustand neu",
  "zustand sehr gut",
  "sehr gut",
  "neuwertig",
  "gebraucht",
  "ovp",
  "come nuovo",
  "nuovo",
  "usato",
  "sigillato",
  // German listing condition / packaging noise ("Spiel + Hülle" = game + case).
  "spiel",
  "spiele",
  "hülle",
  "huelle",
  "hulle",
  "in ovp",
  "getestet",
  // Extra condition tokens seen as whole listing-metadata segments.
  "mint",
  "ottimo",
  "buono",
] as const;

export type ListingFormatDefinition = {
  term: string;
  /** Film/music/book carrier — conflicts with a game shelf product. */
  nonGameCarrier?: boolean;
  /** Physical disc/tape formats used for shelf-name routing (Bluray ≠ DVD). */
  physicalShelfFormat?: boolean;
};

export const LISTING_FORMAT_DEFINITIONS = [
  { term: "blu-ray", nonGameCarrier: true, physicalShelfFormat: true },
  { term: "bluray", nonGameCarrier: true, physicalShelfFormat: true },
  { term: "dvd", nonGameCarrier: true, physicalShelfFormat: true },
  { term: "uhd", nonGameCarrier: true, physicalShelfFormat: true },
  { term: "ultra hd", nonGameCarrier: true, physicalShelfFormat: true },
  { term: "ultra-hd", nonGameCarrier: true, physicalShelfFormat: true },
  { term: "vhs", nonGameCarrier: true, physicalShelfFormat: true },
  { term: "laserdisc", nonGameCarrier: true, physicalShelfFormat: true },
  { term: "laser disc", nonGameCarrier: true, physicalShelfFormat: true },
  { term: "cd", nonGameCarrier: true },
  { term: "album", nonGameCarrier: true },
  { term: "k7" },
  { term: "cassette" },
  { term: "disc" },
  { term: "disque" },
  { term: "big box" },
  { term: "bigbox" },
  { term: "boite" },
  { term: "boîte" },
  { term: "box" },
  { term: "vinyle", nonGameCarrier: true },
  { term: "vinyl", nonGameCarrier: true },
  { term: "lp", nonGameCarrier: true },
  { term: "livre", nonGameCarrier: true },
] as const satisfies readonly ListingFormatDefinition[];

export const LISTING_FORMAT_TERMS = LISTING_FORMAT_DEFINITIONS.map(
  (format) => format.term,
);

/**
 * Media formats that conflict with a game shelf (film / music / book carrier).
 * Derived from format definitions flagged `nonGameCarrier`.
 */
export const LISTING_NON_GAME_MEDIA_TERMS = LISTING_FORMAT_DEFINITIONS.filter(
  (format) => format.nonGameCarrier,
).map((format) => format.term);

/**
 * Disc/tape formats for shelf routing — derived from `physicalShelfFormat`.
 * Includes compact aliases ("blu ray") for name matching.
 */
export const LISTING_PHYSICAL_SHELF_FORMAT_TERMS = Array.from(
  new Set([
    ...LISTING_FORMAT_DEFINITIONS.filter(
      (format) => format.physicalShelfFormat,
    ).flatMap((format) => {
      const spaced = format.term.toLowerCase().replace(/-/g, " ");
      return [format.term.toLowerCase(), spaced];
    }),
    "4k",
  ]),
);

/**
 * Companion / non-game context tokens that must not win a game barcode
 * (OST, guide, CD, …). Derived from carriers + closed honesty-gate extras.
 */
export const NON_CANONICAL_CONTEXT_TOKENS = new Set([
  ...LISTING_NON_GAME_MEDIA_TERMS.map((term) =>
    term.toLowerCase().replace(/[\s-]+/g, ""),
  ),
  ...LISTING_NON_GAME_MEDIA_TERMS.flatMap((term) =>
    term
      .toLowerCase()
      .replace(/-/g, " ")
      .split(/\s+/)
      .filter(
        (token) => token.length >= 2 && token !== "ultra" && token !== "hd",
      ),
  ),
  "orchestra",
  "soundtrack",
  "ost",
  "fan",
  "fanbook",
  "guide",
  "book",
  "artbook",
]);

/**
 * Bundle / collection product markers: if the item title carries one, catalog
 * art that drops it is the wrong SKU (base game art for a trilogy, etc.).
 */
export const PRODUCT_COLLECTION_MARKER_GROUPS: readonly (readonly string[])[] = [
  ["trilogy", "trilogie"],
  ["collection"],
  ["saga"],
  ["compilation", "anthology", "anthologie"],
];

/**
 * Phrase groups required on catalog attachments when present on the product.
 * Collection markers + editions flagged `catalogRequired`.
 */
export const CATALOG_REQUIRED_TITLE_MARKER_GROUPS: readonly (readonly string[])[] =
  [
    ...PRODUCT_COLLECTION_MARKER_GROUPS,
    ...GAME_EDITION_DEFINITIONS.filter((edition) => edition.catalogRequired).map(
      (edition) => edition.terms,
    ),
  ];

/** Publisher / studio labels commonly glued as listing suffixes. */
export const LISTING_PUBLISHER_SUFFIX_TERMS = [
  "codemasters",
  "atari",
  "ubisoft",
  "konami",
  "sega",
  "capcom",
  "lucas arts",
  "lucasarts",
  "nintendo",
  "ea games",
  "electronic arts",
  "ea sports",
  "ea",
  "microsoft xbox",
  "microsoft",
  "sony",
  "walt disney",
  "disney",
  "square enix",
  "asmodee",
  "space cowboys",
] as const;

/** Single-token publisher brands for franchise/noise filters. */
export const LISTING_PUBLISHER_BRAND_TOKENS = Array.from(
  new Set(
    LISTING_PUBLISHER_SUFFIX_TERMS.flatMap((term) =>
      term
        .toLowerCase()
        .split(/\s+/)
        .filter((token) => token.length >= 2),
    ),
  ),
);

/**
 * Calendar month names in marketplace magazine/comic copy ("Picsou janvier 2020").
 * Closed factual calendar taxonomy — not product vocabulary.
 */
export const LISTING_CALENDAR_MONTH_TERMS = [
  "janvier",
  "fevrier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "aout",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "decembre",
  "décembre",
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
] as const;

/**
 * Core media nouns: "sans jeu" / "no disc" means the listing is not the product.
 */
export const LISTING_DISCARD_MEDIA_NOUNS = [
  "jeu",
  "game",
  "disc",
  "disque",
  "cartouche",
  "cartridge",
] as const;

/**
 * Packaging / manual nouns sold alone or empty (reverse-meaning discard).
 */
export const LISTING_DISCARD_PACKAGING_NOUNS = [
  "boitier",
  "boite",
  "box",
  "case",
  "notice",
  "livret",
  "manual",
  "mode d emploi",
  "instructions",
  "jaquette",
] as const;

/** Plural media nouns that mark a multi-item lot when preceded by a count ≥ 2. */
export const LISTING_LOT_PLURAL_GAME_NOUNS = [
  "jeux",
  "games",
  "juegos",
  "giochi",
  "spiele",
] as const;

export const LISTING_LOT_PLURAL_BOOK_NOUNS = [
  "manga",
  "mangas",
  "bd",
  "bds",
  "tome",
  "tomes",
] as const;

/**
 * Atomic region / broadcast / language codes — closed factual taxonomy.
 * Compounds (pal fr, version française, import fr, region free) are structural
 * in listingChrome (`REGION_COMPOUND_SEGMENT_RE`).
 */
export const LISTING_REGION_TERMS = [
  "pal",
  "ntsc",
  "secam",
  "vf",
  "fr",
  "fra",
  "fre",
  "en",
  "eng",
  "de",
  "ger",
  "it",
  "ita",
  "es",
  "spa",
  "nl",
  "nld",
  "dut",
  "dutch",
  "eu",
  "eur",
  "us",
  "usa",
  "uk",
  "jp",
  "jpn",
  "japan",
  "version",
  "import",
] as const;

export const LISTING_NOISE_TERMS = [
  // Seller placeholders for an unknown/missing field — never part of a title.
  "inconnu",
  "inconnue",
  "unknown",
  // Bare media nouns / connectors (category phrases peel structurally).
  "jeu",
  "game",
  "pour",
  "for",
] as const;

function escapeTermPattern(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function termToPattern(term: string): string {
  return term.split(/\s+/).map(escapeTermPattern).join("[\\s._/-]+");
}

export function createTermMatcher(
  terms: readonly string[],
  flags = "gi",
): RegExp {
  const normalizedFlags = flags.includes("u") ? flags : `${flags}u`;
  const pattern = [...terms]
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
    .map(termToPattern)
    .join("|");
  return new RegExp(
    `(?<![\\p{L}\\p{N}])(?:${pattern || "a^"})(?![\\p{L}\\p{N}])`,
    normalizedFlags,
  );
}

export function createGameEditionMatcher(flags = "gi"): RegExp {
  return createTermMatcher(GAME_EDITION_TERMS, flags);
}

export function createNonGameMediaMatcher(flags = "gi"): RegExp {
  return createTermMatcher(LISTING_NON_GAME_MEDIA_TERMS, flags);
}

export const GAME_OF_THE_YEAR_TERMS = GAME_EDITION_DEFINITIONS.find(
  (edition) => edition.label === "Game of the Year",
)!.terms;

export function containsGameOfTheYearEdition(value: string): boolean {
  return containsAnyTerm(value, GAME_OF_THE_YEAR_TERMS);
}

export function containsAnyTerm(
  value: string,
  terms: readonly string[],
): boolean {
  const lower = value.toLowerCase();
  return terms.some((term) => lower.includes(term));
}

export function containsGameClassicsKeyword(value: string): boolean {
  return containsAnyTerm(value, GAME_CLASSICS_KEYWORDS);
}

/** Marketplace/condition noise penalized when picking a display title. */
export const DISPLAY_TITLE_NOISE_TERMS = [
  ...LISTING_NOISE_TERMS,
  ...LISTING_CONDITION_TERMS,
  "vintage",
] as const;

export function createDisplayTitleNoiseMatcher(flags = "gi"): RegExp {
  const terms = createTermMatcher(DISPLAY_TITLE_NOISE_TERMS, flags);
  // Board-game category chrome is a composition RE, not a parallel phrase list.
  const normalizedFlags = flags.includes("u") ? flags : `${flags}u`;
  return new RegExp(
    `(?:${terms.source}|${BOARDGAME_CATEGORY_CHROME_RE.source})`,
    normalizedFlags.includes("i") ? normalizedFlags : `${normalizedFlags}i`,
  );
}

/** Region / manual / platform-brand tokens that usually belong to listings. */
export const DISPLAY_TITLE_SUFFIX_NOISE_TERMS = [
  ...LISTING_REGION_TERMS,
  "notice",
  "manuale",
  "livret",
  "completo",
  ...VIDEO_GAME_PLATFORM_TOKEN_TERMS,
] as const;

export function createDisplayTitleSuffixNoiseMatcher(flags = "gi"): RegExp {
  return createTermMatcher(DISPLAY_TITLE_SUFFIX_NOISE_TERMS, flags);
}
