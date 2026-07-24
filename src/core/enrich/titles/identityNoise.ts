/**
 * Shared identity-noise taxonomies for residual matching and title gates.
 * Prefer registry / listingTerms over parallel word lists.
 */
import { normalizeForTokens } from "@/core/enrich/titles/normalize";
import { VOLUME_KEYWORD_PATTERN } from "@/core/enrich/titles/volumeNumber";
import {
  GAME_EDITION_TERMS,
  LISTING_DISCARD_PACKAGING_NOUNS,
  LISTING_EDITION_PACKAGING_EXTRA_TERMS,
  LISTING_REGION_TERMS,
} from "@/core/identify/listingTerms";
import {
  VIDEO_GAME_PLATFORM_TERMS,
  VIDEO_GAME_PLATFORM_TOKEN_TERMS,
  detectVideoGamePlatformKey,
} from "@/core/identify/platforms/platforms";

/**
 * Closed function-word taxonomy (articles / light prepositions).
 * Not product vocabulary.
 */
export const IDENTITY_FUNCTION_WORDS: ReadonlySet<string> = new Set([
  "a",
  "an",
  "and",
  "au",
  "aux",
  "d",
  "de",
  "des",
  "du",
  "el",
  "en",
  "et",
  "for",
  "l",
  "la",
  "le",
  "les",
  "of",
  "on",
  "or",
  "ou",
  "pour",
  "sur",
  "the",
  "un",
  "une",
  "with",
  "avec",
  "y",
]);

/**
 * Leading articles only — safe to strip in product-line token streams.
 * Do not include conjunctions ("and" / "et"): they sit inside franchise names
 * ("Ratchet and Clank") and must stay as identity.
 */
export const IDENTITY_LEADING_ARTICLES: ReadonlySet<string> = new Set([
  "a",
  "an",
  "au",
  "aux",
  "d",
  "de",
  "des",
  "du",
  "el",
  "l",
  "la",
  "le",
  "les",
  "of",
  "the",
  "un",
  "une",
]);

/**
 * Edition packaging tokens from `GAME_EDITION_TERMS` (central taxonomy).
 * Single-token terms are kept as-is. Multi-word `… edition` phrases contribute
 * their qualifier tokens (`special edition` → `special`). Other multi-word
 * labels are compacted so fragments like `game` are not treated as noise.
 */
export const IDENTITY_EDITION_PACKAGING_TOKENS: ReadonlySet<string> = new Set(
  [...GAME_EDITION_TERMS, ...LISTING_EDITION_PACKAGING_EXTRA_TERMS].flatMap(
    (term) => {
      const normalized = normalizeForTokens(term)
        .replace(/[’‘']/g, "")
        .replace(/\s+/g, " ")
        .trim();
      if (!normalized) return [];
      const parts = normalized.split(/\s+/).filter(Boolean);
      if (parts.length === 1) return parts;
      const isEditionPhrase = parts.some(
        (t) => t === "edition" || t === "editions",
      );
      if (isEditionPhrase) {
        return parts.filter(
          (t) =>
            t !== "edition" &&
            t !== "editions" &&
            !IDENTITY_FUNCTION_WORDS.has(t),
        );
      }
      const compact = parts.join("");
      return compact.length > 2 ? [compact] : [];
    },
  ),
);

/** Platform noise from the video-game platform registry. */
export const IDENTITY_PLATFORM_NOISE_TOKENS: ReadonlySet<string> = new Set([
  ...VIDEO_GAME_PLATFORM_TOKEN_TERMS.map((t) => t.toLowerCase()),
  ...VIDEO_GAME_PLATFORM_TERMS.flatMap((term) => {
    const parts = term.split(/\s+/).filter(Boolean);
    const compact = parts.join("");
    return parts.length === 1 ? parts : compact ? [compact] : [];
  }),
]);

/**
 * Volume / issue markers — closed taxonomy mirrored from
 * `VOLUME_KEYWORD_PATTERN` (+ short forms n/no/nr/ed used in title streams).
 */
export const IDENTITY_VOLUME_STOP_WORDS: ReadonlySet<string> = new Set([
  ...VOLUME_KEYWORD_PATTERN
    .replace(/^\(\?:/, "")
    .replace(/\)$/, "")
    .split("|")
    .flatMap((alt) => {
      if (alt === "vol(?:ume)?") return ["vol", "volume", "volumes"];
      if (alt === "tome") return ["tome", "tomes"];
      if (alt === "numero") return ["numero", "numeros"];
      if (alt === "chapitre") return ["chapitre", "chapter"];
      if (alt === "partie") return ["partie", "part"];
      return [alt];
    }),
  "n",
  "no",
  "nr",
  "num",
  "ed",
  "edition",
  "editions",
]);

/**
 * Listing tokens that do not change which product is meant (DLC / connectors).
 * Do not include conjunctions ("and" / "et"): they sit inside franchise names.
 * Platforms come from the registry via `IDENTITY_PLATFORM_NOISE_TOKENS`.
 */
export const IDENTITY_NEUTRAL_LISTING_TOKENS: ReadonlySet<string> = new Set([
  "dlc",
  "expansion",
  "addon",
  "season",
  "pass",
  "sur",
  "on",
  "for",
]);

/**
 * Locale / listing-art packaging (not franchise product lines).
 * Region atoms from listingTerms; language names + art tokens stay closed.
 */
const IDENTITY_LANGUAGE_NAME_TOKENS = [
  "japanese",
  "japonais",
  "english",
  "anglais",
  "francais",
  "french",
  "german",
  "deutsch",
  "italian",
  "spanish",
  "korean",
  "chinese",
] as const;

const IDENTITY_ART_PACKAGING_TOKENS = [
  "multi",
  "asia",
  "visuel",
  "produit",
  "cover",
  "artwork",
  "artbook",
  "screenshot",
  "screen",
] as const;

export const IDENTITY_LISTING_PACKAGING_NOISE: ReadonlySet<string> = new Set([
  ...LISTING_REGION_TERMS.map((term) => term.toLowerCase()),
  ...IDENTITY_LANGUAGE_NAME_TOKENS,
  ...IDENTITY_ART_PACKAGING_TOKENS,
  ...LISTING_DISCARD_PACKAGING_NOUNS.filter((term) => !/\s/.test(term)).map(
    (term) => term.toLowerCase(),
  ),
]);

export function isIdentityEditionPackagingToken(token: string): boolean {
  return IDENTITY_EDITION_PACKAGING_TOKENS.has(token.toLowerCase());
}

export function isIdentityFunctionWord(token: string): boolean {
  return IDENTITY_FUNCTION_WORDS.has(token.toLowerCase());
}

/**
 * Stoplist for “distinctive” title tokens — function words + thin domain chrome.
 * Shared by evidence + ScreenScraper (lives here to avoid provider↔evidence cycles).
 */
export const GENERIC_TITLE_TOKENS: ReadonlySet<string> = new Set([
  ...IDENTITY_FUNCTION_WORDS,
  "with",
  "jeu",
  "game",
  "jeux",
  "games",
  "edition",
  "version",
]);

export function isIdentityPlatformNoiseToken(token: string): boolean {
  return IDENTITY_PLATFORM_NOISE_TOKENS.has(token.toLowerCase());
}

export function isIdentityVolumeStopWord(token: string): boolean {
  return IDENTITY_VOLUME_STOP_WORDS.has(token.toLowerCase());
}

export function isIdentityNeutralListingToken(token: string): boolean {
  const lower = token.toLowerCase();
  return (
    IDENTITY_NEUTRAL_LISTING_TOKENS.has(lower) ||
    IDENTITY_PLATFORM_NOISE_TOKENS.has(lower)
  );
}

export function isIdentityListingPackagingNoise(token: string): boolean {
  return IDENTITY_LISTING_PACKAGING_NOISE.has(token.toLowerCase());
}

/**
 * Catalog chrome on hardware SKUs (PriceCharting "OLED Model", "Wireless
 * Controller") — not franchise identity. Only applied when shelfType is
 * hardware so game titles keep words like "Model" / "System".
 */
export const HARDWARE_CATALOG_CHROME_TOKENS: ReadonlySet<string> = new Set([
  "model",
  "modele",
  "console",
  "consoles",
  "system",
  "systems",
  "hardware",
  "wireless",
  "peripherique",
  "peripheriques",
  "accessoire",
  "accessoires",
  // Bundle packaging on console SKUs ("NES Deluxe Set", "Xbox 360 Elite").
  "set",
  "deluxe",
  "elite",
  // Default optical-media console SKU chrome ("PS5 Console Disc Version").
  // "Digital" stays identity so Digital Edition ≠ bare disc console.
  "disc",
  "disk",
  // Manufacturer prefix on catalog rows ("Sony PlayStation 4 Pro…",
  // "Nintendo GameCube" ↔ PC "Black Gamecube System" without the brand).
  "sony",
  "microsoft",
  "nintendo",
  "sega",
  "atari",
  // Form-factor tokens are gated by hardwareFormFactorConflict (not bilateral
  // chrome): bare Vita must not accept Vita Slim, but Slim Rose ↔ Slim Pink OK.
  // Default finish SKUs (FR/EN folded via hardwareFinishCanonical).
  "black",
  "noir",
  "noire",
  "white",
  "blanc",
  "blanche",
  "silver",
  "argent",
  "argente",
  "argentee",
  "gray",
  "grey",
  "gris",
  "grise",
  "blue",
  "bleu",
  "bleue",
  "pink",
  "rose",
  "jet",
  // Finish material qualifiers — not distinct SKUs ("Satin Silver" ≡ Silver).
  "satin",
  "matte",
  "mat",
  "glossy",
  "gloss",
]);

/**
 * Default console finish family → canonical key (FR/EN folded).
 * Includes rose≡pink (same default SKU finish as blanc≡white).
 */
const HARDWARE_FINISH_CANONICAL: Readonly<Record<string, string>> = {
  black: "black",
  noir: "black",
  noire: "black",
  jet: "black",
  white: "white",
  blanc: "white",
  blanche: "white",
  silver: "silver",
  argent: "silver",
  argente: "silver",
  argentee: "silver",
  gray: "gray",
  grey: "gray",
  gris: "gray",
  grise: "gray",
  blue: "blue",
  bleu: "blue",
  bleue: "blue",
  pink: "pink",
  rose: "pink",
};

/** EN spelling PriceCharting uses on console finish SKUs. */
const HARDWARE_FINISH_EN_LOOKUP: Readonly<Record<string, string>> = {
  black: "Black",
  white: "White",
  silver: "Silver",
  gray: "Gray",
  blue: "Blue",
  pink: "Pink",
};

/** Lowercase EN finish token for PriceCharting product slugs (`white-…`). */
export function hardwareFinishEnSlugToken(token: string): string | null {
  const canonical = hardwareFinishCanonical(token);
  if (!canonical) return null;
  return (
    HARDWARE_FINISH_EN_LOOKUP[canonical]?.toLowerCase() ?? canonical
  );
}

/** Finish material qualifiers stripped as chrome ("Satin Silver"). */
const HARDWARE_FINISH_QUALIFIER_TOKENS: ReadonlySet<string> = new Set([
  "satin",
  "matte",
  "mat",
  "glossy",
  "gloss",
]);

function normalizeHardwareFinishToken(token: string): string {
  return token
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/^[\[\(\{]+|[\]\)\}]+$/g, "")
    .toLowerCase();
}

/** Split a hardware title into tokens (brackets/parens become separators). */
function hardwareTitleTokens(title: string): string[] {
  return normalizeForTokens(title)
    .replace(/[\[\](){}]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/** Canonical finish for a single token, if it belongs to the default family. */
export function hardwareFinishCanonical(token: string): string | null {
  return HARDWARE_FINISH_CANONICAL[normalizeHardwareFinishToken(token)] ?? null;
}

export function isHardwareFinishQualifierToken(token: string): boolean {
  return HARDWARE_FINISH_QUALIFIER_TOKENS.has(normalizeHardwareFinishToken(token));
}

/** Canonical finishes present in a title ("white", "black"). */
export function hardwareFinishColors(title: string): string[] {
  const found = new Set<string>();
  for (const token of hardwareTitleTokens(title)) {
    const canonical = hardwareFinishCanonical(token);
    if (canonical) found.add(canonical);
  }
  return [...found];
}

/**
 * Request names a finish the candidate lacks or contradicts (Blanche ↛ Black).
 * Candidate-only finish stays allowed (bare "Wii" ↔ "Wii Console White").
 */
export function hardwareFinishConflict(
  requestTitle: string,
  candidateTitle: string,
): boolean {
  const requested = hardwareFinishColors(requestTitle);
  if (requested.length === 0) return false;
  const candidate = hardwareFinishColors(candidateTitle);
  if (candidate.length === 0) return true;
  return !requested.every((finish) => candidate.includes(finish));
}

/** FR finish tokens → EN catalog spellings for PriceCharting seek. */
export function expandHardwareFinishLookupTitles(title: string): string[] {
  const cleaned = title.replace(/\s+/g, " ").trim();
  if (!cleaned) return [];

  const rewritten = cleaned
    .split(/(\s+)/)
    .map((part) => {
      if (/^\s+$/.test(part)) return part;
      const canonical = hardwareFinishCanonical(part);
      if (!canonical) return part;
      return HARDWARE_FINISH_EN_LOOKUP[canonical] ?? part;
    })
    .join("");

  const trimmed = rewritten.replace(/\s+/g, " ").trim();
  return trimmed && trimmed !== cleaned ? [trimmed] : [];
}

/**
 * PAL often ends with the finish ("Wii Console White") while NTSC leads with it
 * ("White Nintendo Wii System"). Emit finish-front System/Console seeks.
 */
export function expandHardwareFinishFrontTitles(title: string): string[] {
  const cleaned = title.replace(/\s+/g, " ").trim();
  if (!cleaned) return [];

  const tokens = cleaned.split(/\s+/);
  let finishIndex = -1;
  let canonical: string | null = null;
  for (let index = 0; index < tokens.length; index++) {
    const finish = hardwareFinishCanonical(tokens[index]!);
    if (!finish) continue;
    finishIndex = index;
    canonical = finish;
    break;
  }
  if (finishIndex < 0 || !canonical) return [];

  const enFinish = HARDWARE_FINISH_EN_LOOKUP[canonical];
  if (!enFinish) return [];

  const rest = tokens
    .filter((_, index) => index !== finishIndex)
    .filter((token) => !/^(console|system|consoles|systems)$/i.test(token));
  if (rest.length === 0) return [];

  const base = rest.join(" ");
  const variants = new Set<string>();
  variants.add(`${enFinish} ${base} System`);
  variants.add(`${enFinish} ${base} Console`);
  // NTSC Wii rows are "White Nintendo Wii System" — only inject for Nintendo
  // platforms (never "Silver Nintendo PlayStation 2").
  const platformKey = detectVideoGamePlatformKey(base);
  if (
    platformKey &&
    !/\bnintendo\b/i.test(base) &&
    !/^(ps|psp|vita|xbox)/i.test(platformKey)
  ) {
    variants.add(`${enFinish} Nintendo ${base} System`);
  }
  variants.delete(cleaned);
  return [...variants];
}

/** Form-factor family on console SKUs (slim/lite fold together). */
const HARDWARE_FORM_FACTOR_CANONICAL: Readonly<Record<string, string>> = {
  slim: "slim",
  lite: "slim",
};

/** Canonical form factors present in a title ("slim", "super-slim"). */
export function hardwareFormFactors(title: string): string[] {
  const normalized = normalizeForTokens(title);
  if (!normalized) return [];
  const found = new Set<string>();
  if (/\bsuper\s+slim\b/.test(normalized)) {
    found.add("super-slim");
    return [...found];
  }
  for (const token of hardwareTitleTokens(title)) {
    const canonical =
      HARDWARE_FORM_FACTOR_CANONICAL[normalizeHardwareFinishToken(token)];
    if (canonical) found.add(canonical);
  }
  return [...found];
}

/**
 * Form-factor gate (asymmetric vs capacity):
 * - Bare request ↛ Slim candidate (Vita bare ≠ Vita Slim).
 * - Request Slim + candidate without Slim stays allowed (PSP-3004 Vibrant Blue).
 * - Both sides naming a factor must agree.
 * - Exception: "PSOne" / "PS One" is the commercial slim redesign of PS1 —
 *   PriceCharting indexes it as "PSOne Slim System", so candidate-only Slim
 *   is catalog chrome, not a distinct SKU.
 */
export function hardwareRequestImpliesCatalogSlimChrome(title: string): boolean {
  const core = normalizeForTokens(title)
    .replace(/\b(?:console|system|systems|consoles)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return core === "psone" || core === "ps one";
}

export function hardwareFormFactorConflict(
  requestTitle: string,
  candidateTitle: string,
): boolean {
  const requested = hardwareFormFactors(requestTitle);
  const candidate = hardwareFormFactors(candidateTitle);
  if (requested.length === 0 && candidate.length === 0) return false;
  // Candidate-only form factor is identity the request never asked for —
  // except PSOne ↔ "… Slim …" (redesign name already implies slim).
  if (requested.length === 0 && candidate.length > 0) {
    if (
      candidate.length === 1 &&
      candidate[0] === "slim" &&
      hardwareRequestImpliesCatalogSlimChrome(requestTitle)
    ) {
      return false;
    }
    return true;
  }
  // Request-only form factor may be omitted on catalog rows.
  if (requested.length > 0 && candidate.length === 0) return false;
  return (
    !requested.every((factor) => candidate.includes(factor)) ||
    !candidate.every((factor) => requested.includes(factor))
  );
}

export function isHardwareFormFactorToken(token: string): boolean {
  return Boolean(
    HARDWARE_FORM_FACTOR_CANONICAL[normalizeHardwareFinishToken(token)],
  );
}

/** Storage capacity on console SKUs ("1TB", "500GB", "1To", "512Mo"). */
const HARDWARE_CAPACITY_TOKEN_RE = /^\d+(?:tb|gb|go|to|mo|mb)$/i;

/** Glued or spaced capacities in a title ("60Go", "60 GB", "1To"). */
const HARDWARE_CAPACITY_IN_TITLE_RE = /\b(\d+)\s*(tb|to|gb|go|mo|mb)\b/gi;

function normalizeHardwareCapacityUnit(unit: string): string {
  const lower = unit.toLowerCase();
  if (lower === "go" || lower === "gb") return "gb";
  if (lower === "to" || lower === "tb") return "tb";
  if (lower === "mo" || lower === "mb") return "mb";
  return lower;
}

/** Canonical capacities present in a title ("60gb", "1tb") — FR/EN units folded. */
export function hardwareStorageCapacities(title: string): string[] {
  const normalized = normalizeForTokens(title);
  if (!normalized) return [];
  const found = new Set<string>();
  for (const match of normalized.matchAll(HARDWARE_CAPACITY_IN_TITLE_RE)) {
    const amount = match[1];
    const unit = match[2];
    if (!amount || !unit) continue;
    found.add(`${amount}${normalizeHardwareCapacityUnit(unit)}`);
  }
  return [...found];
}

/**
 * Fold FR/EN storage units in a title so product-compare tokens align
 * ("60Go" / "60 GB" → "60gb", "1To" → "1tb").
 */
export function foldHardwareCapacityUnitsInTitle(title: string): string {
  if (!title.trim()) return title;
  return title.replace(
    /(\d+)\s*(tb|to|gb|go|mo|mb)\b/gi,
    (_match, amount: string, unit: string) =>
      `${amount}${normalizeHardwareCapacityUnit(unit)}`,
  );
}

/**
 * Request names a capacity the candidate lacks or contradicts (60Go ↛ 80GB).
 * Candidate-only capacity stays allowed (bare "PS4 Pro" ↔ "… Pro 1TB").
 */
export function hardwareStorageCapacityConflict(
  requestTitle: string,
  candidateTitle: string,
): boolean {
  const requested = hardwareStorageCapacities(requestTitle);
  if (requested.length === 0) return false;
  const candidate = hardwareStorageCapacities(candidateTitle);
  if (candidate.length === 0) return true;
  return !requested.every((capacity) => candidate.includes(capacity));
}

/**
 * Controller / pad family — interchangeable on hardware shelves
 * (manette ↔ controller). Structural merch class, not product vocabulary.
 */
export const HARDWARE_CONTROLLER_FAMILY_TOKENS: ReadonlySet<string> = new Set([
  "manette",
  "manettes",
  "controller",
  "controllers",
  "gamepad",
  "gamepads",
  "joycon",
  "joycons",
]);

/**
 * Catalog SKU model digits ("PSP-3004" → 3004). Length ≥4 so platform
 * generations stay identity ("2", "360", "64").
 */
const HARDWARE_MODEL_SKU_DIGIT_RE = /^\d{4,}$/;

export function isHardwareCatalogChromeToken(token: string): boolean {
  const lower = normalizeHardwareFinishToken(token);
  if (HARDWARE_CATALOG_CHROME_TOKENS.has(lower)) return true;
  if (isHardwareFormFactorToken(lower)) return true;
  if (isHardwareFinishQualifierToken(lower)) return true;
  if (HARDWARE_MODEL_SKU_DIGIT_RE.test(lower)) return true;
  return HARDWARE_CAPACITY_TOKEN_RE.test(lower);
}

export function isHardwareControllerFamilyToken(token: string): boolean {
  return HARDWARE_CONTROLLER_FAMILY_TOKENS.has(token.toLowerCase());
}
