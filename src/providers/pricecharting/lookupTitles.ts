import { buildRomanNumeralTitleVariants } from "@/core/enrich/titles/romanNumeral";
import {
  expandHardwareFinishFrontTitles,
  expandHardwareFinishLookupTitles,
  hardwareFinishColors,
  hardwareRequestImpliesCatalogSlimChrome,
  isHardwareCatalogChromeToken,
} from "@/core/enrich/titles/identityNoise";
import { CONTROLLER_RE } from "@/core/identify/listingMerch";
import {
  VIDEO_GAME_PLATFORMS,
  detectVideoGamePlatformKey,
  getVideoGamePlatform,
  normalizeVideoGamePlatformText,
} from "@/core/identify/platforms/platforms";

function looksLikeMultiGameBundle(title: string): boolean {
  return /\s(?:\/|&|\|)\s/.test(title);
}

function titleTokenCount(value: string): number {
  return value.split(/\s+/).filter(Boolean).length;
}

/**
 * PriceCharting indexes pads as "Joy-Con" / "Joy Con" while shelves often glue
 * the compound ("Joycon"). When a token matches CONTROLLER_RE and has no
 * separator, emit hyphen + spaced spellings (catalog encoding only).
 */
export function expandPriceChartingGluedControllerTitles(title: string): string[] {
  const cleaned = title.replace(/\s+/g, " ").trim();
  if (!cleaned || !CONTROLLER_RE.test(cleaned)) return [];

  const rewrite = (joiner: "-" | " ") =>
    cleaned.replace(/\b[\w']+\b/gi, (token) => {
      if (/[-]/.test(token)) return token;
      if (!CONTROLLER_RE.test(token)) return token;
      const split = token.match(/^(.*?)(cons?)$/i);
      if (!split?.[1] || !split[2] || split[1].length < 2) return token;
      return `${split[1]}${joiner}${split[2]}`;
    });

  const variants = new Set<string>();
  const hyphenated = rewrite("-");
  const spaced = rewrite(" ");
  if (hyphenated !== cleaned) variants.add(hyphenated);
  if (spaced !== cleaned) variants.add(spaced);
  return [...variants];
}

/**
 * Shelf "Nintendo Switch Joycon Gris" → catalog "Nintendo Switch with Gray Joy-Con".
 * Only when the title already names a platform + pad family (not pad-only SKUs).
 */
export function expandPriceChartingPlatformControllerBundleTitles(
  title: string,
): string[] {
  const cleaned = title.replace(/\s+/g, " ").trim();
  if (!cleaned || !CONTROLLER_RE.test(cleaned)) return [];
  if (/\b(?:with|avec)\b/i.test(cleaned)) return [];

  const platformKey = detectVideoGamePlatformKey(cleaned);
  if (!platformKey) return [];
  const platform = getVideoGamePlatform(platformKey);
  if (!platform?.label) return [];

  const english =
    expandHardwareFinishLookupTitles(cleaned)[0] ?? cleaned;
  const finishKeys = hardwareFinishColors(english);
  const finishEn: Record<string, string> = {
    black: "Black",
    white: "White",
    silver: "Silver",
    gray: "Gray",
    blue: "Blue",
    pink: "Pink",
  };
  const finishWord = finishKeys[0] ? finishEn[finishKeys[0]] : undefined;

  const normalized = english.toLowerCase();
  const padForms = /\bjoy/.test(normalized)
    ? (["Joy-Con", "Joy Con"] as const)
    : (["Controller"] as const);

  const variants = new Set<string>();
  for (const pad of padForms) {
    if (finishWord) {
      variants.add(`${platform.label} with ${finishWord} ${pad}`);
    } else {
      variants.add(`${platform.label} with ${pad}`);
    }
  }
  return [...variants];
}

/**
 * Spaced platform aliases on shelves ("PS One") ↔ glued catalog forms ("PSOne").
 * Driven by registry aliases that contain whitespace — not a parallel word list.
 */
export function expandPriceChartingSpacedPlatformAliasTitles(
  title: string,
): string[] {
  const cleaned = title.replace(/\s+/g, " ").trim();
  if (!cleaned) return [];

  const variants = new Set<string>();
  for (const platform of VIDEO_GAME_PLATFORMS) {
    for (const alias of platform.aliases) {
      if (!/\s/.test(alias)) continue;
      const aliasPattern = alias
        .trim()
        .split(/\s+/)
        .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        .join("\\s+");
      const re = new RegExp(`\\b${aliasPattern}\\b`, "gi");
      if (!re.test(cleaned)) continue;
      re.lastIndex = 0;
      const glued = cleaned.replace(re, alias.replace(/\s+/g, ""));
      const spacedNorm = cleaned.replace(re, alias);
      if (glued !== cleaned) variants.add(glued.replace(/\s+/g, " ").trim());
      if (spacedNorm !== cleaned) {
        variants.add(spacedNorm.replace(/\s+/g, " ").trim());
      }
    }
  }
  return [...variants];
}

function hardwareSeekCoreLooksLikeBarePlatform(title: string): boolean {
  const platformKey = detectVideoGamePlatformKey(title);
  if (!platformKey) return false;
  const platform = getVideoGamePlatform(platformKey);
  if (!platform) return false;

  const coreTokens = title
    .split(/\s+/)
    .filter((token) => !isHardwareCatalogChromeToken(token));
  const core = coreTokens.join(" ");
  if (!core) return false;
  const normalizedCore = normalizeVideoGamePlatformText(core);
  return platform.aliases.some(
    (alias) => normalizeVideoGamePlatformText(alias) === normalizedCore,
  );
}

/**
 * PSOne is already the slim redesign — PriceCharting still suffixes "Slim"
 * ("PSOne Slim System"). Emit those seeks so search/direct hit the market SKU.
 */
export function expandPriceChartingPsoneSlimTitles(title: string): string[] {
  const cleaned = title.replace(/\s+/g, " ").trim();
  if (!cleaned) return [];
  if (!hardwareRequestImpliesCatalogSlimChrome(cleaned)) return [];
  if (/\bslim\b/i.test(cleaned)) return [];
  // Bare redesign only — not "PSOne System" (would yield "… System Slim …").
  if (/\b(?:system|console)s?\b/i.test(cleaned)) return [];

  return [`${cleaned} Slim System`, `${cleaned} Slim Console`];
}

/**
 * PriceCharting often puts capacity before the form factor
 * ("Playstation 3 500GB Super Slim") while shelves trail capacity
 * ("… Super Slim 500GB"). Emit the catalog word order for direct slugs.
 */
export function expandPriceChartingHardwareCapacityBeforeFormFactorTitles(
  title: string,
): string[] {
  const cleaned = title.replace(/\s+/g, " ").trim();
  if (!cleaned) return [];

  const match = cleaned.match(
    /^(.*?)\s+((?:super\s+)?(?:slim|lite))\s+(\d+\s*(?:TB|TO|GB|GO|MB|MO))$/i,
  );
  if (!match?.[1] || !match[2] || !match[3]) return [];

  const stem = match[1].trim();
  const form = match[2].replace(/\s+/g, " ").trim();
  const capacity = match[3]
    .trim()
    .replace(/\bgo\b/gi, "GB")
    .replace(/\bto\b/gi, "TB")
    .replace(/\bmo\b/gi, "MB");
  if (!stem || !form || !capacity) return [];

  const reordered = `${stem} ${capacity} ${form}`;
  return reordered === cleaned ? [] : [reordered];
}

/**
 * Bare console shelf titles ("Nintendo 64") — PriceCharting systems SKUs add
 * catalog chrome "System" / "Console". Also for platform + hardware chrome
 * ("Xbox 360 Elite", "PS One Slim") so seek can hit "… System".
 * Trailing capacity → insert before it ("Slim 250GB" → "Slim Console 250GB").
 */
export function expandPriceChartingHardwareSystemTitles(title: string): string[] {
  const cleaned = title.replace(/\s+/g, " ").trim();
  if (!cleaned) return [];
  if (CONTROLLER_RE.test(cleaned)) return [];
  if (/\b(?:system|systems|console|consoles)\b/i.test(cleaned)) return [];

  const platformKey = detectVideoGamePlatformKey(cleaned);
  if (!platformKey) return [];
  const platform = getVideoGamePlatform(platformKey);
  if (!platform) return [];

  const normalized = normalizeVideoGamePlatformText(cleaned);
  const isBarePlatform = platform.aliases.some(
    (alias) => normalizeVideoGamePlatformText(alias) === normalized,
  );
  if (!isBarePlatform && !hardwareSeekCoreLooksLikeBarePlatform(cleaned)) {
    return [];
  }

  const capacityTail = cleaned.match(
    /^(.*?)\s+(\d+\s*(?:TB|TO|GB|GO|MB|MO))$/i,
  );
  if (capacityTail?.[1] && capacityTail[2]) {
    const stem = capacityTail[1].trim();
    const capacity = capacityTail[2]
      .trim()
      .replace(/\bgo\b/gi, "GB")
      .replace(/\bto\b/gi, "TB")
      .replace(/\bmo\b/gi, "MB");
    if (stem) {
      return [
        `${stem} System ${capacity}`,
        `${stem} Console ${capacity}`,
      ];
    }
  }

  return [`${cleaned} System`, `${cleaned} Console`];
}

/**
 * PriceCharting often indexes the franchise stem only ("Pokemon Yellow") while
 * shelves carry the full regional subtitle ("… Version: Special Pikachu Edition").
 * Long queries miss the catalog and soft-404 slugs onto guides — emit shorter
 * stems so seek can fall through after specific titles fail.
 */
export function expandPriceChartingFranchiseStemTitles(
  title: string,
): string[] {
  const cleaned = title.replace(/\s+/g, " ").trim();
  if (!cleaned) return [];

  const stems = new Set<string>();
  const subtitleStem = cleaned.split(/\s*[:\-–—]\s+/)[0]?.trim();
  if (
    subtitleStem &&
    subtitleStem !== cleaned &&
    titleTokenCount(subtitleStem) >= 2
  ) {
    stems.add(subtitleStem);
  }

  for (const base of [cleaned, ...stems]) {
    const withoutVersion = base
      .replace(/\bversions?\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (
      withoutVersion &&
      withoutVersion !== base &&
      titleTokenCount(withoutVersion) >= 2
    ) {
      stems.add(withoutVersion);
    }
  }

  return [...stems];
}

/**
 * PriceCharting drops the decimal point in versioned titles:
 * "Colin McRae Rally 2.0" → slug `colin-mcrae-rally-20` (not `2-0`).
 */
export function expandPriceChartingDecimalVersionTitles(
  title: string,
): string[] {
  const cleaned = title.replace(/\s+/g, " ").trim();
  if (!cleaned || !/\d\.\d/.test(cleaned)) return [];

  const collapsed = cleaned.replace(/(\d)\.(\d+)/g, "$1$2");
  return collapsed !== cleaned ? [collapsed] : [];
}

/**
 * PriceCharting slug conventions are inconsistent around possessives:
 * Assassin's Creed keeps `%27s`, but "Tony Hawk's …" often drops the `'s`
 * entirely (`tony-hawk-american-wasteland`). Emit both shapes for lookup.
 */
export function expandPriceChartingPossessiveTitleVariants(
  title: string,
): string[] {
  const cleaned = title.replace(/\s+/g, " ").trim();
  if (!cleaned) return [];

  const variants = new Set<string>([cleaned]);
  const withoutPossessive = cleaned
    .replace(/['’]s\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  if (withoutPossessive && withoutPossessive !== cleaned) {
    variants.add(withoutPossessive);
  }

  // "Tony Hawk's Pro Skater 4" → "Tony Hawk 4" (live PC slug: tony-hawk-4).
  for (const base of [...variants]) {
    const withoutProSkater = base
      .replace(/\bpro\s+skater\s+/gi, "")
      .replace(/\s+/g, " ")
      .trim();
    if (withoutProSkater && withoutProSkater !== base) {
      variants.add(withoutProSkater);
    }
  }

  return [...variants];
}

/**
 * FR storage units on console shelves ("60Go", "1To") ↔ PriceCharting EN
 * ("60GB", "1TB"). Spaced and glued forms.
 */
export function expandPriceChartingCapacityUnitTitles(title: string): string[] {
  const cleaned = title.replace(/\s+/g, " ").trim();
  if (!cleaned) return [];

  const unitMap: Record<string, string> = {
    go: "GB",
    to: "TB",
    mo: "MB",
    gb: "Go",
    tb: "To",
    mb: "Mo",
  };

  const rewrite = (input: string, joiner: "" | " "): string =>
    input.replace(/\b(\d+)\s*(go|to|mo|gb|tb|mb)\b/gi, (_, amount, unit) => {
      const mapped = unitMap[String(unit).toLowerCase()];
      if (!mapped) return `${amount}${unit}`;
      return `${amount}${joiner}${mapped}`;
    });

  const variants = new Set<string>();
  for (const joiner of ["", " "] as const) {
    const next = rewrite(cleaned, joiner).replace(/\s+/g, " ").trim();
    if (next && next !== cleaned) variants.add(next);
  }
  return [...variants];
}

/** Expands shelf/user titles into PriceCharting-friendly lookup variants. */
export function expandPriceChartingLookupTitles(title: string): string[] {
  const cleaned = title.replace(/\s+/g, " ").trim();
  if (!cleaned) return [];

  const variants = new Set<string>(
    expandPriceChartingPossessiveTitleVariants(cleaned),
  );

  for (const decimal of expandPriceChartingDecimalVersionTitles(cleaned)) {
    variants.add(decimal);
  }

  for (const capacity of expandPriceChartingCapacityUnitTitles(cleaned)) {
    variants.add(capacity);
    for (const possessive of expandPriceChartingPossessiveTitleVariants(
      capacity,
    )) {
      variants.add(possessive);
    }
    for (const systemTitle of expandPriceChartingHardwareSystemTitles(
      capacity,
    )) {
      variants.add(systemTitle);
    }
  }

  for (const finish of expandHardwareFinishLookupTitles(cleaned)) {
    variants.add(finish);
    for (const possessive of expandPriceChartingPossessiveTitleVariants(
      finish,
    )) {
      variants.add(possessive);
    }
    for (const systemTitle of expandPriceChartingHardwareSystemTitles(finish)) {
      variants.add(systemTitle);
    }
  }

  for (const platformAlias of expandPriceChartingSpacedPlatformAliasTitles(
    cleaned,
  )) {
    variants.add(platformAlias);
    for (const systemTitle of expandPriceChartingHardwareSystemTitles(
      platformAlias,
    )) {
      variants.add(systemTitle);
    }
  }

  for (const finishFront of expandHardwareFinishFrontTitles(cleaned)) {
    variants.add(finishFront);
  }
  for (const base of [...variants]) {
    for (const finishFront of expandHardwareFinishFrontTitles(base)) {
      variants.add(finishFront);
    }
    for (const platformAlias of expandPriceChartingSpacedPlatformAliasTitles(
      base,
    )) {
      variants.add(platformAlias);
    }
  }

  for (const glued of expandPriceChartingGluedControllerTitles(cleaned)) {
    variants.add(glued);
    for (const possessive of expandPriceChartingPossessiveTitleVariants(glued)) {
      variants.add(possessive);
    }
  }

  for (const bundle of expandPriceChartingPlatformControllerBundleTitles(
    cleaned,
  )) {
    variants.add(bundle);
  }
  for (const base of [...variants]) {
    for (const bundle of expandPriceChartingPlatformControllerBundleTitles(
      base,
    )) {
      variants.add(bundle);
    }
  }

  for (const systemTitle of expandPriceChartingHardwareSystemTitles(cleaned)) {
    variants.add(systemTitle);
  }

  for (const base of [...variants]) {
    for (const reordered of expandPriceChartingHardwareCapacityBeforeFormFactorTitles(
      base,
    )) {
      variants.add(reordered);
    }
  }

  for (const base of [...variants]) {
    for (const slimTitle of expandPriceChartingPsoneSlimTitles(base)) {
      variants.add(slimTitle);
    }
  }

  for (const stem of expandPriceChartingFranchiseStemTitles(cleaned)) {
    variants.add(stem);
    for (const possessive of expandPriceChartingPossessiveTitleVariants(stem)) {
      variants.add(possessive);
    }
    for (const glued of expandPriceChartingGluedControllerTitles(stem)) {
      variants.add(glued);
    }
  }

  const bundleNormalized = cleaned
    .replace(/\s*\/\s*/g, " & ")
    .replace(/\s*\|\s*/g, " & ")
    .replace(/\s+/g, " ")
    .trim();
  if (bundleNormalized !== cleaned) {
    variants.add(bundleNormalized);
    for (const possessive of expandPriceChartingPossessiveTitleVariants(
      bundleNormalized,
    )) {
      variants.add(possessive);
    }
  }

  const collapsedDecimalTitles = new Set(
    expandPriceChartingDecimalVersionTitles(cleaned),
  );

  for (const base of [...variants]) {
    // Collapsed "2.0" → "20" is for slug matching only — don't romanize to "XX".
    if (collapsedDecimalTitles.has(base)) continue;
    // Console platform generations ("Nintendo 64") must not become "Nintendo LXIV".
    if (detectVideoGamePlatformKey(base)) continue;
    for (const romanVariant of buildRomanNumeralTitleVariants(base)) {
      // Skip mangled decimals ("2.0" → "II.0").
      if (/\d\.\d/.test(base) && /[IVXLCDM]+\.\d/i.test(romanVariant)) {
        continue;
      }
      variants.add(romanVariant);
    }
  }

  if (
    looksLikeMultiGameBundle(cleaned) ||
    looksLikeMultiGameBundle(bundleNormalized)
  ) {
    for (const base of [...variants]) {
      if (/\bdouble\s*pack\b/i.test(base)) continue;
      const ampersandForm = base.replace(/\s*\/\s*/g, " & ").trim();
      variants.add(`${ampersandForm} Double Pack`);
    }
  }

  return [...variants];
}
