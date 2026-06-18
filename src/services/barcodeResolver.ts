import { prisma } from "@/lib/prisma";
import { getSetting } from "@/services/settings";

import { AvesAPI } from "@/services/serp/avesAPI";
import { DataForSEO } from "@/services/serp/dataForSEO";
import { ScaleSerp } from "@/services/serp/scaleSerp";
import { SerpAPI } from "@/services/serp/serpAPI";
import { SerpWow } from "@/services/serp/serpWow";
import { ValueSerp } from "@/services/serp/valueSerp";
import { OmkarDDG } from "@/services/serp/omkarDDG";
import { fetchFromChasseAuxLivres } from "@/services/chasseAuxLivres";
import { fetchMetadataFromPriceCharting } from "@/services/priceCharting";
import { fetchFromAchatMoinsCher } from "@/services/achatMoinsCher";
import {
  confrontWithDatabase,
  getDatabaseSuggestions,
  pickSSCover,
  SSMedia,
  fetchFromOpenLibrary,
  fetchFromDeezer,
  fetchFromScreenScraper,
  fetchFromTMDB,
  cleanSearchQuery,
} from "@/services/metadata";

import axios from "axios";
import { decode as decodeHTMLEntities } from "html-entities";
import { extractProductName } from "@/lib/productName";
import {
  cleanCode,
  createBarcodeQuery,
  detectPlatformKey,
} from "@/lib/barcodeQuery";
import { fetchFromFreakxy } from "@/services/freakxy";
import { fetchFromApriloshop } from "@/services/apriloshop";
import { fetchFromPicClick } from "@/services/picclick";
import {
  markUnresolvedBarcodeScanResolved,
  recordUnresolvedBarcodeScan,
  type UnresolvedBarcodeSource,
} from "@/services/unresolvedBarcodeScans";
import levenshtein from "fast-levenshtein";

function deduplicate<T>(arr: T[], keyFn: (item: T) => string): T[] {
  const seen = new Set<string>();
  return arr.filter((item) => {
    const key = keyFn(item).toLowerCase().trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const SUFFIX_PATTERNS = [
  // Phrases & specific terms
  "neuf sous blister",
  "sous blister",
  "avec notice",
  "sans notice",
  "avec livret",
  "sans livret",
  "livret",
  "version francaise",
  "version française",
  "import fr",
  "import",

  // Platforms
  "nintendo switch",
  "switch",
  "playstation 5",
  "playstation 4",
  "playstation 3",
  "playstation 2",
  "playstation 1",
  "playstation",
  "ps5",
  "ps4",
  "ps3",
  "ps2",
  "ps1",
  "xbox series x",
  "xbox series s",
  "xbox series",
  "xbox sx",
  "xbox s/x",
  "xbox one",
  "xbox 360",
  "xbox original",
  "original xbox",
  "xbox",
  "wii u",
  "wiiu",
  "wii",
  "nintendo 3ds",
  "3ds",
  "nintendo ds",
  "ds",
  "game boy advance",
  "game boy color",
  "game boy",
  "gameboy advance",
  "gameboy color",
  "gameboy",
  "gba",
  "gbc",
  "gb",
  "dreamcast",
  "gamecube",
  "nes",
  "snes",
  "n64",
  "nintendo 64",
  "windows",
  "pc",

  // 1ère / original Xbox generation patterns
  "1ere generation",
  "1e generation",
  "1ere génération",
  "1e génération",
  "1 generation",
  "1 génération",
  "1ere gen",
  "1e gen",
  "1 gen",
  "first gen",
  "1st gen",
  "original",
  "vintage",
  "old",

  // Formats
  "blu-ray",
  "bluray",
  "dvd",
  "vhs",
  "cd",
  "k7",
  "cassette",
  "disc",
  "disque",
  "boite",
  "boîte",
  "box",

  // Conditions / listings / French terms
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
  "envoi rapide",
  "envoi rapide et suivi",
  "envoi suivi",
  "envoi",

  // Common listing prefixes/suffixes
  "jeu vidéo",
  "jeu video",
  "jeux vidéo",
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

  // Publishers/Developers (common listing labels)
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

  // Editions / labels
  "classics",
  "platinum",
  "essential",
  "essentials",
  "players choice",
  "player's choice",
  "greatest hits",
  "nintendo selects",
  "best of",
  "edition limitee",
  "édition limitée",
  "edition collector",
  "édition collector",
  "edition",
  "édition",

  // Regions
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
  "jp",
  "jpn",
  "uk",
  "version",
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

  // Conditions multilingues (EN/DE/IT) vues sur les annonces
  "von not specified",
  "zustand gut",
  "zustand neu",
  "zustand sehr gut",
  "sehr gut",
  "neuwertig",
  "gebraucht",
  "ovp",
  "brand new",
  "sealed",
  "like new",
  "region free",
  "come nuovo",
  "nuovo",
  "usato",
  "sigillato",
];

const PLATFORM_SUFFIX_PATTERNS = new Set([
  "nintendo switch",
  "switch",
  "playstation 5",
  "playstation 4",
  "playstation 3",
  "playstation 2",
  "playstation 1",
  "playstation",
  "ps5",
  "ps4",
  "ps3",
  "ps2",
  "ps1",
  "xbox series x",
  "xbox series s",
  "xbox series",
  "xbox sx",
  "xbox s/x",
  "xbox one",
  "xbox 360",
  "xbox original",
  "original xbox",
  "xbox",
  "wii u",
  "wiiu",
  "wii",
  "nintendo 3ds",
  "3ds",
  "nintendo ds",
  "ds",
  "pc",
  "windows",
]);

function isListingMetadataSegment(segment: string): boolean {
  const normalized = normalizeForTokens(segment)
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  if (!normalized) return true;

  return [
    /^(nintendo|sony|microsoft|sega|atari|ubisoft|ea|electronic arts)$/,
    /^(nintendo\s+)?(wii|switch|ds|3ds)$/,
    /^jeux?\s+(?:nintendo\s+)?(wii|switch|ds|3ds|gamecube|game\s+cube)$/,
    /^(playstation|ps[1-5]|xbox|xbox\s+360|xbox\s+one)$/,
    /^(pal|ntsc|fr|fra|fre|vf|version francaise)$/,
    /^(complet|complete|mint|cd|disc|disque|dvd|notice|livret|boite|boîte|box)$/,
    /^(sans|avec)\s+(notice|livret|boite|boîte)$/,
    /^(teste|testé|tested|working|fonctionnel|tbe|hs)$/,
    /^(zustand\s+(?:sehr\s+)?gut|zustand\s+neu|neuwertig|gebraucht|ovp)$/,
    /^von\s+not\s+specified$/,
    /^(come\s+nuovo|nuovo|usato|sigillato|ottimo|buono)$/,
    /^(brand\s+new|sealed|like\s+new|very\s+good|good\s+condition|region\s+free)$/,
    /\bjeu\s+video\b/,
    /\bjeux?\s+vid[eé]o\b/,
    /\bjeu\b.*\bnotice\b/,
    /\bavec\s+notice\b/,
    /\bsans\s+notice\b/,
    /\bavec\s+livret\b/,
    /\bsans\s+livret\b/,
    /\bversion\s+francaise\b/,
    /\bpal\s+fr\b/,
  ].some((pattern) => pattern.test(normalized));
}

function stripListingMetadataSegments(value: string): string {
  const parts = value
    .split(/\s*[-–—|]+\s*/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length <= 1) return value;

  let start = 0;
  let end = parts.length;

  while (start < end && isListingMetadataSegment(parts[start])) start += 1;
  while (end > start && isListingMetadataSegment(parts[end - 1])) end -= 1;

  const kept = parts.slice(start, end);
  return kept.length > 0 ? kept.join(" - ") : value;
}

function stripAccessorySegments(value: string): string {
  return value
    .replace(
      /\s*(?:\+|\bet\b|\bavec\b|\bsans\b)\s*(?:wii\s+)?(?:zapper|fusil|gun|volant|wheel|manette|controller|notice|wii\s+wheel)\b.*$/i,
      "",
    )
    .replace(
      /\s*\+\s*jeux?\s+wii\s*\+\s*(?:zapper|fusil|volant|wheel)\b.*$/i,
      " Wii",
    )
    .replace(/\s*\+\s*jeux?\s*$/i, "")
    .trim();
}

export function cleanTitleForDisplay(
  name: string,
  options: { preservePlatformSuffix?: boolean } = {},
): string {
  if (!name) return name;

  let cleaned = name.trim();

  // Replace escaped SQL single quotes or doubled single quotes with a single quote
  cleaned = cleaned.replace(/''/g, "'");

  // Remove wrapping quotes if they match
  if (
    (cleaned.startsWith("'") && cleaned.endsWith("'")) ||
    (cleaned.startsWith('"') && cleaned.endsWith('"'))
  ) {
    cleaned = cleaned.slice(1, -1).trim();
  }

  // Remove parenthesized/bracketed metadata first if it contains suffix words
  const bracketRegex = /[\s\-]*[([][^)]*[\])]/g;
  cleaned = cleaned.replace(bracketRegex, (match) => {
    const inner = match
      .replace(/[()[\]]/g, "")
      .toLowerCase()
      .trim();
    const isMetadata = SUFFIX_PATTERNS.some((p) => {
      const regex = new RegExp(`\\b${escapeRegExp(p)}\\b`, "i");
      return regex.test(inner);
    });
    return isMetadata ? "" : match;
  });

  const suffixPatterns = options.preservePlatformSuffix
    ? SUFFIX_PATTERNS.filter(
        (pattern) => !PLATFORM_SUFFIX_PATTERNS.has(pattern),
      )
    : SUFFIX_PATTERNS;
  const suffixRegex = new RegExp(
    `\\s*\\b(?:${suffixPatterns.map((p) => escapeRegExp(p)).join("|")})\\b\\s*$`,
    "i",
  );

  // Match 4-digit years at the end (optionally preceded by typical separators or publishers)
  const yearSuffixRegex =
    /\s*(?:[\-–|/()\[\]]|\b(?:codemasters|ea|atari|ubisoft|sega|nintendo|sony|microsoft|konami|capcom))\s*\b(?:19|20)\d{2}\b\s*$/i;

  const PREFIX_PATTERNS = [
    "jeu vidéo",
    "jeu video",
    "jeux vidéo",
    "jeux video",
    "jeu pour",
    "game for",
    "pack jeu",
    "pack",
    "jeu",
    "game",
    "dvd",
    "blu-ray",
    "bluray",
    "vhs",
    "cd",
    "k7",
    "cassette",
    "disc",
    "disque",
  ];

  const prefixRegex = new RegExp(
    `^(?:${PREFIX_PATTERNS.map((p) => escapeRegExp(p)).join("|")})\\b`,
    "i",
  );

  let prev;
  do {
    prev = cleaned;
    // Clean leading/trailing punctuation and spaces first
    cleaned = cleaned
      .replace(/^[\s+\-,.:;()/[\]\\]+/, "")
      .replace(/[\s+\-,.:;()/[\]\\]+$/, "")
      .trim();
    cleaned = stripAccessorySegments(cleaned);
    cleaned = stripListingMetadataSegments(cleaned);
    cleaned = cleaned
      .replace(
        /^(?:ancien\s+jeu\s+|ancien\s+)?nintendo\s+(?=(?!land\b).{4,})/i,
        "",
      )
      .replace(
        /^wii\s+(?=(?!sports\b|fit\b|play\b|party\b|music\b|chess\b).{4,})/i,
        "",
      )
      .replace(
        /^wii\s*u\s+(?=(?!sports\b|fit\b|play\b|party\b|music\b|chess\b|panorama\b).{4,})/i,
        "",
      )
      .replace(
        /\s+\b(?:complet|complete)?\s*(?:sur|pour|for)\s+(?:nintendo\s+)?(?:wii|switch|ds|3ds|gamecube|game\s+cube)\b.*$/i,
        "",
      )
      .replace(
        /\s+\bjeux?\s+(?:nintendo\s+)?(?:wii|switch|ds|3ds|gamecube|game\s+cube)\b.*$/i,
        "",
      )
      .replace(/\s+\bpal\b\s*(?:jeux?)?\b.*$/i, "")
      .replace(
        /\bnintendo\s+(?:wii|switch|ds|3ds|gamecube|game\s+cube)\s*$/i,
        "",
      )
      .replace(
        /\s+\bnintendo\s+(?:wii|switch|ds|3ds|gamecube|game\s+cube)\b\s*(?:pal|france|fr|vf|eur|eu)?\s*$/i,
        "",
      )
      .replace(/\b(?:pour|for)\s*$/i, "")
      .trim();

    // Remove wrapping quotes if they match
    if (
      (cleaned.startsWith("'") && cleaned.endsWith("'")) ||
      (cleaned.startsWith('"') && cleaned.endsWith('"'))
    ) {
      cleaned = cleaned.slice(1, -1).trim();
    }

    // Strip trailing suffix
    cleaned = cleaned
      .replace(suffixRegex, (match, offset, fullValue) => {
        const beforeMatch = normalizeForTokens(
          fullValue.slice(0, offset).trim(),
        );
        const suffix = normalizeForTokens(match.trim());
        const isOrdinalEdition =
          /\b(1ere|1er|1e|premiere|first|2eme|2e|seconde|second|3eme|3e)\s*$/.test(
            beforeMatch,
          ) && /^e?dition\b/.test(suffix);

        return isOrdinalEdition ? match : "";
      })
      .trim();
    // Strip trailing year suffix
    cleaned = cleaned.replace(yearSuffixRegex, "").trim();
    // Strip leading prefix
    cleaned = cleaned.replace(prefixRegex, "").trim();
  } while (cleaned !== prev);

  // Clean any remaining leading/trailing punctuation and double whitespaces
  cleaned = cleaned
    .replace(/^[\s+\-,.:;()/[\]\\]+/, "")
    .replace(/[\s+\-,.:;()/[\]\\]+$/, "")
    .replace(/\s+/g, " ")
    .trim();

  if (/^link'?s crossbow training$/i.test(cleaned)) {
    return "Link's Crossbow Training";
  }

  if (/^super monkeyball banana blitz$/i.test(cleaned)) {
    return "Super Monkey Ball: Banana Blitz";
  }

  if (/^mario\s+and\s+sonic\s+aux\s+jeux\s+olympiques/i.test(cleaned)) {
    return cleaned
      .replace(/^mario\s+and\s+sonic/i, "Mario & Sonic")
      .replace(/\bAux Jeux Olympiques\b/i, "aux Jeux Olympiques")
      .replace(/\bD'hiver\b/i, "d'Hiver");
  }

  return cleaned || name;
}

const providers = [
  new OmkarDDG(),
  new SerpWow(),
  new ValueSerp(),
  new ScaleSerp(),
  new SerpAPI(),
  new AvesAPI(),
  new DataForSEO(),
];

type PlatformSignal = {
  value?: string | null;
  weight: number;
};

function pickPlatformKeyFromSignals(signals: PlatformSignal[]): string | null {
  const scores = new Map<string, number>();

  for (const signal of signals) {
    if (!signal.value) continue;
    const platformKey = detectPlatformKey(signal.value);
    if (!platformKey) continue;
    scores.set(platformKey, (scores.get(platformKey) || 0) + signal.weight);
  }

  const ranked = Array.from(scores.entries()).sort((a, b) => b[1] - a[1]);
  const [best, second] = ranked;
  if (!best) return null;
  if (second && best[1] - second[1] < 0.4) return null;

  return best[0];
}

function pickPlatformKeyFromEvidence(
  evidence: ProductEvidence[],
): string | null {
  const signals = evidence
    .filter((item) => item.parsed.platformKey)
    .map((item) => ({
      value: item.parsed.platformKey,
      weight: item.sourceWeight + (item.isCanonical ? 0.22 : 0),
    }));

  return pickPlatformKeyFromSignals(signals);
}

function mapShelfTypeToCatalog(type?: string | null): string | null {
  if (!type) return null;
  switch (type) {
    case "books":
      return "fr";
    case "movies":
      return "dvd";
    case "musics":
      return "music";
    case "games":
      return "jeuxvideo";
    case "boardgames":
      return "toys";
    default:
      return null;
  }
}

interface ScanDexResult {
  id: number;
  source: string;
  igdb_metadata?: {
    id: number;
    name: string;
    platform?: {
      id: number;
      name: string;
    } | null;
  } | null;
}

async function fetchFromScanDex(
  barcode: string,
): Promise<ScanDexResult | null> {
  const token = process.env.SCANDEX_ACCESS_TOKEN;
  if (!token) {
    console.warn(
      "[ScanDex] Access token not configured in environment variables.",
    );
    return null;
  }

  try {
    const res = await axios.get<ScanDexResult>(
      `https://scandex.gamery.app/api/v2/lookup?value=${barcode}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        timeout: 5000,
      },
    );
    return res.data;
  } catch (error: any) {
    if (axios.isAxiosError(error) && error.response?.status === 404) {
      console.info(`[ScanDex] Barcode "${barcode}" not found (404).`);
    } else {
      console.error(
        `[ScanDex] Error fetching barcode "${barcode}":`,
        error.message,
      );
    }
    return null;
  }
}

async function getPrioritizedImageUrl(title: string): Promise<string | null> {
  const metas = await prisma.metadata.findMany({
    where: { title },
    select: { imageUrl: true },
  });

  if (metas.length === 0) return null;

  const sortedMetas = metas.sort((a, b) => {
    const urlA = a.imageUrl || "";
    const urlB = b.imageUrl || "";
    const isSSA = urlA.includes("screenscraper");
    const isSSB = urlB.includes("screenscraper");
    if (isSSA && !isSSB) return -1;
    if (!isSSA && isSSB) return 1;

    const isRawgA = urlA.includes("rawg.io");
    const isRawgB = urlB.includes("rawg.io");
    if (!isRawgA && isRawgB) return -1;
    if (isRawgA && !isRawgB) return 1;

    return 0;
  });

  return sortedMetas[0].imageUrl || null;
}

const PLATFORMS = [
  "wii u",
  "wiiu",
  "wii",
  "switch",
  "nintendo switch",
  "ps5",
  "playstation 5",
  "ps4",
  "playstation 4",
  "ps3",
  "playstation 3",
  "ps2",
  "playstation 2",
  "ps1",
  "playstation 1",
  "playstation",
  "xbox series",
  "xbox series x",
  "xbox series s",
  "xbox sx",
  "xbox s/x",
  "xbox one",
  "xbox 360",
  "xbox",
  "3ds",
  "nintendo 3ds",
  "ds",
  "nintendo ds",
  "pc",
  "windows",
  "dreamcast",
  "gamecube",
  "nes",
  "snes",
  "n64",
  "nintendo 64",
  "gameboy",
  "gba",
  "game boy advance",
  "game boy color",
  "game boy",
];

export function filterPlatformRedundancies(suggestions: string[]): string[] {
  return suggestions.filter((item, index) => {
    if (index === 0) return true;
    const itemLower = item.toLowerCase().trim();

    const prefixItem = suggestions.find((other) => {
      const otherLower = other.toLowerCase().trim();
      if (otherLower === itemLower || otherLower.length >= itemLower.length)
        return false;

      if (itemLower.startsWith(otherLower)) {
        const remaining = itemLower
          .slice(otherLower.length)
          .replace(/^[(\s\-]+|[)\s\-]+$/g, "")
          .trim();
        return PLATFORMS.includes(remaining);
      }
      return false;
    });

    return !prefixItem;
  });
}

interface SourceProduct {
  name: string;
  coverUrl?: string | null;
  isAlias?: boolean;
  region?: string | null;
  platformKey?: string | null;
}

interface ParsedProductName {
  rawName: string;
  cleanName: string;
  title: string;
  normalizedTitle: string;
  platformKey?: string;
  region?: string;
  edition?: string;
  year?: string;
  tokens: Set<string>;
  indicators: Set<string>;
}

interface ProductEvidence {
  providerName: string;
  rawName: string;
  cleanName: string;
  title: string;
  coverUrl: string | null;
  isCanonical: boolean;
  isAlias: boolean;
  region: string | null;
  priority: number;
  sourceWeight: number;
  parsed: ParsedProductName;
}

interface MatchEvidenceSummary {
  providers: string[];
  canonicalProviders: string[];
  rawCount: number;
  canonicalCount: number;
  marketplaceCount: number;
  hasCover: boolean;
  confidence: number;
  reasons: string[];
}

interface ResolvedMatch {
  name: string;
  suggestions: string[];
  coverUrl: string | null;
  confidence: number;
  evidence: MatchEvidenceSummary;
}

interface CompiledResult {
  provider: string;
  rawNames: string[];
  cleanName: string;
  suggestions: string[];
  matches: ResolvedMatch[];
  platformKey?: string | null;
}

const DISCARD_PATTERNS = [
  // No game
  /\bpas\s+de\s+jeu\b/i,
  /\bsans\s+jeu\b/i,
  /\bno\s+game\b/i,
  /\bjeu\s+non\s+inclus\b/i,
  /\bjeu\s+non\s+fourni\b/i,
  /\bno\s+disc\b/i,
  /\bsans\s+disque\b/i,
  /\bpas\s+de\s+disque\b/i,
  /\bsans\s+cartouche\b/i,
  /\bpas\s+de\s+cartouche\b/i,
  /\bno\s+cartridge\b/i,

  // Box/Case only
  /\bboitier\s+seul\b/i,
  /\bboîtier\s+seul\b/i,
  /\bcase\s+only\b/i,
  /\bboitier\s+vide\b/i,
  /\bboîtier\s+vide\b/i,
  /\bempty\s+case\b/i,
  /\bempty\s+box\b/i,
  /\bboite\s+seule\b/i,
  /\bboîte\s+seule\b/i,
  /\bboite\s+vide\b/i,
  /\bboîte\s+vide\b/i,
  /\bbox\s+only\b/i,

  // Manual/Notice only
  /\bnotice\s+seule\b/i,
  /\bnotice\s+seul\b/i,
  /\bmanual\s+only\b/i,
  /\bnotice\s+de\s+jeu\s+seule\b/i,
  /\bnotice\s+de\s+jeu\s+seul\b/i,
  /\bmode\s+d'emploi\s+seul\b/i,
  /\bmode\s+d'emploi\s+seule\b/i,
  /\blivret\s+seul\b/i,
  /\binstructions\s+only\b/i,

  // Notice + Case only (no game)
  /\bnotice\s+(?:et|\+)\s*jaquette\b/i,
  /\bjaquette\s*(?:et|\+)\s*notice\b/i,
  /\bboitier\s*(?:et|\+)\s*notice\b/i,
  /\bnotice\s*(?:et|\+)\s*boitier\b/i,
  /\bboîtier\s*(?:et|\+)\s*notice\b/i,
  /\bnotice\s*(?:et|\+)\s*boîtier\b/i,
  /\bnotice\s+jaquette\b/i,
  /\bjaquette\s+notice\b/i,
  /\bboitier\s+notice\b/i,
  /\bboîtier\s+notice\b/i,
  /\bnotice\s+boitier\b/i,
  /\bnotice\s+boîtier\b/i,
  /\bnotice\s+(?:et|\+)\s*boite\b/i,
  /\bnotice\s+(?:et|\+)\s*boîte\b/i,
  /\bboite\s*(?:et|\+)\s*notice\b/i,
  /\bboîte\s*(?:et|\+)\s*notice\b/i,

  // Multi-item lots are evidence for parsing, not valid single products.
  /\blot\s+\d+\s+jeux?\b/i,
  /\bpack\s+\d+\s+jeux?\b/i,
  /\b\d+\s+jeux?\s+(?:wii|switch|ps[1-5]|xbox|ds|3ds)\b/i,

  // Taglines de sites (pas un produit) — ex. comparateurs de prix
  /\bcomparateur\s+de\s+prix\b/i,
  /\bneutre\s+et\s+ind[ée]pendant\b/i,
  /\bmeilleurs?\s+prix\s+(?:du\s+web|en\s+ligne)\b/i,
];

export function isListingDiscardable(title: string): boolean {
  return DISCARD_PATTERNS.some((pattern) => pattern.test(title));
}

const BARCODE_CACHE_VERSION = "canonical-v23";
const CANONICAL_PROVIDERS = new Set([
  "ScreenScraper",
  "IGDB",
  "RAWG",
  "TMDB",
  "OpenLibrary",
  "Deezer",
  "ScanDex",
  "BoardGameGeek",
  "DatabaseResolver",
]);

export function isCanonicalProvider(providerName: string): boolean {
  return CANONICAL_PROVIDERS.has(providerName);
}

function providerListHasCanonical(providerName: string): boolean {
  const normalized = providerName.toLowerCase();
  return Array.from(CANONICAL_PROVIDERS).some((provider) =>
    normalized.includes(provider.toLowerCase()),
  );
}

export function versionProvider(provider: string): string {
  return provider.includes(BARCODE_CACHE_VERSION)
    ? provider
    : `${provider}+${BARCODE_CACHE_VERSION}`;
}

export function areLikelySameProduct(a: string, b: string): boolean {
  const aNorm = normalizeForTokens(cleanSearchQuery(a) || a);
  const bNorm = normalizeForTokens(cleanSearchQuery(b) || b);
  if (!aNorm || !bNorm) return false;
  if (aNorm === bNorm) {
    return true;
  }

  const aIndicators = getSequelIndicators(aNorm);
  const bIndicators = getSequelIndicators(bNorm);
  if (aIndicators.size !== bIndicators.size) return false;
  for (const indicator of aIndicators) {
    if (!bIndicators.has(indicator)) return false;
  }

  if (aNorm.includes(bNorm) || bNorm.includes(aNorm)) {
    return true;
  }

  const aTokens = new Set(aNorm.split(/[^a-z0-9]+/).filter(Boolean));
  const bTokens = new Set(bNorm.split(/[^a-z0-9]+/).filter(Boolean));
  const intersection = [...aTokens].filter(
    (token) => token.length > 3 && bTokens.has(token),
  );
  const dist = levenshtein.get(aNorm, bNorm);
  const maxLen = Math.max(aNorm.length, bNorm.length);
  const similarity = maxLen > 0 ? 1 - dist / maxLen : 0;
  const aFirstSig = [...aTokens].find((token) => token.length > 3);
  const bFirstSig = [...bTokens].find((token) => token.length > 3);

  return (
    similarity > 0.42 ||
    intersection.length >= 2 ||
    (!!aFirstSig && aFirstSig === bFirstSig && similarity > 0.22)
  );
}

function normalizeTitleIdentity(
  name: string,
  stripListingNoise = true,
): string {
  const title = stripListingNoise ? cleanSearchQuery(name) || name : name;
  return normalizeForTokens(title)
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseProductName(
  rawName: string,
  preserveDisplayTitle = false,
): ParsedProductName {
  const decoded = decodeHTMLEntities(rawName || "");
  const cleanName = cleanTitleForDisplay(decoded, {
    preservePlatformSuffix: preserveDisplayTitle,
  });
  const title = preserveDisplayTitle
    ? cleanName
    : cleanTitleForDisplay(cleanSearchQuery(cleanName) || cleanName);
  const normalizedTitle = normalizeTitleIdentity(
    title || cleanName,
    !preserveDisplayTitle,
  );
  const normalizedRaw = normalizeForTokens(cleanName);
  const tokens = new Set(normalizedTitle.split(/\s+/).filter(Boolean));
  const indicators = getSequelIndicators(normalizedTitle);
  const platformKey = detectPlatformKey(cleanName) || undefined;
  const region = normalizedRaw
    .match(/\b(pal|ntsc|usa|us|eur|eu|uk|jp|jpn|japan|fr|fra)\b/)?.[1]
    ?.toUpperCase();
  const year = cleanName.match(/\b(19|20)\d{2}\b/)?.[0];
  const edition = normalizedRaw.match(
    /\b(classics|platinum|essential|essentials|players choice|player's choice|greatest hits|nintendo selects|best of|collector|collectors|limited|limitee|limitee|edition)\b/,
  )?.[1];

  return {
    rawName,
    cleanName,
    title: title || cleanName,
    normalizedTitle,
    platformKey,
    region,
    edition,
    year,
    tokens,
    indicators,
  };
}

function sourceWeightForProvider(
  providerName: string,
  isAlias = false,
): number {
  const weights: Record<string, number> = {
    ScreenScraper: 0.46,
    IGDB: 0.45,
    RAWG: 0.42,
    TMDB: 0.44,
    OpenLibrary: 0.44,
    Deezer: 0.44,
    BoardGameGeek: 0.44,
    PriceCharting: 0.38,
    ScanDex: 0.36,
    DatabaseResolver: 0.34,
    DatabaseSuggestions: 0.26,
    ChasseAuxLivres: 0.16,
    AchatMoinsCher: 0.12,
    Freakxy: 0.1,
    Apriloshop: 0.1,
    PicClick: 0.08,
  };
  const weight =
    weights[providerName] ?? (isCanonicalProvider(providerName) ? 0.36 : 0.08);
  return isAlias ? weight * 0.72 : weight;
}

function indicatorsMatch(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const indicator of a) {
    if (!b.has(indicator)) return false;
  }
  return true;
}

function evidenceSimilarity(a: ProductEvidence, b: ProductEvidence): number {
  if (!a.parsed.normalizedTitle || !b.parsed.normalizedTitle) return 0;
  if (!indicatorsMatch(a.parsed.indicators, b.parsed.indicators)) return 0;

  const aNorm = a.parsed.normalizedTitle;
  const bNorm = b.parsed.normalizedTitle;
  if (aNorm === bNorm) return 1;
  if (a.coverUrl && b.coverUrl && a.coverUrl === b.coverUrl) return 0.98;

  const platformConflict =
    a.parsed.platformKey &&
    b.parsed.platformKey &&
    a.parsed.platformKey !== b.parsed.platformKey;
  if (platformConflict && a.isCanonical && b.isCanonical) {
    return 0;
  }

  const dist = levenshtein.get(aNorm, bNorm);
  const maxLen = Math.max(aNorm.length, bNorm.length);
  const levenshteinScore = maxLen > 0 ? 1 - dist / maxLen : 0;
  const containsScore =
    aNorm.includes(bNorm) || bNorm.includes(aNorm) ? 0.24 : 0;
  const intersection = [...a.parsed.tokens].filter(
    (token) => token.length > 3 && b.parsed.tokens.has(token),
  );
  const tokenScore =
    Math.min(0.36, intersection.length * 0.12) +
    (intersection.length >=
      Math.min(a.parsed.tokens.size, b.parsed.tokens.size) &&
    intersection.length > 0
      ? 0.12
      : 0);

  return Math.max(
    levenshteinScore,
    levenshteinScore + containsScore,
    tokenScore,
  );
}

const GENERIC_TITLE_TOKENS = new Set([
  "the",
  "and",
  "for",
  "with",
  "le",
  "la",
  "les",
  "des",
  "de",
  "du",
  "un",
  "une",
  "jeu",
  "game",
  "edition",
  "version",
]);

function distinctiveExtraTokens(
  a: ProductEvidence,
  b: ProductEvidence,
): string[] {
  const aTokens = [...a.parsed.tokens].filter(
    (token) => token.length > 3 && !GENERIC_TITLE_TOKENS.has(token),
  );
  const bTokens = [...b.parsed.tokens].filter(
    (token) => token.length > 3 && !GENERIC_TITLE_TOKENS.has(token),
  );
  return [
    ...aTokens.filter((token) => !b.parsed.tokens.has(token)),
    ...bTokens.filter((token) => !a.parsed.tokens.has(token)),
  ];
}

function areEvidenceSameProduct(
  a: ProductEvidence,
  b: ProductEvidence,
): boolean {
  const score = evidenceSimilarity(a, b);
  const extraTokens = distinctiveExtraTokens(a, b);
  const hasDistinctiveSubtitle =
    extraTokens.length > 0 &&
    a.parsed.tokens.size >= 2 &&
    b.parsed.tokens.size >= 2;

  if (
    hasDistinctiveSubtitle &&
    a.isCanonical === b.isCanonical &&
    score < 0.82
  ) {
    return false;
  }

  if (score >= 0.62) return true;

  const aFirstSig = [...a.parsed.tokens].find((token) => token.length > 3);
  const bFirstSig = [...b.parsed.tokens].find((token) => token.length > 3);
  return !!aFirstSig && aFirstSig === bFirstSig && score >= 0.36;
}

function buildProductEvidence(
  providerName: string,
  product: SourceProduct,
  canonicalOverride?: boolean,
): ProductEvidence | null {
  const isCanonical =
    canonicalOverride ??
    (isCanonicalProvider(providerName) || providerName.startsWith("Database"));
  const parsedBase = parseProductName(product.name, isCanonical);
  const parsed = product.platformKey
    ? { ...parsedBase, platformKey: product.platformKey }
    : parsedBase;
  if (!parsed.title || isListingDiscardable(parsed.cleanName)) return null;
  const priority = isCanonical ? (product.isAlias ? 1 : 2) : 0;

  return {
    providerName,
    rawName: parsed.rawName,
    cleanName: parsed.cleanName,
    title: parsed.title,
    coverUrl: product.coverUrl || null,
    isCanonical,
    isAlias: !!product.isAlias,
    region: product.region || null,
    priority,
    sourceWeight: sourceWeightForProvider(providerName, !!product.isAlias),
    parsed,
  };
}

function uniqueClean(
  values: string[],
  options: { preservePlatformSuffix?: boolean } = {},
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const cleaned = cleanTitleForDisplay(
      decodeHTMLEntities(value || ""),
      options,
    );
    const key = cleaned.toLowerCase().trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned);
  }
  return out;
}

async function buildCachedBarcodePayload(
  cachedResult: any,
  type: string | null,
  cleanedBarcode: string,
  options: { markStale?: boolean } = {},
) {
  const rawNames = cachedResult.rawNames.map((rn: any) => rn.value);
  const filteredNames = filterPlatformRedundancies(rawNames);
  const isCleanProvider = [
    "screenscraper",
    "igdb",
    "rawg",
    "tmdb",
    "openlibrary",
    "deezer",
    "scandex",
    "boardgamegeek",
    "databaseresolver",
  ].some((p) => cachedResult.provider.toLowerCase().includes(p));
  const mappedNamesWithPriority = filteredNames.map(
    (val: string, index: number) => {
      const firstNameIsRepresentative =
        isCleanProvider ||
        options.markStale ||
        cachedResult.provider.includes(BARCODE_CACHE_VERSION);
      const priority = firstNameIsRepresentative && index === 0 ? 2 : 0;
      return {
        value: val,
        priority,
      };
    },
  );

  const matches = clusterSuggestions(mappedNamesWithPriority);
  const enrichedMatches = await Promise.all(
    matches.map(async (m) => {
      let coverUrl = await getPrioritizedImageUrl(m.name);

      if (!coverUrl) {
        const matchingRaw = cachedResult.rawNames.find((rn: any) => {
          const valNorm = rn.value.toLowerCase().trim();
          return (
            valNorm === m.name.toLowerCase().trim() ||
            m.suggestions.some(
              (s: string) => s.toLowerCase().trim() === valNorm,
            )
          );
        });
        if (matchingRaw && matchingRaw.coverUrl) {
          coverUrl = matchingRaw.coverUrl;
        }
      }

      if (!coverUrl && type === "books") {
        coverUrl = `https://covers.openlibrary.org/b/isbn/${cleanedBarcode}-M.jpg`;
      }

      return {
        ...m,
        coverUrl,
      };
    }),
  );

  const mergedMatches = mergeDuplicateMatches(enrichedMatches);
  const preservePlatformSuffix = (type || cachedResult.shelfType) === "games";
  const cleanNameStr = cleanTitleForDisplay(
    decodeHTMLEntities(filteredNames[0] || rawNames[0] || ""),
    { preservePlatformSuffix },
  );
  const cleanSuggestions = Array.from(
    new Set(
      filteredNames.map((s: string) =>
        cleanTitleForDisplay(decodeHTMLEntities(s), {
          preservePlatformSuffix,
        }),
      ),
    ),
  );
  const cleanMatches = deduplicate(
    mergedMatches.map((m) => ({
      ...m,
      name: cleanTitleForDisplay(decodeHTMLEntities(m.name), {
        preservePlatformSuffix,
      }),
      suggestions: Array.from(
        new Set(
          m.suggestions.map((s) =>
            cleanTitleForDisplay(decodeHTMLEntities(s), {
              preservePlatformSuffix,
            }),
          ),
        ),
      ),
    })),
    (m) => m.name,
  );

  return {
    provider: options.markStale
      ? versionProvider(cachedResult.provider)
      : cachedResult.provider,
    rawNames: rawNames.map((rn: string) => decodeHTMLEntities(rn)),
    cleanName: cleanNameStr,
    suggestions: cleanSuggestions,
    matches: cleanMatches,
    shelfType: cachedResult.shelfType,
    platformKey: cachedResult.platformKey || null,
    staleCache: options.markStale || undefined,
  };
}

async function buildDatabaseEvidence(
  names: string[],
  type: string,
): Promise<ProductEvidence[]> {
  const uniqueNames = uniqueClean(names, {
    preservePlatformSuffix: type === "games",
  }).slice(0, 4);
  const resolved = await Promise.all(
    uniqueNames.map(async (name) => {
      const evidence: ProductEvidence[] = [];
      const confrontedName = await confrontWithDatabase(name, type);
      if (confrontedName) {
        const cleanConfronted = cleanTitleForDisplay(confrontedName);
        if (
          cleanConfronted &&
          !isListingDiscardable(cleanConfronted) &&
          isDatabaseResolvedNameAcceptable(name, cleanConfronted)
        ) {
          const item = buildProductEvidence(
            "DatabaseResolver",
            { name: cleanConfronted },
            true,
          );
          if (item) evidence.push(item);
        }
      }

      return evidence;
    }),
  );

  return resolved.flat();
}

const RESOLVER_GENERIC_TOKENS = new Set([
  ...GENERIC_TITLE_TOKENS,
  "video",
  "volant",
  "wheel",
  "notice",
  "nintendo",
  "sony",
  "microsoft",
  "sega",
]);

const RESOLVER_PLATFORM_TOKENS = new Set([
  "wii",
  "switch",
  "ds",
  "3ds",
  "ps1",
  "ps2",
  "ps3",
  "ps4",
  "ps5",
  "xbox",
  "pc",
]);

function resolverSignificantTokens(value: string): Set<string> {
  const tokens = normalizeForTokens(
    cleanTitleForDisplay(value, {
      preservePlatformSuffix: true,
    }),
  )
    .replace(/&/g, " and ")
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 2 && !RESOLVER_GENERIC_TOKENS.has(token));

  return new Set(tokens);
}

function isDatabaseResolvedNameAcceptable(
  input: string,
  resolved: string,
): boolean {
  if (!areLikelySameProduct(input, resolved)) return false;

  const inputTokens = resolverSignificantTokens(input);
  const resolvedTokens = resolverSignificantTokens(resolved);
  const extraResolvedTokens = [...resolvedTokens].filter(
    (token) => !inputTokens.has(token) && !RESOLVER_PLATFORM_TOKENS.has(token),
  );

  return extraResolvedTokens.length === 0;
}

function pickRepresentativeEvidence(
  evidence: ProductEvidence[],
): ProductEvidence {
  const canonicalEvidence = evidence.filter((item) => item.isCanonical);
  const canonicalRegionalEvidence = filterOverlyGenericCanonicalEvidence(
    evidence.filter((item) => item.isCanonical && item.region),
    canonicalEvidence,
  );
  const regionOrder = ["fr", "eu", "wor", "uk", "us", "jp"];
  const regionRank = (region?: string | null) => {
    const index = regionOrder.indexOf((region || "").toLowerCase());
    return index === -1 ? regionOrder.length : index;
  };

  if (canonicalRegionalEvidence.length > 0) {
    return canonicalRegionalEvidence.slice().sort((a, b) => {
      const regionDiff = regionRank(a.region) - regionRank(b.region);
      if (regionDiff !== 0) return regionDiff;
      const priorityDiff = b.priority - a.priority;
      if (priorityDiff !== 0) return priorityDiff;
      return a.title.length - b.title.length;
    })[0];
  }

  const specificCanonicalEvidence = filterOverlyGenericCanonicalEvidence(
    canonicalEvidence,
    canonicalEvidence,
  );
  if (specificCanonicalEvidence.length > 0) {
    return specificCanonicalEvidence.slice().sort((a, b) => {
      const scoreA =
        getRepresentativeScore(a.title, a.priority) + a.sourceWeight * 1000;
      const scoreB =
        getRepresentativeScore(b.title, b.priority) + b.sourceWeight * 1000;
      if (scoreA !== scoreB) return scoreB - scoreA;
      return a.title.length - b.title.length;
    })[0];
  }

  return evidence.slice().sort((a, b) => {
    const scoreA =
      getRepresentativeScore(a.title, a.priority) + a.sourceWeight * 1000;
    const scoreB =
      getRepresentativeScore(b.title, b.priority) + b.sourceWeight * 1000;
    if (scoreA !== scoreB) return scoreB - scoreA;
    return a.title.length - b.title.length;
  })[0];
}

function titleSpecificityTokens(value: string): Set<string> {
  const tokens = normalizeForTokens(value)
    .split(/[^a-z0-9]+/)
    .filter(
      (token) =>
        token.length > 1 &&
        !GENERIC_TITLE_TOKENS.has(token) &&
        token !== "video",
    );

  return new Set(tokens);
}

function isStrictTitleSubset(candidate: string, other: string): boolean {
  const candidateTokens = titleSpecificityTokens(candidate);
  const otherTokens = titleSpecificityTokens(other);
  if (candidateTokens.size < 2 || otherTokens.size <= candidateTokens.size) {
    return false;
  }

  for (const token of candidateTokens) {
    if (!otherTokens.has(token)) return false;
  }

  return true;
}

function filterOverlyGenericCanonicalEvidence(
  candidates: ProductEvidence[],
  allCanonicalEvidence: ProductEvidence[],
): ProductEvidence[] {
  const filtered = candidates.filter((candidate) => {
    return !allCanonicalEvidence.some((other) => {
      if (other === candidate) return false;
      const sameCover =
        candidate.coverUrl &&
        other.coverUrl &&
        candidate.coverUrl === other.coverUrl;
      if (!sameCover && !areLikelySameProduct(candidate.title, other.title)) {
        return false;
      }

      return isStrictTitleSubset(candidate.title, other.title);
    });
  });

  return filtered.length > 0 ? filtered : candidates;
}

const USER_VISIBLE_REGIONS = new Set(["fr", "eu", "wor", "uk", "us"]);

function filterDisplayEvidenceForSuggestions(
  evidence: ProductEvidence[],
): ProductEvidence[] {
  const canonicalEvidence = evidence.filter((item) => item.isCanonical);
  if (canonicalEvidence.length === 0) return evidence;

  const preferredRegionEvidence = canonicalEvidence.filter(
    (item) =>
      !item.region || USER_VISIBLE_REGIONS.has(item.region.toLowerCase()),
  );
  const displayEvidence =
    preferredRegionEvidence.length > 0
      ? preferredRegionEvidence
      : canonicalEvidence;

  return filterOverlyGenericCanonicalEvidence(
    displayEvidence,
    canonicalEvidence,
  );
}

// Plafond de confiance pour un résultat issu uniquement d'annonces (aucune
// source canonique) : au-dessus, l'UI le présenterait comme certain.
const LISTING_ONLY_CONFIDENCE_CAP = 0.45;

function scoreEvidenceCluster(
  evidence: ProductEvidence[],
): MatchEvidenceSummary {
  const providers = Array.from(new Set(evidence.map((e) => e.providerName)));
  const canonicalProviders = Array.from(
    new Set(evidence.filter((e) => e.isCanonical).map((e) => e.providerName)),
  );
  const canonicalCount = evidence.filter((e) => e.isCanonical).length;
  const marketplaceCount = evidence.length - canonicalCount;
  const hasCover = evidence.some((e) => e.coverUrl);
  const sourceScore = evidence.reduce((sum, e) => sum + e.sourceWeight, 0);
  const providerBonus = Math.min(
    0.16,
    Math.max(0, providers.length - 1) * 0.04,
  );
  const canonicalBonus = Math.min(0.18, canonicalProviders.length * 0.06);
  const coverBonus = hasCover ? 0.05 : 0;
  const rawSupportBonus = Math.min(
    0.12,
    Math.max(0, evidence.length - 1) * 0.025,
  );
  const confidence = Math.max(
    0.05,
    Math.min(
      0.98,
      sourceScore +
        providerBonus +
        canonicalBonus +
        coverBonus +
        rawSupportBonus,
    ),
  );

  // "Jamais affirmer faux" : sans source canonique (annonces marketplace
  // uniquement), on plafonne la confiance pour que le résultat reste un
  // "je ne sais pas / aide-moi" plutôt qu'un nom présenté comme certain.
  const finalConfidence =
    canonicalProviders.length === 0
      ? Math.min(confidence, LISTING_ONLY_CONFIDENCE_CAP)
      : confidence;

  const reasons: string[] = [];
  if (canonicalProviders.length > 0) reasons.push("canonical-source");
  if (providers.length > 1) reasons.push("multi-source-agreement");
  if (hasCover) reasons.push("cover-match");
  if (marketplaceCount > 0) reasons.push("marketplace-support");

  return {
    providers,
    canonicalProviders,
    rawCount: evidence.length,
    canonicalCount,
    marketplaceCount,
    hasCover,
    confidence: Number(finalConfidence.toFixed(2)),
    reasons,
  };
}

function resolveEvidenceToMatches(
  evidenceList: ProductEvidence[],
  type: string,
  cleanedBarcode: string,
): ResolvedMatch[] {
  const clusters: ProductEvidence[][] = [];

  for (const evidence of evidenceList) {
    let bestClusterIndex = -1;
    let bestScore = 0;
    for (let i = 0; i < clusters.length; i++) {
      const clusterScore = Math.max(
        ...clusters[i].map((other) => evidenceSimilarity(evidence, other)),
      );
      if (clusterScore > bestScore) {
        bestScore = clusterScore;
        bestClusterIndex = i;
      }
    }

    if (
      bestClusterIndex !== -1 &&
      clusters[bestClusterIndex].some((other) =>
        areEvidenceSameProduct(evidence, other),
      )
    ) {
      clusters[bestClusterIndex].push(evidence);
    } else {
      clusters.push([evidence]);
    }
  }

  const matches = clusters.map((cluster) => {
    const representative = pickRepresentativeEvidence(cluster);
    const evidence = scoreEvidenceCluster(cluster);
    const displayName = pickPreferredClusterDisplayName(
      representative.title,
      cluster,
    );
    const displayEvidence = filterDisplayEvidenceForSuggestions(cluster);
    const coverUrl =
      cluster.find(
        (e) => e.providerName === representative.providerName && e.coverUrl,
      )?.coverUrl ||
      cluster.find((e) => e.coverUrl)?.coverUrl ||
      (type === "books"
        ? `https://covers.openlibrary.org/b/isbn/${cleanedBarcode}-M.jpg`
        : null);
    const suggestions = filterPlatformRedundancies(
      uniqueClean(
        [
          displayName,
          representative.title,
          ...displayEvidence
            .sort((a, b) => b.sourceWeight - a.sourceWeight)
            .flatMap((e) => [e.title, e.cleanName]),
        ],
        { preservePlatformSuffix: type === "games" },
      ),
    );

    return {
      name: displayName,
      suggestions,
      coverUrl,
      confidence: evidence.confidence,
      evidence,
    };
  });

  const mergedByImage = mergeDuplicateMatches(matches);
  const sorted = mergedByImage.sort((a, b) => b.confidence - a.confidence);
  const top = sorted[0];
  if (!top) return [];

  return sorted.filter((match, index) => {
    if (index === 0) return true;
    const isRelatedToTop = areLikelySameProduct(top.name, match.name);
    const isStrongAmbiguity =
      isRelatedToTop &&
      match.confidence >= 0.72 &&
      match.evidence.canonicalCount > 0;
    const isCloseToTop =
      top.confidence < 0.82 && top.confidence - match.confidence <= 0.18;
    const hasNoDominantWinner =
      top.confidence < 0.62 && match.confidence >= 0.28;
    return isStrongAmbiguity || isCloseToTop || hasNoDominantWinner;
  });
}

async function compileResultForType(
  type: string,
  sources: {
    providerName: string;
    products: SourceProduct[];
  }[],
  cleanedBarcode: string,
): Promise<CompiledResult | null> {
  const activeSources = sources.filter(
    (s) => s.products && s.products.length > 0,
  );
  if (activeSources.length === 0) return null;

  const provider = activeSources.map((s) => s.providerName).join("+");
  const sourceEvidence: ProductEvidence[] = [];
  const canonicalEvidence: ProductEvidence[] = [];

  for (const source of activeSources) {
    for (const product of source.products) {
      const evidence = buildProductEvidence(source.providerName, product);
      if (!evidence) continue;
      sourceEvidence.push(evidence);
      if (evidence.isCanonical) {
        canonicalEvidence.push(evidence);
      }
    }
  }

  if (sourceEvidence.length === 0) return null;

  const hasCanonicalSignals = canonicalEvidence.length > 0;
  const trustedEvidence = hasCanonicalSignals
    ? sourceEvidence.filter((evidence) => {
        if (evidence.isCanonical) return true;
        const isRelatedToCanonical = canonicalEvidence.some((canonical) =>
          areEvidenceSameProduct(canonical, evidence),
        );
        if (!isRelatedToCanonical) {
          console.log(
            `[Barcode API] Ignoring marketplace noise "${evidence.cleanName}" because canonical signals exist for ${type}`,
          );
        }
        return isRelatedToCanonical;
      })
    : sourceEvidence;

  const databaseEvidence = hasCanonicalSignals
    ? []
    : await buildDatabaseEvidence(
        trustedEvidence
          .filter((evidence) => !evidence.isCanonical)
          .map((evidence) => evidence.cleanName),
        type,
      );

  if (!hasCanonicalSignals && databaseEvidence.length === 0) {
    console.warn(
      `[Barcode API] No canonical resolver confirmed barcode ${cleanedBarcode} for ${type}; raw marketplace names ignored.`,
    );
    return null;
  }

  const supportingEvidence = hasCanonicalSignals
    ? trustedEvidence
    : trustedEvidence.filter((evidence) =>
        databaseEvidence.some((canonical) =>
          areEvidenceSameProduct(canonical, evidence),
        ),
      );
  const allEvidence = [...databaseEvidence, ...supportingEvidence];
  const matches = resolveEvidenceToMatches(allEvidence, type, cleanedBarcode);
  const representative =
    matches[0]?.name || pickRepresentativeEvidence(allEvidence).title;
  const displayEvidence = filterDisplayEvidenceForSuggestions(allEvidence);
  const finalSuggestions = filterPlatformRedundancies(
    uniqueClean(
      matches.flatMap((match) => [match.name, ...match.suggestions]),
      { preservePlatformSuffix: type === "games" },
    ),
  ).slice(0, 15);
  const rawNames = uniqueClean(
    displayEvidence
      .sort((a, b) => b.sourceWeight - a.sourceWeight)
      .flatMap((evidence) => [evidence.title, evidence.cleanName]),
    { preservePlatformSuffix: type === "games" },
  ).slice(0, 15);
  const platformKey = pickPlatformKeyFromEvidence(allEvidence);

  return {
    provider,
    rawNames,
    cleanName: representative,
    suggestions: finalSuggestions,
    matches,
    platformKey,
  };
}

export type BarcodeResolveResult = {
  provider: string | null;
  rawNames: string[];
  cleanName: string;
  suggestions: string[];
  matches: any[];
  shelfType: string | null;
  platformKey?: string | null;
  refreshed?: boolean;
};


/**
 * Cœur de la primitive : code-barres (déjà nettoyé) → résultat structuré.
 * Découplé du HTTP pour être testable (golden-master via fixtures rejouées).
 * Renvoie toujours un payload — un résultat vide ⇒ "je ne sais pas".
 */
export async function resolveBarcode(
  cleanedBarcode: string,
  type: string | null,
  opts: { refresh?: boolean } = {},
): Promise<BarcodeResolveResult> {
  const shouldRefresh = opts.refresh ?? false;

  // Check cache first
  const cachedResult = await prisma.barcodeCache.findUnique({
    where: { barcode: cleanedBarcode },
    include: { rawNames: true },
  });

  const shouldBypassCache =
    !!cachedResult &&
    (shouldRefresh || !cachedResult.provider.includes(BARCODE_CACHE_VERSION));

  if (cachedResult && cachedResult.rawNames.length > 0 && !shouldBypassCache) {
    const rawNames = cachedResult.rawNames.map((rn) => rn.value);
    const filteredNames = filterPlatformRedundancies(rawNames);
    const isCleanProvider = [
      "screenscraper",
      "igdb",
      "rawg",
      "tmdb",
      "openlibrary",
      "deezer",
      "scandex",
      "boardgamegeek",
      "databaseresolver",
    ].some((p) => cachedResult.provider.toLowerCase().includes(p));
    const mappedNamesWithPriority = filteredNames.map((val, index) => {
      // The first name is prioritized if it's a clean provider, because it's the representative/clean name.
      const firstNameIsRepresentative =
        isCleanProvider ||
        cachedResult.provider.includes(BARCODE_CACHE_VERSION);
      const priority = firstNameIsRepresentative && index === 0 ? 2 : 0;
      return {
        value: val,
        priority,
      };
    });

    const matches = clusterSuggestions(mappedNamesWithPriority);

    const enrichedMatches = await Promise.all(
      matches.map(async (m) => {
        let coverUrl = await getPrioritizedImageUrl(m.name);

        if (!coverUrl) {
          const matchingRaw = cachedResult.rawNames.find((rn) => {
            const valNorm = rn.value.toLowerCase().trim();
            return (
              valNorm === m.name.toLowerCase().trim() ||
              m.suggestions.some((s) => s.toLowerCase().trim() === valNorm)
            );
          });
          if (matchingRaw && matchingRaw.coverUrl) {
            coverUrl = matchingRaw.coverUrl;
          }
        }

        if (!coverUrl && type === "books") {
          coverUrl = `https://covers.openlibrary.org/b/isbn/${cleanedBarcode}-M.jpg`;
        }

        return {
          ...m,
          coverUrl,
        };
      }),
    );

    // Merge matches that share the same coverUrl (same image = same media, different language titles)
    const mergedMatches = mergeDuplicateMatches(enrichedMatches);

    const preservePlatformSuffix = (type || cachedResult.shelfType) === "games";
    const cleanNameStr = cleanTitleForDisplay(
      decodeHTMLEntities(filteredNames[0] || rawNames[0] || ""),
      { preservePlatformSuffix },
    );
    const cleanSuggestions = Array.from(
      new Set(
        filteredNames.map((s) =>
          cleanTitleForDisplay(decodeHTMLEntities(s), {
            preservePlatformSuffix,
          }),
        ),
      ),
    );
    const cleanMatches = deduplicate(
      mergedMatches.map((m) => ({
        ...m,
        name: cleanTitleForDisplay(decodeHTMLEntities(m.name), {
          preservePlatformSuffix,
        }),
        suggestions: Array.from(
          new Set(
            m.suggestions.map((s) =>
              cleanTitleForDisplay(decodeHTMLEntities(s), {
                preservePlatformSuffix,
              }),
            ),
          ),
        ),
      })),
      (m) => m.name,
    );

    return {
      provider: cachedResult.provider,
      rawNames: rawNames.map((rn) => decodeHTMLEntities(rn)),
      cleanName: cleanNameStr,
      suggestions: cleanSuggestions,
      matches: cleanMatches,
      shelfType: cachedResult.shelfType,
      platformKey: cachedResult.platformKey || null,
    };
  }

  const unresolvedSourceBuckets: Record<string, UnresolvedBarcodeSource[]> = {};

  // Helper to save cache
  const cacheResult = async (res: any, shelfType: string) => {
    try {
      // Delete existing cached item if it exists (e.g. from the price lookup route)
      await prisma.barcodeCache.deleteMany({
        where: { barcode: cleanedBarcode },
      });

      await prisma.barcodeCache.create({
        data: {
          barcode: cleanedBarcode,
          provider: versionProvider(res.provider),
          shelfType: shelfType,
          platformKey: res.platformKey || null,
          rawNames: {
            create: uniqueClean([res.cleanName, ...(res.suggestions || [])], {
              preservePlatformSuffix: shelfType === "games",
            }).map((s: string) => {
              const matchingMatch = res.matches?.find(
                (m: any) =>
                  m.suggestions?.some(
                    (sig: string) =>
                      sig.toLowerCase().trim() === s.toLowerCase().trim(),
                  ) || m.name.toLowerCase().trim() === s.toLowerCase().trim(),
              );
              return {
                value: s,
                coverUrl: matchingMatch?.coverUrl || null,
              };
            }),
          },
        },
      });
    } catch (e) {
      console.error("[BarcodeCache] Error caching result:", e);
    }
  };

  let ol: any = null;
  let deezer: any = null;
  let ss: any = null;
  let tmdb: any = null;
  let pc: any = null;
  let sd: any = null;
  let amc: any[] = [];
  let calFr: any[] = [];
  let calDvd: any[] = [];
  let calMusic: any[] = [];
  let calToys: any[] = [];
  let calJeuxVideo: any[] = [];
  let calGeneric: any[] = [];
  let freakxy: any[] = [];
  let aprilo: any[] = [];
  let picclick: any[] = [];

  if (type === "games") {
    const [pcRes, calRes, sdRes, amcRes, freakxyRes, apriloRes, picclickRes] =
      await Promise.allSettled([
        fetchMetadataFromPriceCharting(
          cleanedBarcode,
          undefined,
          undefined,
          cleanedBarcode.length === 13 && !cleanedBarcode.startsWith("0"),
        ),
        fetchFromChasseAuxLivres(cleanedBarcode, "jeuxvideo"),
        fetchFromScanDex(cleanedBarcode),
        fetchFromAchatMoinsCher(cleanedBarcode),
        fetchFromFreakxy(cleanedBarcode),
        fetchFromApriloshop(cleanedBarcode),
        fetchFromPicClick(cleanedBarcode),
      ]);
    pc = pcRes.status === "fulfilled" ? pcRes.value : null;
    calJeuxVideo = calRes.status === "fulfilled" ? calRes.value : [];
    sd = sdRes.status === "fulfilled" ? sdRes.value : null;
    amc = amcRes.status === "fulfilled" ? amcRes.value : [];
    freakxy = freakxyRes.status === "fulfilled" ? freakxyRes.value : [];
    aprilo = apriloRes.status === "fulfilled" ? apriloRes.value : [];
    picclick = picclickRes.status === "fulfilled" ? picclickRes.value : [];

    const candidates: string[] = [];
    const platformSignals: PlatformSignal[] = [];
    if (pc?.title) {
      const value = pc.platform ? `${pc.title} (${pc.platform})` : pc.title;
      candidates.push(value);
      platformSignals.push({ value, weight: pc.platform ? 3.5 : 1.2 });
    }
    if (sd?.igdb_metadata?.name) {
      const sdPlat = sd.igdb_metadata.platform?.name;
      const value = sdPlat
        ? `${sd.igdb_metadata.name} (${sdPlat})`
        : sd.igdb_metadata.name;
      candidates.push(value);
      platformSignals.push({ value, weight: sdPlat ? 1.4 : 0.8 });
    }
    calJeuxVideo.forEach((p) => {
      candidates.push(p.name);
      platformSignals.push({ value: p.name, weight: 0.9 });
    });
    amc.forEach((p) => {
      candidates.push(p.name);
      platformSignals.push({ value: p.name, weight: 1.1 });
    });
    freakxy.forEach((p) => {
      candidates.push(p.name);
      platformSignals.push({ value: p.name, weight: 0.8 });
    });
    aprilo.forEach((p) => {
      candidates.push(p.name);
      platformSignals.push({ value: p.name, weight: 0.8 });
    });
    picclick.forEach((p) => {
      candidates.push(p.name);
      platformSignals.push({ value: p.name, weight: 0.9 });
    });

    const detectedPlatform = pickPlatformKeyFromSignals(platformSignals);

    let gameTitle = "";
    if (pc?.title) gameTitle = pc.title;
    else if (sd?.igdb_metadata?.name) gameTitle = sd.igdb_metadata.name;
    else if (picclick[0]?.name) gameTitle = picclick[0].name;
    else if (amc[0]?.name) gameTitle = amc[0].name;
    else if (calJeuxVideo[0]?.name) gameTitle = calJeuxVideo[0].name;
    else if (freakxy[0]?.name) gameTitle = freakxy[0].name;
    else if (aprilo[0]?.name) gameTitle = aprilo[0].name;

    const hasNtscIndicator = candidates.some((c) =>
      /\b(ntsc|us|usa|jp|jpn|japan)\b/i.test(c),
    );
    const isPal = !hasNtscIndicator;

    const CLASSICS_KEYWORDS = [
      "classics",
      "platinum",
      "essential",
      "players choice",
      "player's choice",
      "greatest hits",
      "nintendo selects",
      "best of",
    ];
    const isClassics = candidates.some((c) =>
      CLASSICS_KEYWORDS.some((kw) => c.toLowerCase().includes(kw)),
    );

    if (!pc && gameTitle) {
      try {
        console.log(
          `[PriceCharting Fallback] Barcode not found, trying name fallback: ${gameTitle} (isPal: ${isPal}, isClassics: ${isClassics})`,
        );
        pc = await fetchMetadataFromPriceCharting(
          cleanedBarcode,
          gameTitle,
          detectedPlatform || undefined,
          isPal,
          isClassics,
        );
      } catch (err) {
        console.error("[PriceCharting Fallback] Error in games search:", err);
      }
    }

    try {
      ss = await fetchFromScreenScraper(
        gameTitle,
        cleanedBarcode,
        detectedPlatform,
      );
    } catch (err) {
      console.error("[ScreenScraper] Error fetching in games search:", err);
    }
  } else if (type === "books") {
    const [olRes, calRes, amcRes] = await Promise.allSettled([
      fetchFromOpenLibrary("", cleanedBarcode),
      fetchFromChasseAuxLivres(cleanedBarcode, "fr"),
      fetchFromAchatMoinsCher(cleanedBarcode),
    ]);
    ol = olRes.status === "fulfilled" ? olRes.value : null;
    calFr = calRes.status === "fulfilled" ? calRes.value : [];
    amc = amcRes.status === "fulfilled" ? amcRes.value : [];
  } else if (type === "musics") {
    const [deezerRes, calRes, amcRes] = await Promise.allSettled([
      fetchFromDeezer("", cleanedBarcode),
      fetchFromChasseAuxLivres(cleanedBarcode, "music"),
      fetchFromAchatMoinsCher(cleanedBarcode),
    ]);
    deezer = deezerRes.status === "fulfilled" ? deezerRes.value : null;
    calMusic = calRes.status === "fulfilled" ? calRes.value : [];
    amc = amcRes.status === "fulfilled" ? amcRes.value : [];
  } else if (type === "movies") {
    const [calRes, amcRes, picclickRes] = await Promise.allSettled([
      fetchFromChasseAuxLivres(cleanedBarcode, "dvd"),
      fetchFromAchatMoinsCher(cleanedBarcode),
      fetchFromPicClick(cleanedBarcode),
    ]);
    calDvd = calRes.status === "fulfilled" ? calRes.value : [];
    amc = amcRes.status === "fulfilled" ? amcRes.value : [];
    picclick = picclickRes.status === "fulfilled" ? picclickRes.value : [];

    let movieTitle = "";
    if (picclick[0]?.name) movieTitle = picclick[0].name;
    else if (amc[0]?.name) movieTitle = amc[0].name;
    else if (calDvd[0]?.name) movieTitle = calDvd[0].name;

    if (movieTitle) {
      try {
        const cleanedMovieTitle = cleanSearchQuery(movieTitle);
        if (cleanedMovieTitle) {
          console.log(
            `[TMDB Movie Lookup] Querying TMDB for: "${cleanedMovieTitle}" (from: "${movieTitle}")`,
          );
          tmdb = await fetchFromTMDB(cleanedMovieTitle);
        }
      } catch (err: any) {
        console.error("[TMDB] Error fetching in movies search:", err.message);
      }
    }
  } else if (type === "boardgames") {
    const [calRes, amcRes, picclickRes] = await Promise.allSettled([
      fetchFromChasseAuxLivres(cleanedBarcode, "toys"),
      fetchFromAchatMoinsCher(cleanedBarcode),
      fetchFromPicClick(cleanedBarcode),
    ]);
    calToys = calRes.status === "fulfilled" ? calRes.value : [];
    amc = amcRes.status === "fulfilled" ? amcRes.value : [];
    picclick = picclickRes.status === "fulfilled" ? picclickRes.value : [];
  } else {
    // Generic search (type is not specified) - query each free API once
    const [
      olRes,
      deezerRes,
      pcRes,
      calRes,
      sdRes,
      amcRes,
      freakxyRes,
      apriloRes,
      picclickRes,
    ] = await Promise.allSettled([
      fetchFromOpenLibrary("", cleanedBarcode),
      fetchFromDeezer("", cleanedBarcode),
      fetchMetadataFromPriceCharting(
        cleanedBarcode,
        undefined,
        undefined,
        cleanedBarcode.length === 13 && !cleanedBarcode.startsWith("0"),
      ),
      fetchFromChasseAuxLivres(cleanedBarcode, ""),
      fetchFromScanDex(cleanedBarcode),
      fetchFromAchatMoinsCher(cleanedBarcode),
      fetchFromFreakxy(cleanedBarcode),
      fetchFromApriloshop(cleanedBarcode),
      fetchFromPicClick(cleanedBarcode),
    ]);
    ol = olRes.status === "fulfilled" ? olRes.value : null;
    deezer = deezerRes.status === "fulfilled" ? deezerRes.value : null;
    pc = pcRes.status === "fulfilled" ? pcRes.value : null;
    calGeneric = calRes.status === "fulfilled" ? calRes.value : [];
    sd = sdRes.status === "fulfilled" ? sdRes.value : null;
    amc = amcRes.status === "fulfilled" ? amcRes.value : [];
    freakxy = freakxyRes.status === "fulfilled" ? freakxyRes.value : [];
    aprilo = apriloRes.status === "fulfilled" ? apriloRes.value : [];
    picclick = picclickRes.status === "fulfilled" ? picclickRes.value : [];

    const candidates: string[] = [];
    const platformSignals: PlatformSignal[] = [];
    if (pc?.title) {
      const value = pc.platform ? `${pc.title} (${pc.platform})` : pc.title;
      candidates.push(value);
      platformSignals.push({ value, weight: pc.platform ? 3.5 : 1.2 });
    }
    if (sd?.igdb_metadata?.name) {
      const sdPlat = sd.igdb_metadata.platform?.name;
      const value = sdPlat
        ? `${sd.igdb_metadata.name} (${sdPlat})`
        : sd.igdb_metadata.name;
      candidates.push(value);
      platformSignals.push({ value, weight: sdPlat ? 1.4 : 0.8 });
    }
    calGeneric.forEach((p) => {
      candidates.push(p.name);
      platformSignals.push({ value: p.name, weight: 0.9 });
    });
    amc.forEach((p) => {
      candidates.push(p.name);
      platformSignals.push({ value: p.name, weight: 1.1 });
    });
    freakxy.forEach((p) => {
      candidates.push(p.name);
      platformSignals.push({ value: p.name, weight: 0.8 });
    });
    aprilo.forEach((p) => {
      candidates.push(p.name);
      platformSignals.push({ value: p.name, weight: 0.8 });
    });
    picclick.forEach((p) => {
      candidates.push(p.name);
      platformSignals.push({ value: p.name, weight: 0.9 });
    });

    const detectedPlatform = pickPlatformKeyFromSignals(platformSignals);

    let gameTitle = "";
    if (pc?.title) gameTitle = pc.title;
    else if (sd?.igdb_metadata?.name) gameTitle = sd.igdb_metadata.name;
    else if (picclick[0]?.name) gameTitle = picclick[0].name;
    else if (amc[0]?.name) gameTitle = amc[0].name;
    else if (calGeneric[0]?.name) gameTitle = calGeneric[0].name;
    else if (freakxy[0]?.name) gameTitle = freakxy[0].name;
    else if (aprilo[0]?.name) gameTitle = aprilo[0].name;

    const hasNtscIndicator = candidates.some((c) =>
      /\b(ntsc|us|usa|jp|jpn|japan)\b/i.test(c),
    );
    const isPal = !hasNtscIndicator;

    const CLASSICS_KEYWORDS = [
      "classics",
      "platinum",
      "essential",
      "players choice",
      "player's choice",
      "greatest hits",
      "nintendo selects",
      "best of",
    ];
    const isClassics = candidates.some((c) =>
      CLASSICS_KEYWORDS.some((kw) => c.toLowerCase().includes(kw)),
    );

    if (!pc && gameTitle) {
      try {
        console.log(
          `[PriceCharting Fallback] Barcode not found, trying name fallback: ${gameTitle} (isPal: ${isPal}, isClassics: ${isClassics})`,
        );
        pc = await fetchMetadataFromPriceCharting(
          cleanedBarcode,
          gameTitle,
          detectedPlatform || undefined,
          isPal,
          isClassics,
        );
      } catch (err) {
        console.error("[PriceCharting Fallback] Error in generic search:", err);
      }
    }

    try {
      ss = await fetchFromScreenScraper(
        gameTitle,
        cleanedBarcode,
        detectedPlatform,
      );
    } catch (err) {
      console.error("[ScreenScraper] Error fetching in generic search:", err);
    }

    let movieTitle = "";
    if (picclick[0]?.name) movieTitle = picclick[0].name;
    else if (amc[0]?.name) movieTitle = amc[0].name;
    else if (calGeneric[0]?.name) movieTitle = calGeneric[0].name;

    if (movieTitle) {
      try {
        const cleanedMovieTitle = cleanSearchQuery(movieTitle);
        if (cleanedMovieTitle) {
          console.log(
            `[TMDB Generic Lookup] Querying TMDB for: "${cleanedMovieTitle}" (from: "${movieTitle}")`,
          );
          tmdb = await fetchFromTMDB(cleanedMovieTitle);
        }
      } catch (err: any) {
        console.error("[TMDB] Error fetching in generic search:", err.message);
      }
    }
  }

  const typeResults: Record<string, CompiledResult | null> = {};

  // 1. Books
  const bookSources = [];
  if (ol?.title) {
    bookSources.push({
      providerName: "OpenLibrary",
      products: [{ name: ol.title, coverUrl: ol.imageUrl }],
    });
  }
  const isBook =
    cleanedBarcode.startsWith("978") || cleanedBarcode.startsWith("979");
  const booksCalProducts = type === "books" ? calFr : isBook ? calGeneric : [];
  if (booksCalProducts && booksCalProducts.length > 0) {
    bookSources.push({
      providerName: "ChasseAuxLivres",
      products: booksCalProducts,
    });
  }
  const booksAmcProducts = type === "books" ? amc : isBook ? amc : [];
  if (booksAmcProducts && booksAmcProducts.length > 0) {
    bookSources.push({
      providerName: "AchatMoinsCher",
      products: booksAmcProducts,
    });
  }
  typeResults.books = await compileResultForType(
    "books",
    bookSources,
    cleanedBarcode,
  );
  unresolvedSourceBuckets.books = bookSources;

  // 2. Games
  const gameSources = [];
  if (ss?.title) {
    const ssProducts: SourceProduct[] = [
      { name: ss.title, coverUrl: ss.imageUrl, platformKey: ss.platformKey },
    ];
    if (ss.regionalTitles) {
      ss.regionalTitles.forEach(
        (regionalTitle: { region?: string; text: string }) => {
          ssProducts.push({
            name: regionalTitle.text,
            coverUrl: ss.imageUrl,
            region: regionalTitle.region,
            platformKey: ss.platformKey,
            isAlias:
              regionalTitle.text.toLowerCase().trim() !==
              ss.title?.toLowerCase().trim(),
          });
        },
      );
    }
    if (ss.aliases) {
      ss.aliases.forEach((alias: string) => {
        const regional = ss.regionalTitles?.find(
          (title: { region?: string; text: string }) =>
            title.text.toLowerCase().trim() === alias.toLowerCase().trim(),
        );
        ssProducts.push({
          name: alias,
          coverUrl: ss.imageUrl,
          region: regional?.region,
          platformKey: ss.platformKey,
          isAlias: true,
        });
      });
    }
    gameSources.push({
      providerName: "ScreenScraper",
      products: ssProducts,
    });
  }
  if (pc?.title) {
    const pcTitle = pc.platform ? `${pc.title} (${pc.platform})` : pc.title;
    gameSources.push({
      providerName: "PriceCharting",
      products: [
        {
          name: pcTitle,
          coverUrl: pc.coverUrl,
          platformKey: pc.platform ? detectPlatformKey(pc.platform) : null,
        },
      ],
    });
  }
  if (sd?.igdb_metadata?.name) {
    const sdName = sd.igdb_metadata.name;
    const sdPlatform = sd.igdb_metadata.platform?.name;
    const sdTitle = sdPlatform ? `${sdName} (${sdPlatform})` : sdName;
    gameSources.push({
      providerName: "ScanDex",
      products: [
        {
          name: sdTitle,
          platformKey: sdPlatform ? detectPlatformKey(sdPlatform) : null,
        },
      ],
    });
  }
  const gamesCalProducts =
    type === "games" ? calJeuxVideo : !isBook ? calGeneric : [];
  if (gamesCalProducts && gamesCalProducts.length > 0) {
    gameSources.push({
      providerName: "ChasseAuxLivres",
      products: gamesCalProducts,
    });
  }
  const gamesAmcProducts = type === "games" ? amc : !isBook ? amc : [];
  if (gamesAmcProducts && gamesAmcProducts.length > 0) {
    gameSources.push({
      providerName: "AchatMoinsCher",
      products: gamesAmcProducts,
    });
  }
  const gamesFreakxyProducts =
    type === "games" ? freakxy : !isBook ? freakxy : [];
  if (gamesFreakxyProducts && gamesFreakxyProducts.length > 0) {
    gameSources.push({
      providerName: "Freakxy",
      products: gamesFreakxyProducts,
    });
  }
  const gamesApriloProducts = type === "games" ? aprilo : !isBook ? aprilo : [];
  if (gamesApriloProducts && gamesApriloProducts.length > 0) {
    gameSources.push({
      providerName: "Apriloshop",
      products: gamesApriloProducts,
    });
  }
  const gamesPicClickProducts =
    type === "games" ? picclick : !isBook ? picclick : [];
  if (gamesPicClickProducts && gamesPicClickProducts.length > 0) {
    gameSources.push({
      providerName: "PicClick",
      products: gamesPicClickProducts,
    });
  }
  typeResults.games = await compileResultForType(
    "games",
    gameSources,
    cleanedBarcode,
  );
  unresolvedSourceBuckets.games = gameSources;

  // 3. Musics
  const musicSources = [];
  if (deezer?.title) {
    musicSources.push({
      providerName: "Deezer",
      products: [{ name: deezer.title, coverUrl: deezer.imageUrl }],
    });
  }
  const musicsCalProducts =
    type === "musics" ? calMusic : !isBook ? calGeneric : [];
  if (musicsCalProducts && musicsCalProducts.length > 0) {
    musicSources.push({
      providerName: "ChasseAuxLivres",
      products: musicsCalProducts,
    });
  }
  const musicsAmcProducts = type === "musics" ? amc : !isBook ? amc : [];
  if (musicsAmcProducts && musicsAmcProducts.length > 0) {
    musicSources.push({
      providerName: "AchatMoinsCher",
      products: musicsAmcProducts,
    });
  }
  typeResults.musics = await compileResultForType(
    "musics",
    musicSources,
    cleanedBarcode,
  );
  unresolvedSourceBuckets.musics = musicSources;

  // 4. Movies
  const movieSources = [];
  if (tmdb?.title) {
    movieSources.push({
      providerName: "TMDB",
      products: [
        { name: tmdb.title, coverUrl: tmdb.imageUrl },
        ...(tmdb.aliases || []).map((alias: string) => ({
          name: alias,
          coverUrl: tmdb.imageUrl,
          isAlias: true,
        })),
      ],
    });
  }
  const moviesCalProducts =
    type === "movies" ? calDvd : !isBook ? calGeneric : [];
  if (moviesCalProducts && moviesCalProducts.length > 0) {
    movieSources.push({
      providerName: "ChasseAuxLivres",
      products: moviesCalProducts,
    });
  }
  const moviesAmcProducts = type === "movies" ? amc : !isBook ? amc : [];
  if (moviesAmcProducts && moviesAmcProducts.length > 0) {
    movieSources.push({
      providerName: "AchatMoinsCher",
      products: moviesAmcProducts,
    });
  }
  const moviesPicClickProducts =
    type === "movies" ? picclick : !isBook ? picclick : [];
  if (moviesPicClickProducts && moviesPicClickProducts.length > 0) {
    movieSources.push({
      providerName: "PicClick",
      products: moviesPicClickProducts,
    });
  }
  typeResults.movies = await compileResultForType(
    "movies",
    movieSources,
    cleanedBarcode,
  );
  unresolvedSourceBuckets.movies = movieSources;

  // 5. Boardgames
  const boardgameSources = [];
  const boardgamesCalProducts =
    type === "boardgames" ? calToys : !isBook ? calGeneric : [];
  if (boardgamesCalProducts && boardgamesCalProducts.length > 0) {
    boardgameSources.push({
      providerName: "ChasseAuxLivres",
      products: boardgamesCalProducts,
    });
  }
  const boardgamesAmcProducts =
    type === "boardgames" ? amc : !isBook ? amc : [];
  if (boardgamesAmcProducts && boardgamesAmcProducts.length > 0) {
    boardgameSources.push({
      providerName: "AchatMoinsCher",
      products: boardgamesAmcProducts,
    });
  }
  const boardgamesPicClickProducts =
    type === "boardgames" ? picclick : !isBook ? picclick : [];
  if (boardgamesPicClickProducts && boardgamesPicClickProducts.length > 0) {
    boardgameSources.push({
      providerName: "PicClick",
      products: boardgamesPicClickProducts,
    });
  }
  typeResults.boardgames = await compileResultForType(
    "boardgames",
    boardgameSources,
    cleanedBarcode,
  );
  unresolvedSourceBuckets.boardgames = boardgameSources;

  // Pick selected type or fallback
  let selectedType: string | null = null;
  let selectedResult: CompiledResult | null = null;

  if (type && typeResults[type]) {
    selectedType = type;
    selectedResult = typeResults[type];
  } else {
    const priorityTypes = ["games", "books", "movies", "musics", "boardgames"];
    for (const pType of priorityTypes) {
      if (typeResults[pType]) {
        selectedType = pType;
        selectedResult = typeResults[pType];
        break;
      }
    }
  }

  if (selectedResult && selectedType) {
    await cacheResult(selectedResult, selectedType);
    await markUnresolvedBarcodeScanResolved({
      barcode: cleanedBarcode,
      shelfType: selectedType,
    });
    const preservePlatformSuffix = selectedType === "games";
    const cleanNameStr = cleanTitleForDisplay(
      decodeHTMLEntities(selectedResult.cleanName),
      { preservePlatformSuffix },
    );
    const cleanSuggestions = Array.from(
      new Set(
        selectedResult.suggestions.map((s) =>
          cleanTitleForDisplay(decodeHTMLEntities(s), {
            preservePlatformSuffix,
          }),
        ),
      ),
    );
    const cleanMatches = deduplicate(
      selectedResult.matches.map((m) => ({
        ...m,
        name: cleanTitleForDisplay(decodeHTMLEntities(m.name), {
          preservePlatformSuffix,
        }),
        suggestions: Array.from(
          new Set(
            m.suggestions.map((s) =>
              cleanTitleForDisplay(decodeHTMLEntities(s), {
                preservePlatformSuffix,
              }),
            ),
          ),
        ),
      })),
      (m) => m.name,
    );

    return {
      ...selectedResult,
      rawNames: selectedResult.rawNames.map((rn) => decodeHTMLEntities(rn)),
      cleanName: cleanNameStr,
      suggestions: cleanSuggestions,
      matches: cleanMatches,
      shelfType: selectedType,
    };
  }

  const unresolvedSources = type
    ? unresolvedSourceBuckets[type] || []
    : Object.values(unresolvedSourceBuckets).flat();
  const unresolvedProductCount = unresolvedSources.reduce(
    (sum, source) => sum + (source.products?.length || 0),
    0,
  );
  await recordUnresolvedBarcodeScan({
    barcode: cleanedBarcode,
    shelfType: type || "unknown",
    reason:
      unresolvedProductCount > 0
        ? "raw_names_unconfirmed"
        : "no_provider_result",
    sources: unresolvedSources,
  });

  // Fallback to paid search engines (if onlyFreeProviders is set to false)
  const onlyFreeProviders =
    (await getSetting("only_free_providers", "true")) === "true";
  if (!onlyFreeProviders) {
    for (const provider of providers) {
      try {
        const query = createBarcodeQuery(cleanedBarcode, type);
        const rawNames = await provider.search(query);

        if (rawNames) {
          const name = extractProductName(rawNames);
          const confrontedName = await confrontWithDatabase(name, type);
          const dbSuggestions = await getDatabaseSuggestions(name, type);

          if (!confrontedName && dbSuggestions.length === 0) {
            await recordUnresolvedBarcodeScan({
              barcode: cleanedBarcode,
              shelfType: type || "unknown",
              reason: "paid_raw_names_unconfirmed",
              sources: [
                {
                  providerName: provider.name,
                  products: rawNames.map((rawName) => ({ name: rawName })),
                },
              ],
            });
            continue;
          }

          const suggestions = [
            confrontedName,
            ...dbSuggestions,
            name,
            ...rawNames,
          ].filter((s): s is string => !!s);
          const seen = new Set<string>();
          const uniqueSuggestions: string[] = [];
          for (const s of suggestions) {
            const norm = s.toLowerCase().trim();
            if (norm && !seen.has(norm)) {
              seen.add(norm);
              uniqueSuggestions.push(s.trim());
            }
          }
          const filteredSuggestions =
            filterPlatformRedundancies(uniqueSuggestions);
          const finalSuggestions = filteredSuggestions.slice(0, 15);

          const suggestionPriorities = new Map<string, number>();
          if (confrontedName) {
            suggestionPriorities.set(confrontedName.toLowerCase().trim(), 2);
          }
          for (const s of dbSuggestions) {
            suggestionPriorities.set(s.toLowerCase().trim(), 2);
          }

          const mappedSuggestionsWithPriority = finalSuggestions.map((s) => {
            const key = s.toLowerCase().trim();
            const priority = suggestionPriorities.get(key) || 0;
            return {
              value: s,
              priority,
            };
          });

          const matches = await Promise.all(
            clusterSuggestions(mappedSuggestionsWithPriority).map(async (m) => {
              const coverUrl = await getPrioritizedImageUrl(m.name);
              return {
                ...m,
                coverUrl,
              };
            }),
          );

          const resolvedType = type || "movies"; // Default to movies if type is not specified
          await prisma.barcodeCache.create({
            data: {
              barcode: cleanedBarcode,
              provider: versionProvider(provider.name),
              shelfType: resolvedType,
              rawNames: {
                create: finalSuggestions.map((s) => {
                  const matchingMatch = matches.find(
                    (m) =>
                      m.suggestions?.some(
                        (sig: string) =>
                          sig.toLowerCase().trim() === s.toLowerCase().trim(),
                      ) ||
                      m.name.toLowerCase().trim() === s.toLowerCase().trim(),
                  );
                  return {
                    value: s,
                    coverUrl: matchingMatch?.coverUrl || null,
                  };
                }),
              },
            },
          });

          const cleanNameStr = cleanTitleForDisplay(
            decodeHTMLEntities(confrontedName || name),
          );
          const cleanSuggestions = Array.from(
            new Set(
              finalSuggestions.map((s) =>
                cleanTitleForDisplay(decodeHTMLEntities(s)),
              ),
            ),
          );
          const cleanMatches = deduplicate(
            matches.map((m) => ({
              ...m,
              name: cleanTitleForDisplay(decodeHTMLEntities(m.name)),
              suggestions: Array.from(
                new Set(
                  m.suggestions.map((s) =>
                    cleanTitleForDisplay(decodeHTMLEntities(s)),
                  ),
                ),
              ),
            })),
            (m) => m.name,
          );

          await markUnresolvedBarcodeScanResolved({
            barcode: cleanedBarcode,
            shelfType: resolvedType,
          });

          return {
            provider: provider.name,
            rawNames: rawNames,
            cleanName: cleanNameStr,
            suggestions: cleanSuggestions,
            matches: cleanMatches,
            shelfType: resolvedType,
          };
        }
      } catch (error) {
        console.error(
          `[${provider.name}] Error searching with barcode "${cleanedBarcode}":`,
          error,
        );
      }
    }
  }

  if (cachedResult && cachedResult.rawNames.length > 0 && shouldBypassCache) {
    if (shouldRefresh) {
      return {
        provider: null,
        rawNames: [],
        cleanName: "",
        suggestions: [],
        matches: [],
        shelfType: type || null,
        platformKey: null,
        refreshed: true,
      };
    }

    const payload = await buildCachedBarcodePayload(
      cachedResult,
      type,
      cleanedBarcode,
      { markStale: true },
    );
    return payload;
  }

  return {
    provider: null,
    rawNames: [],
    cleanName: "",
    suggestions: [],
    matches: [],
    shelfType: type || null,
    platformKey: null,
  };
}

/**
 * Merge matches that refer to the same media but with different language titles.
 * Detection: same coverUrl (exact match from TMDB/IGDB etc.) → same media.
 * The shortest title is kept as the representative (usually the original language or English).
 */
type MatchLike = {
  name: string;
  suggestions: string[];
  coverUrl: string | null;
  confidence?: number;
  evidence?: MatchEvidenceSummary;
};

function fallbackEvidenceForMatch(
  match: MatchLike,
  providerName = "Cache",
): MatchEvidenceSummary {
  const confidence = match.confidence ?? (match.coverUrl ? 0.72 : 0.58);
  return {
    providers: [providerName],
    canonicalProviders: [],
    rawCount: Math.max(1, match.suggestions.length),
    canonicalCount: 0,
    marketplaceCount: Math.max(1, match.suggestions.length),
    hasCover: !!match.coverUrl,
    confidence: Number(confidence.toFixed(2)),
    reasons: match.coverUrl ? ["cover-match"] : [],
  };
}

function mergeEvidenceSummaries(
  a: MatchEvidenceSummary,
  b: MatchEvidenceSummary,
): MatchEvidenceSummary {
  const providers = Array.from(new Set([...a.providers, ...b.providers]));
  const canonicalProviders = Array.from(
    new Set([...a.canonicalProviders, ...b.canonicalProviders]),
  );
  const confidence = Math.min(
    0.98,
    Math.max(a.confidence, b.confidence) + Math.min(0.08, b.rawCount * 0.015),
  );

  return {
    providers,
    canonicalProviders,
    rawCount: a.rawCount + b.rawCount,
    canonicalCount: a.canonicalCount + b.canonicalCount,
    marketplaceCount: a.marketplaceCount + b.marketplaceCount,
    hasCover: a.hasCover || b.hasCover,
    confidence: Number(confidence.toFixed(2)),
    reasons: Array.from(new Set([...a.reasons, ...b.reasons, "deduped-cover"])),
  };
}

function mergeDuplicateMatches(matches: MatchLike[]): ResolvedMatch[] {
  const merged: ResolvedMatch[] = [];

  for (const match of matches) {
    const fallbackEvidence = fallbackEvidenceForMatch(match);
    const normalizedMatch: ResolvedMatch = {
      ...match,
      confidence: match.confidence ?? fallbackEvidence.confidence,
      evidence: match.evidence ?? fallbackEvidence,
    };
    const existingIndex = match.coverUrl
      ? merged.findIndex((m) => m.coverUrl && m.coverUrl === match.coverUrl)
      : -1;

    if (existingIndex !== -1) {
      // Same coverUrl → same media → merge
      const existing = merged[existingIndex];
      const allSuggestions = Array.from(
        new Set([
          ...existing.suggestions,
          ...normalizedMatch.suggestions,
          normalizedMatch.name,
          existing.name,
        ]),
      );
      const bestName =
        existing.confidence > normalizedMatch.confidence
          ? existing.name
          : normalizedMatch.confidence > existing.confidence
            ? normalizedMatch.name
            : isStrictTitleSubset(existing.name, normalizedMatch.name)
              ? normalizedMatch.name
              : isStrictTitleSubset(normalizedMatch.name, existing.name)
                ? existing.name
                : existing.name;
      const mergedEvidence = mergeEvidenceSummaries(
        existing.evidence,
        normalizedMatch.evidence,
      );
      merged[existingIndex] = {
        name: bestName,
        suggestions: allSuggestions,
        coverUrl: existing.coverUrl,
        confidence: mergedEvidence.confidence,
        evidence: mergedEvidence,
      };
    } else {
      merged.push(normalizedMatch);
    }
  }

  return merged;
}

function normalizeForTokens(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip accent marks
    .toLowerCase();
}

const ROMAN_MAP: Record<string, string> = {
  i: "1",
  ii: "2",
  iii: "3",
  iv: "4",
  v: "5",
  vi: "6",
  vii: "7",
  viii: "8",
  ix: "9",
  x: "10",
  xi: "11",
  xii: "12",
  xiii: "13",
  xiv: "14",
  xv: "15",
  xx: "20",
};

const NUMBER_WORD_MAP: Record<string, string> = {
  one: "1",
  two: "2",
  three: "3",
  four: "4",
  five: "5",
  six: "6",
  seven: "7",
  eight: "8",
  nine: "9",
  ten: "10",
};

function getSequelIndicators(normStr: string): Set<string> {
  const tokens = normStr.split(/[^a-z0-9]+/);
  const indicators = new Set<string>();
  for (const token of tokens) {
    if (/^\d+$/.test(token)) {
      const num = parseInt(token, 10);
      if (num >= 1900 && num <= 2099) {
        continue;
      }
      indicators.add(num.toString());
    } else if (token in ROMAN_MAP) {
      indicators.add(ROMAN_MAP[token]);
    } else if (token in NUMBER_WORD_MAP) {
      indicators.add(NUMBER_WORD_MAP[token]);
    }
  }
  return indicators;
}

interface SuggestionWithPriority {
  value: string;
  priority: number; // 2 = clean main, 1 = clean alias, 0 = drafty
}

function getRepresentativeScore(name: string, priority: number): number {
  let score = priority * 1000;
  const normalized = normalizeForTokens(name);
  const listingNoise =
    /\b(jeux?\s+video|vintage|old|pal|ntsc|scelle|scellé|blister|boite|boîte|livret|notice|complet|complete|fonctionnel|tested|teste|testé|tbe|hs|condizioni|multilingua|originale|vip|gratte|gratté)\b/i;

  // Prefer names with separators like ':' or ' - ' (indicates full title with subtitle)
  if (name.includes(":") || name.includes(" - ")) {
    score += 100;
  }

  if (name.includes("&")) {
    score += 45;
  }

  // Prefer names with French accents
  const hasAccents = /[éèàùçêâôîëïüû]/.test(name.toLowerCase());
  if (hasAccents) {
    score += 50;
  }

  // Prefer real localized title words, not generic listing words like "jeu" or "pour".
  const meaningfulFrenchWords =
    /\b(criquet|ravageur|histoire|aventure|monde|château|chateau|légende|legende|cretins|crétins|millions?|retour|passe|passé)\b/i;
  const hasFrenchTitleWords = meaningfulFrenchWords.test(name);
  if (hasFrenchTitleWords) {
    score += 30;
  }

  if (listingNoise.test(normalized)) {
    score -= 420;
  }

  if (/\bjeux?\s+olympiques?\b/.test(normalized)) {
    score += 70;
  }

  if (
    /\band\b/.test(name) &&
    /\b(aux|jeux?|olympiques?|hiver)\b/.test(normalized)
  ) {
    score -= 55;
  }

  // Massive bonus for French characteristics if the name is clean (priority >= 1)
  // to ensure clean French aliases are selected over clean English main names.
  if (priority >= 1 && (hasAccents || hasFrenchTitleWords)) {
    score += 1500;
  }

  // Penalize very short names (e.g. length <= 3)
  if (name.length <= 3) {
    score -= 20;
  }

  return score;
}

function pickPreferredDisplayName(current: string, candidate: string): string {
  const currentScore = getRepresentativeScore(current, 1);
  const candidateScore = getRepresentativeScore(candidate, 1);

  if (candidateScore !== currentScore) {
    return candidateScore > currentScore ? candidate : current;
  }

  return current.length <= candidate.length ? current : candidate;
}

function scoreDisplayTitle(name: string, isCanonical = false): number {
  const normalized = normalizeForTokens(name);
  let score = getRepresentativeScore(name, 1);

  if (isCanonical) score += 120;
  if (name.includes("&")) score += 180;
  if (/\b(19|20)\d{2}\b/.test(normalized)) score -= 90;
  if (
    /\b(nintendo|sega|notice|manuale|livret|boite|boîte|complet|complete|completo|pal|fra|ita|jeu\s+video|jeux\s+video|vintage|old|fonctionnel|tested|teste|testé|scelle|scellé|blister|tbe|hs|vip|gratte|gratté)\b/.test(
      normalized,
    )
  ) {
    score -= 360;
  }

  if (/\s[-–—]\s*(wiisc|wii|switch|ps[1-5]|xbox)\s*$/i.test(name)) {
    score -= 500;
  }

  const letters = name.replace(/[^A-Za-zÀ-ÿ]/g, "");
  if (letters.length >= 8 && letters === letters.toUpperCase()) {
    score -= 120;
  }

  return score;
}

function pickPreferredClusterDisplayName(
  representative: string,
  cluster: ProductEvidence[],
): string {
  const canonicalRegionalCandidates = cluster.filter(
    (item) => item.isCanonical && item.region,
  );
  if (canonicalRegionalCandidates.length > 0) {
    const regionOrder = ["fr", "eu", "wor", "uk", "us", "jp"];
    const regionRank = (region?: string | null) => {
      const index = regionOrder.indexOf((region || "").toLowerCase());
      return index === -1 ? regionOrder.length : index;
    };
    return canonicalRegionalCandidates.slice().sort((a, b) => {
      const regionDiff = regionRank(a.region) - regionRank(b.region);
      if (regionDiff !== 0) return regionDiff;
      const priorityDiff = b.priority - a.priority;
      if (priorityDiff !== 0) return priorityDiff;
      return a.title.length - b.title.length;
    })[0].title;
  }

  const candidates = [
    { name: representative, isCanonical: true },
    ...cluster.flatMap((item) => [
      { name: item.title, isCanonical: item.isCanonical },
      { name: item.cleanName, isCanonical: item.isCanonical },
    ]),
  ];
  const seen = new Set<string>();

  const validCandidates = candidates
    .map((candidate) => ({
      ...candidate,
      name: cleanTitleForDisplay(candidate.name, {
        preservePlatformSuffix: candidate.isCanonical,
      }),
    }))
    .filter((candidate) => {
      const key = candidate.name.toLowerCase().trim();
      if (
        !key ||
        seen.has(key) ||
        !areLikelySameProduct(representative, candidate.name)
      ) {
        return false;
      }
      seen.add(key);
      return true;
    });
  const specificCandidates = validCandidates.filter((candidate) => {
    return !validCandidates.some(
      (other) =>
        other.name !== candidate.name &&
        isStrictTitleSubset(candidate.name, other.name),
    );
  });
  const displayCandidates =
    specificCandidates.length > 0 ? specificCandidates : validCandidates;

  return (
    displayCandidates.sort((a, b) => {
      const scoreA = scoreDisplayTitle(a.name, a.isCanonical);
      const scoreB = scoreDisplayTitle(b.name, b.isCanonical);
      if (scoreA !== scoreB) return scoreB - scoreA;
      return a.name.length - b.name.length;
    })[0]?.name || representative
  );
}

function clusterSuggestions(
  suggestions: SuggestionWithPriority[],
): { name: string; suggestions: string[] }[] {
  const clusters: {
    representative: SuggestionWithPriority;
    members: SuggestionWithPriority[];
  }[] = [];

  for (const item of suggestions) {
    const cleanName = item.value.trim();
    if (!cleanName) continue;

    let bestClusterIndex = -1;
    let bestScore = 0;

    for (let i = 0; i < clusters.length; i++) {
      const rep = clusters[i].representative.value.toLowerCase();
      const candidate = cleanName.toLowerCase();
      const repNorm = normalizeForTokens(rep);
      const candNorm = normalizeForTokens(candidate);

      const dist = levenshtein.get(rep, candidate);
      const maxLen = Math.max(rep.length, candidate.length);
      const similarity = maxLen > 0 ? 1 - dist / maxLen : 0;

      const containsMatch = rep.includes(candidate) || candidate.includes(rep);

      // Tokenize on accent-normalized strings so "trésor" → "tresor" (5 chars) is found
      const repTokens = new Set(repNorm.split(/[^a-z0-9]+/));
      const candTokens = new Set(candNorm.split(/[^a-z0-9]+/));
      const intersection = [...repTokens].filter(
        (t) => t.length > 3 && candTokens.has(t),
      );

      const repIndicators = getSequelIndicators(repNorm);
      const candIndicators = getSequelIndicators(candNorm);
      let indicatorsDifferent = false;
      if (repIndicators.size !== candIndicators.size) {
        indicatorsDifferent = true;
      } else {
        for (const ind of repIndicators) {
          if (!candIndicators.has(ind)) {
            indicatorsDifferent = true;
            break;
          }
        }
      }

      const repFirstSig = [...repTokens].find((t) => t.length > 3);
      const candFirstSig = [...candTokens].find((t) => t.length > 3);
      const shareFirstSig =
        repFirstSig && candFirstSig && repFirstSig === candFirstSig;

      if (
        !indicatorsDifferent &&
        (similarity > 0.45 ||
          containsMatch ||
          intersection.length >= 2 ||
          (shareFirstSig && similarity > 0.2))
      ) {
        // Use composite score: similarity + token overlap bonus + containsMatch bonus
        // This ensures rearranged/inverted titles (same tokens, low Levenshtein) still cluster
        const score =
          similarity + intersection.length * 0.06 + (containsMatch ? 0.25 : 0);
        if (score > bestScore) {
          bestScore = score;
          bestClusterIndex = i;
        }
      }
    }

    if (bestClusterIndex !== -1) {
      clusters[bestClusterIndex].members.push(item);

      const currentRep = clusters[bestClusterIndex].representative;
      const repScore = getRepresentativeScore(
        currentRep.value,
        currentRep.priority,
      );
      const candScore = getRepresentativeScore(item.value, item.priority);

      if (candScore > repScore) {
        clusters[bestClusterIndex].representative = item;
      } else if (candScore === repScore) {
        if (item.value.length < currentRep.value.length) {
          clusters[bestClusterIndex].representative = item;
        }
      }
    } else {
      clusters.push({
        representative: item,
        members: [item],
      });
    }
  }

  return clusters.map((c) => {
    const seen = new Set<string>();
    const unique = [];
    for (const m of c.members) {
      const norm = m.value.toLowerCase().trim();
      if (!seen.has(norm)) {
        seen.add(norm);
        unique.push(m.value);
      }
    }
    return {
      name: c.representative.value,
      suggestions: unique,
    };
  });
}
