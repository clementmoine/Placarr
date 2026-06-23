export type GameEditionDefinition = {
  label: string;
  terms: readonly string[];
};

export const GAME_EDITION_DEFINITIONS = [
  { label: "Player's Choice", terms: ["players choice", "player's choice"] },
  { label: "Nintendo Selects", terms: ["nintendo selects"] },
  { label: "Greatest Hits", terms: ["greatest hits"] },
  { label: "Platinum", terms: ["platinum"] },
  { label: "Essentials", terms: ["essential", "essentials"] },
  { label: "Classics", terms: ["classics"] },
  { label: "Best Of", terms: ["best of"] },
  { label: "Game of the Year", terms: ["goty", "game of the year"] },
  { label: "Deluxe", terms: ["deluxe"] },
  { label: "Premium", terms: ["premium"] },
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
    label: "Edition Limitee",
    terms: ["edition limitee", "édition limitée", "limited edition"],
  },
  { label: "Collector", terms: ["collector", "collectors"] },
  { label: "Limited", terms: ["limited", "limitee"] },
  { label: "Edition", terms: ["edition", "editions", "édition", "éditions"] },
] as const satisfies readonly GameEditionDefinition[];

export const GAME_EDITION_TERMS = Array.from(
  new Set(GAME_EDITION_DEFINITIONS.flatMap((edition) => edition.terms)),
);

export const GAME_CLASSICS_KEYWORDS = [
  "classics",
  "platinum",
  "essential",
  "players choice",
  "player's choice",
  "greatest hits",
  "nintendo selects",
  "best of",
] as const;

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
] as const;

export const LISTING_FORMAT_TERMS = [
  "blu-ray",
  "bluray",
  "dvd",
  "vhs",
  "laserdisc",
  "laser disc",
  "cd",
  "k7",
  "cassette",
  "disc",
  "disque",
  "big box",
  "bigbox",
  "boite",
  "boîte",
  "box",
  "vinyle",
  "vinyl",
  "lp",
] as const;

export const LISTING_REGION_TERMS = [
  "pal fr",
  "pal vf",
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
  "eu",
  "eur",
  "us",
  "usa",
  "uk",
  "jp",
  "jpn",
  "japan",
  "region free",
  "version",
  "version francaise",
  "version française",
  "import fr",
  "import",
] as const;

export const LISTING_NOISE_TERMS = [
  "jeu video",
  "jeux video",
  "jeu pour",
  "game for",
  "jeu xbox",
  "jeu ps2",
  "jeu ps3",
  "jeu ps1",
  "jeu gamecube",
  "jeu wii",
  "jeu switch",
  "jeu pc",
  "jeu console",
  "jeu",
  "game",
  "pour",
  "for",
] as const;

export const LISTING_EXTRA_SUFFIX_TERMS = [
  "adresse course",
  "envoi rapide",
  "envoi rapide et suivi",
  "envoi suivi",
  "envoi",
  "jeu complet en",
  "jeu complet",
  "code vip",
  "carte vip",
  "vip non gratte",
  "vip non gratté",
  "non gratte",
  "non gratté",
  "mode d'emploi",
  "notice",
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
