/**
 * Human-readable Live set titles for playroom captions (client-safe).
 *
 * Bundle ids like `bw10_fr_001` mean little in the UI — expand the stem to the
 * retail / Live set name (FR preferred). Unknown stems fall back to the era
 * family (`Noir & Blanc`, `XY`, …) rather than the raw code.
 */

export type LiveSetLocale = "fr" | "en";

type SetTitle = { readonly fr: string; readonly en: string };

/** Exact Live CDN stems we care about (playroom seeds + common dumps). */
const LIVE_SET_TITLES: Readonly<Record<string, SetTitle>> = {
  // Black & White
  bw1: { fr: "Noir & Blanc", en: "Black & White" },
  bw2: { fr: "Pouvoirs Émergents", en: "Emerging Powers" },
  bw3: { fr: "Nobles Victoires", en: "Noble Victories" },
  bw4: { fr: "Destinées Futures", en: "Next Destinies" },
  bw5: { fr: "Explorateurs Obscurs", en: "Dark Explorers" },
  bw6: { fr: "Dragons Exaltés", en: "Dragons Exalted" },
  "bw6-5": { fr: "Coffre des Dragons", en: "Dragon Vault" },
  bw7: { fr: "Frontières Franchies", en: "Boundaries Crossed" },
  bw8: { fr: "Tempête Plasma", en: "Plasma Storm" },
  bw9: { fr: "Gel de Plasma", en: "Plasma Blast" },
  bw10: { fr: "Glaciation Plasma", en: "Plasma Freeze" },
  bw11: { fr: "Trésors Légendaires", en: "Legendary Treasures" },
  bwalt: { fr: "Noir & Blanc (alt)", en: "Black & White (alt)" },
  bwbsp: { fr: "Promo Noir & Blanc", en: "Black & White Promo" },

  // XY
  xy10: { fr: "Rupture TURBO", en: "BREAKpoint" },
  xy11: { fr: "Offensive Vapeur", en: "Steam Siege" },
  xy12: { fr: "Évolutions", en: "Evolutions" },
  xyalt: { fr: "XY (alt)", en: "XY (alt)" },

  // Sun & Moon
  sm9: { fr: "Duo de Choc", en: "Team Up" },
  sm10: { fr: "Alliance Infaillible", en: "Unbroken Bonds" },
  sm11: { fr: "Harmonie des Esprits", en: "Unified Minds" },
  "sm11-5": { fr: "Destinées Occultes", en: "Hidden Fates" },
  smalt: { fr: "Soleil & Lune (alt)", en: "Sun & Moon (alt)" },

  // Sword & Shield
  "swsh7-5": { fr: "Célébrations", en: "Celebrations" },
  "swsh7-5r": { fr: "Célébrations (classiques)", en: "Celebrations Classic" },
  "swsh10-5": { fr: "Pokémon GO", en: "Pokémon GO" },
  swshalt: { fr: "Épée & Bouclier (alt)", en: "Sword & Shield (alt)" },

  // Scarlet & Violet
  "sv4-5": { fr: "Fable Nébuleuse", en: "Shrouded Fable" },
  sv5: { fr: "Forces Temporelles", en: "Temporal Forces" },
  svalt: { fr: "Écarlate & Violet (alt)", en: "Scarlet & Violet (alt)" },

  // Mega Evolution
  me1: { fr: "Méga-Évolution", en: "Mega Evolution" },
  me2: { fr: "Flammes Fantasmagoriques", en: "Phantasmal Flames" },
  me5: { fr: "Nuit Noire", en: "Darkest Hour" },
  mebsp: { fr: "Promo Méga-Évolution", en: "Mega Evolution Promo" },
  mealt: { fr: "Méga-Évolution (alt)", en: "Mega Evolution (alt)" },

  // Energy / misc
  ec: { fr: "Énergies de base", en: "Basic Energy" },
  ecalt: { fr: "Énergies (alt)", en: "Energy (alt)" },
};

/** Era family when the exact expansion isn’t in {@link LIVE_SET_TITLES}. */
const SERIES_FALLBACK: ReadonlyArray<{
  readonly test: (stem: string) => boolean;
  readonly title: SetTitle;
}> = [
  {
    test: (s) => s === "ec" || s.startsWith("ec"),
    title: { fr: "Énergies", en: "Energy" },
  },
  {
    test: (s) => s.startsWith("bw"),
    title: { fr: "Noir & Blanc", en: "Black & White" },
  },
  { test: (s) => s.startsWith("xy"), title: { fr: "XY", en: "XY" } },
  {
    test: (s) => s.startsWith("sm"),
    title: { fr: "Soleil & Lune", en: "Sun & Moon" },
  },
  {
    test: (s) => s.startsWith("swsh"),
    title: { fr: "Épée & Bouclier", en: "Sword & Shield" },
  },
  {
    test: (s) =>
      s.startsWith("sv") || s.startsWith("rsv") || s.startsWith("zsv"),
    title: { fr: "Écarlate & Violet", en: "Scarlet & Violet" },
  },
  {
    test: (s) => s.startsWith("me"),
    title: { fr: "Méga-Évolution", en: "Mega Evolution" },
  },
];

const BUNDLE_RE =
  /^(?<set>[a-z0-9.-]+)_(?<lang>[a-z]{2,4})_(?<num>\d+)(?:_[a-z])?$/i;

export type ParsedLiveBundleId = {
  liveSet: string;
  lang: string;
  num: number;
};

export function parseLiveBundleId(
  bundleId: string | null | undefined,
): ParsedLiveBundleId | null {
  const raw = bundleId?.trim() ?? "";
  if (!raw) return null;
  const match = BUNDLE_RE.exec(raw);
  if (!match?.groups) return null;
  const liveSet = match.groups.set!.toLowerCase();
  const lang = match.groups.lang!.toLowerCase();
  const num = Number.parseInt(match.groups.num!, 10);
  if (!liveSet || !Number.isFinite(num) || num <= 0) return null;
  return { liveSet, lang, num };
}

export function liveSetDisplayName(
  liveSet: string | null | undefined,
  locale: LiveSetLocale = "fr",
): string | null {
  const stem = liveSet?.trim().toLowerCase() ?? "";
  if (!stem) return null;
  const exact = LIVE_SET_TITLES[stem];
  if (exact) return exact[locale];
  for (const row of SERIES_FALLBACK) {
    if (row.test(stem)) return row.title[locale];
  }
  return null;
}

/** Era / block for a Live stem (`Épée & Bouclier`, `XY`, …). */
export function liveSerieDisplayName(
  liveSet: string | null | undefined,
  locale: LiveSetLocale = "fr",
): string | null {
  const stem = liveSet?.trim().toLowerCase() ?? "";
  if (!stem) return null;
  for (const row of SERIES_FALLBACK) {
    if (row.test(stem)) return row.title[locale];
  }
  return null;
}

/**
 * Face caption without opaque bundle codes.
 * e.g. `Florizarre Radieux · Épée & Bouclier · Pokémon GO n°4`
 *
 * Prefixes the era when the expansion name alone would hide it (same idea as
 * `tcgdexPrintLabel`: serie · extension · number).
 */
export function formatPlayroomFaceCaption(
  cardName: string,
  bundleId: string | null | undefined,
  locale: LiveSetLocale = "fr",
): string {
  const name = cardName.trim();
  const parsed = parseLiveBundleId(bundleId);
  if (!parsed) {
    return bundleId?.trim() ? `${name} · ${bundleId.trim()}` : name;
  }
  const setName =
    liveSetDisplayName(parsed.liveSet, locale) ?? parsed.liveSet.toUpperCase();
  const serie = liveSerieDisplayName(parsed.liveSet, locale);
  const parts = [name];
  if (
    serie &&
    serie.toLowerCase() !== setName.toLowerCase() &&
    !setName.toLowerCase().startsWith(serie.toLowerCase())
  ) {
    parts.push(serie);
  }
  parts.push(`${setName} n°${parsed.num}`);
  return parts.join(" · ");
}

/**
 * Live `name_fr` sometimes stores attack/rules body (blob string offsets).
 * Reject those so captions can fall back to `name_en`.
 */
export function isPlausibleLiveCardName(
  name: string | null | undefined,
): boolean {
  const t = (name ?? "").trim();
  if (!t) return false;
  // Real Trainer/TM titles top out around ~50–60 chars; attack bodies run longer.
  if (t.length > 72) return false;
  if (
    /adversaire|pokémon actif|<sprite|cette attaque|dégâts|défaussez|si c'est face|cartes objet|marqueurs? de dégâts|batt(re|ent) en retraite|inflige \d|pour chaque/i.test(
      t,
    )
  ) {
    return false;
  }
  // Truncated mid-sentence fragments often start lowercase and contain spaces.
  if (/^[a-zàâäéèêëïîôùûüç]/.test(t) && /\s/.test(t)) return false;
  return true;
}

/** Prefer FR name when sane; otherwise EN; otherwise caller fallback. */
export function pickLiveCardDisplayName(opts: {
  nameFr?: string | null;
  nameEn?: string | null;
  prefer?: LiveSetLocale;
  fallback: string;
}): string {
  const ordered =
    (opts.prefer ?? "fr") === "fr"
      ? [opts.nameFr, opts.nameEn]
      : [opts.nameEn, opts.nameFr];
  for (const cand of ordered) {
    if (isPlausibleLiveCardName(cand)) return cand!.trim();
  }
  return opts.fallback;
}
