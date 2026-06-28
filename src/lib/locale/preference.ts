export const LOCALE_REGION_ORDER = [
  "fr",
  "eu",
  "wor",
  "uk",
  "us",
  "jp",
] as const;

export const LOCALE_LANGUAGE_ORDER = ["fr", "en"] as const;

export type LocaleRegion = (typeof LOCALE_REGION_ORDER)[number];
export type LocaleLanguage = (typeof LOCALE_LANGUAGE_ORDER)[number];

const LOCALE_REGION_ALIASES: Record<string, LocaleRegion> = {
  de: "eu",
  eur: "eu",
  europe: "eu",
  france: "fr",
  fra: "fr",
  world: "wor",
  global: "wor",
  usa: "us",
  "north america": "us",
  japan: "jp",
  jpn: "jp",
  uk: "uk",
  "united kingdom": "uk",
  germany: "eu",
  spain: "eu",
  italy: "eu",
  netherlands: "eu",
  portugal: "eu",
  poland: "eu",
  australia: "eu",
  canada: "us",
  brazil: "us",
  korea: "jp",
};

function normalizeRegionToken(region?: string | null): string {
  return (region || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function resolveLocaleRegion(
  region?: string | null,
): LocaleRegion | undefined {
  const normalized = normalizeRegionToken(region);
  if (!normalized) return undefined;

  if (LOCALE_REGION_ORDER.includes(normalized as LocaleRegion)) {
    return normalized as LocaleRegion;
  }

  return LOCALE_REGION_ALIASES[normalized];
}

export function regionRank(region?: string | null): number {
  const resolved = resolveLocaleRegion(region);
  if (resolved) {
    return LOCALE_REGION_ORDER.indexOf(resolved);
  }
  return LOCALE_REGION_ORDER.length;
}

export function languageRank(language?: string | null): number {
  const normalized = (language || "").toLowerCase().split(/[-_]/)[0];
  const index = LOCALE_LANGUAGE_ORDER.indexOf(normalized as LocaleLanguage);
  return index === -1 ? LOCALE_LANGUAGE_ORDER.length : index;
}

const BGG_LANGUAGE_ROLE_MAP: Record<string, string> = {
  french: "fr",
  francais: "fr",
  english: "wor",
  german: "eu",
  dutch: "eu",
  spanish: "eu",
  italian: "eu",
  portuguese: "eu",
  polish: "eu",
  hungarian: "eu",
  ukrainian: "eu",
  chinese: "jp",
  japanese: "jp",
  korean: "jp",
};

export function mapBggLanguageToAttachmentRole(
  language?: string | null,
  editionName?: string | null,
): string {
  const candidates = [language, editionName].filter(Boolean) as string[];

  for (const candidate of candidates) {
    const normalized = candidate
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();

    if (BGG_LANGUAGE_ROLE_MAP[normalized]) {
      return BGG_LANGUAGE_ROLE_MAP[normalized];
    }

    for (const [label, role] of Object.entries(BGG_LANGUAGE_ROLE_MAP)) {
      if (normalized.includes(label)) return role;
    }
  }

  return "wor";
}

export function parseRegionFromRole(role?: string | null): string | undefined {
  if (!role) return undefined;

  const normalized = normalizeRegionToken(role);
  if (/[-_]/.test(normalized) && !LOCALE_REGION_ALIASES[normalized]) {
    return undefined;
  }

  return resolveLocaleRegion(normalized);
}

const LOCALE_ATTACHMENT_BONUSES = [80, 60, 30, 10, -20, -30];

export function localeBonusForAttachmentRole(role?: string | null): number {
  const region = parseRegionFromRole(role) || (role || "").toLowerCase();
  const rank = regionRank(region);
  return rank < LOCALE_ATTACHMENT_BONUSES.length
    ? LOCALE_ATTACHMENT_BONUSES[rank]
    : 0;
}

export function inferTextLanguage(text: string): LocaleLanguage | "unknown" {
  if (/[éèàùçêâôîëïüû]/i.test(text)) return "fr";

  if (/[¿¡]/.test(text)) return "es";

  const normalized = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  if (
    /\b(le|la|les|un|une|des|du|de|en|et|pour|sur|au|aux|avec|sans|dans|jeu|jeux|film|serie|saison|episode)\b/.test(
      normalized,
    )
  ) {
    return "fr";
  }

  if (
    /\b(the|and|with|from|this|that|game|movie|series|season|episode)\b/.test(
      normalized,
    )
  ) {
    return "en";
  }

  return "unknown";
}

export interface LocalizedTextCandidate {
  text?: string | null;
  region?: string | null;
  language?: string | null;
  source?: string | null;
}

export interface RegionalTitleSource {
  title?: string;
  regionalTitles?: { region?: string; text: string }[];
}

export function pickBestRegionalTitle(
  sources: RegionalTitleSource[],
): string | undefined {
  const candidates: Array<{ text: string; region?: string }> = [];

  for (const source of sources) {
    for (const regionalTitle of source.regionalTitles || []) {
      if (regionalTitle.text?.trim()) {
        candidates.push({
          text: regionalTitle.text.trim(),
          region: regionalTitle.region,
        });
      }
    }

    if (source.title?.trim()) {
      candidates.push({ text: source.title.trim() });
    }
  }

  if (candidates.length === 0) return undefined;

  return candidates
    .slice()
    .sort((a, b) => regionRank(a.region) - regionRank(b.region))[0].text;
}

export function pickBestLocalizedDescription(
  candidates: LocalizedTextCandidate[],
): string | undefined {
  const valid = candidates
    .filter(
      (candidate): candidate is LocalizedTextCandidate & { text: string } =>
        Boolean(candidate.text?.trim()),
    )
    .map((candidate) => ({
      text: candidate.text.trim(),
      language:
        candidate.language || inferTextLanguage(candidate.text) || undefined,
      region: candidate.region,
      source: candidate.source,
    }));

  if (valid.length === 0) return undefined;
  if (valid.length === 1) return valid[0].text;

  return valid.slice().sort((a, b) => {
    const languageDiff = languageRank(a.language) - languageRank(b.language);
    if (languageDiff !== 0) return languageDiff;

    const regionDiff = regionRank(a.region) - regionRank(b.region);
    if (regionDiff !== 0) return regionDiff;

    return b.text.length - a.text.length;
  })[0].text;
}
