import {
  resolveLocaleRegion,
  type LocaleRegion,
} from "@/core/locale/preference";

export type AttachmentDisplayLocale = "fr" | "en";

export type AttachmentDisplayKind =
  | "cover"
  | "back"
  | "disc"
  | "spine"
  | "cover3d"
  | "grid"
  | "grid3d"
  | "screenshot"
  | "background"
  | "logo"
  | "artwork"
  | "banner"
  | "image"
  | "barcode";

export type AttachmentLabelInput = {
  type: string;
  role?: string | null;
  title?: string | null;
  source?: string | null;
  /**
   * Provider display label (registry `info.label`) stamped onto the attachment
   * server-side (see `@/core/catalog/sourceTraits`). The chip label reads
   * this so this client-safe module carries no provider-id→label map. Absent for
   * non-provider tags (handled below) and for unknown sources (title-cased).
   */
  providerLabel?: string | null;
  /**
   * All contributor source ids/labels collected when the same image URL was
   * seen from several providers. Display-ready names preferred; raw ids are
   * title-cased as a fallback.
   */
  sourceNames?: string[] | null;
  gridStyleCoverLabelsSource?: boolean;
};

// Synthetic, non-provider attachment sources (not registry providers, so no
// `info.label`); these keep an explicit display label here — except `merged`,
// which must not appear as a fake "provider" in the sources tooltip.
const SOURCE_TAG_LABELS: Record<string, string> = {
  barcode: "Scan",
  metadata: "Metadata",
  user: "Perso",
};

const HIDDEN_PROVIDER_SOURCE_TAGS = new Set(["merged"]);

const KIND_LABELS: Record<
  AttachmentDisplayLocale,
  Record<AttachmentDisplayKind, string>
> = {
  fr: {
    cover: "Jaquette",
    back: "Dos",
    disc: "Disque",
    spine: "Tranche",
    cover3d: "Jaquette 3D",
    grid: "Grille",
    grid3d: "Grille 3D",
    screenshot: "Capture",
    background: "Fond",
    logo: "Logo",
    artwork: "Artwork",
    banner: "Bannière",
    image: "Image",
    barcode: "Scan",
  },
  en: {
    cover: "Cover",
    back: "Back",
    disc: "Disc",
    spine: "Spine",
    cover3d: "3D cover",
    grid: "Grid",
    grid3d: "3D grid",
    screenshot: "Screenshot",
    background: "Background",
    logo: "Logo",
    artwork: "Artwork",
    banner: "Banner",
    image: "Image",
    barcode: "Scan",
  },
};

const REGION_LABELS: Record<
  AttachmentDisplayLocale,
  Record<LocaleRegion, string>
> = {
  fr: {
    fr: "France",
    eu: "Europe",
    wor: "Monde",
    uk: "Royaume-Uni",
    us: "États-Unis",
    jp: "Japon",
  },
  en: {
    fr: "France",
    eu: "Europe",
    wor: "World",
    uk: "United Kingdom",
    us: "United States",
    jp: "Japan",
  },
};

/**
 * ISO 639-1 print languages (TCG cards, multi-lang covers).
 *
 * Bare roles like `de` / `it` are also country codes that the region resolver
 * folds into "Europe" for game boxes — fine for ranking, wrong on the Affiche
 * chip when the attachment is a German or Italian *language* printing.
 */
const LANGUAGE_LABELS: Record<
  AttachmentDisplayLocale,
  Record<string, string>
> = {
  fr: {
    fr: "Français",
    en: "Anglais",
    de: "Allemand",
    it: "Italien",
    es: "Espagnol",
    pt: "Portugais",
    nl: "Néerlandais",
    ja: "Japonais",
    zh: "Chinois",
  },
  en: {
    fr: "French",
    en: "English",
    de: "German",
    it: "Italian",
    es: "Spanish",
    pt: "Portuguese",
    nl: "Dutch",
    ja: "Japanese",
    zh: "Chinese",
  },
};

const REGION_TOKEN_ALIASES: Record<string, LocaleRegion> = {
  europe: "eu",
  eur: "eu",
  france: "fr",
  world: "wor",
  global: "wor",
  usa: "us",
  "north america": "us",
  japan: "jp",
  jpn: "jp",
  "united kingdom": "uk",
  germany: "eu",
  spain: "eu",
  italy: "eu",
  australia: "eu",
  canada: "us",
  brazil: "us",
  korea: "jp",
};

function normalizeToken(value?: string | null): string {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function isHiddenProviderSourceTag(source?: string | null): boolean {
  const normalized = normalizeToken(source);
  return Boolean(normalized && HIDDEN_PROVIDER_SOURCE_TAGS.has(normalized));
}

function titleCaseSourceToken(source: string): string {
  return source
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

/** Display-ready contributor labels for the sources tooltip (never "Fusion"). */
export function formatAttachmentSourceNames(
  input: AttachmentLabelInput,
): string[] {
  const names: string[] = [];
  const seen = new Set<string>();

  const push = (value: string | null | undefined) => {
    const trimmed = value?.trim();
    if (!trimmed) return;
    if (isHiddenProviderSourceTag(trimmed)) return;
    if (HIDDEN_PROVIDER_SOURCE_TAGS.has(normalizeToken(trimmed))) return;
    if (normalizeToken(trimmed) === "fusion") return;
    const key = normalizeToken(trimmed);
    if (!key || seen.has(key)) return;
    seen.add(key);
    names.push(trimmed);
  };

  for (const entry of input.sourceNames || []) {
    const normalized = normalizeToken(entry);
    if (SOURCE_TAG_LABELS[normalized]) {
      push(SOURCE_TAG_LABELS[normalized]);
      continue;
    }
    if (isHiddenProviderSourceTag(entry)) continue;
    if (
      normalizeToken(input.source) === normalized &&
      input.providerLabel?.trim()
    ) {
      push(input.providerLabel);
      continue;
    }
    // Raw provider ids → title-case; already-pretty labels pass through.
    push(
      entry.includes(" ") || /[A-Z]/.test(entry)
        ? entry.trim()
        : titleCaseSourceToken(entry),
    );
  }

  push(formatProviderDisplayName(input));

  // Synthetic honor pins should not hide the real catalog provider when both
  // contributed the same file ("Perso" + catalog label → catalog only).
  const withoutHonorPin =
    names.length > 1
      ? names.filter((name) => normalizeToken(name) !== "perso")
      : names;
  return withoutHonorPin.length > 0 ? withoutHonorPin : names;
}

function parseKindFromTitle(
  title?: string | null,
): AttachmentDisplayKind | null {
  const normalized = normalizeToken(title);
  if (!normalized) return null;

  if (/box\s*-\s*back|cart\s*-\s*back|flyer\s*-\s*back/.test(normalized)) {
    return "back";
  }
  if (/\bback\s+cover\b|\brear\s+cover\b|\bverso\b/.test(normalized)) {
    return "back";
  }
  if (/\bcover\s*\(\s*back\s*\)/.test(normalized)) {
    return "back";
  }
  if (/\bmain image 2\b/.test(normalized)) return "back";
  if (/\bmain image 3\b/.test(normalized)) return "disc";
  if (/\bmain image 1\b/.test(normalized)) return "cover";
  if (/box\s*-\s*spine/.test(normalized)) return "spine";
  if (/\bspine\b|spine\s*\/\s*sides\b/.test(normalized)) return "spine";
  if (/\bdisc\b|fanart\s*-\s*disc/.test(normalized)) return "disc";
  if (/\bdisque\b/.test(normalized)) return "disc";
  // HDJV gallery label for optical disc / cartridge face art.
  if (/\bmedia\s+du\s+jeu\b/.test(normalized)) return "disc";
  if (/box\s*-\s*3d|cart\s*-\s*3d/.test(normalized)) return "cover3d";
  if (
    /box\s*-\s*front|cart\s*-\s*front|fanart\s*-\s*box\s*-\s*front/.test(
      normalized,
    )
  ) {
    return "cover";
  }
  if (/fanart\s*-\s*background/.test(normalized)) return "background";
  if (/clear\s*logo/.test(normalized)) return "logo";
  if (/screenshot/.test(normalized)) return "screenshot";
  if (/\bbanner\b/.test(normalized)) return "banner";
  if (/fanart/.test(normalized)) return "artwork";

  return null;
}

function parseRegionToken(token?: string | null): LocaleRegion | null {
  const normalized = normalizeToken(token);
  if (!normalized) return null;

  const canonical = resolveLocaleRegion(normalized);
  if (canonical) return canonical;

  const alias = REGION_TOKEN_ALIASES[normalized];
  return alias || null;
}

function parseRegionFromRole(role?: string | null): LocaleRegion | null {
  const normalized = normalizeToken(role);
  if (!normalized) return null;

  const compoundMatch =
    normalized.match(/^(?:back|disc|spine|3d)-(.+)$/) ||
    normalized.match(/^(.+)-(?:back|support|3d)$/);
  if (compoundMatch?.[1]) {
    return parseRegionToken(compoundMatch[1]);
  }

  return parseRegionToken(normalized);
}

function parseKindFromRole(role?: string | null): AttachmentDisplayKind | null {
  const normalized = normalizeToken(role);
  if (!normalized) return null;

  if (
    normalized.startsWith("back-") ||
    normalized.endsWith("-back") ||
    normalized === "back"
  ) {
    return "back";
  }
  if (
    normalized.startsWith("disc-") ||
    normalized.endsWith("-support") ||
    normalized.includes("disc")
  ) {
    return "disc";
  }
  if (normalized.startsWith("spine-") || normalized === "spine") {
    return "spine";
  }
  if (
    normalized === "3d-grid-vertical" ||
    normalized === "3d-grid-horizontal"
  ) {
    return "grid3d";
  }
  if (
    normalized.startsWith("3d-") ||
    normalized.endsWith("-3d") ||
    normalized.includes("3d")
  ) {
    return "cover3d";
  }
  if (
    normalized === "grid-vertical" ||
    normalized === "grid-horizontal" ||
    normalized === "capsule"
  ) {
    return "grid";
  }
  if (normalized === "header") {
    return "artwork";
  }
  if (normalized === "front") return "cover";

  return null;
}

function humanizeSteamGridDbStyleToken(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function parseSteamGridDbStyleLabel(
  title?: string | null,
): string | null {
  const match = title?.match(/^SteamGridDB(?:\s+Hero|\s+Logo)?\s*-\s*(.+)$/i);
  if (!match?.[1]) return null;
  const style = match[1].trim();
  if (!style || /^steamgriddb$/i.test(style)) return null;
  return humanizeSteamGridDbStyleToken(style);
}

function parseKindFromType(type: string): AttachmentDisplayKind {
  switch (type) {
    case "cover":
      return "cover";
    case "screenshot":
      return "screenshot";
    case "background":
      return "background";
    case "logo":
      return "logo";
    case "artwork":
      return "artwork";
    case "image":
      return "image";
    default:
      return "image";
  }
}

export function resolveAttachmentDisplayKind(
  input: AttachmentLabelInput,
): AttachmentDisplayKind {
  if (input.source === "barcode") return "barcode";

  return (
    parseKindFromTitle(input.title) ||
    parseKindFromRole(input.role) ||
    parseKindFromType(input.type)
  );
}

export function resolveAttachmentDisplayRegion(
  input: AttachmentLabelInput,
): LocaleRegion | null {
  return parseRegionFromRole(input.role);
}

export function resolveAttachmentSemantics(input: AttachmentLabelInput): {
  kind: AttachmentDisplayKind;
  region: LocaleRegion | null;
} {
  return {
    kind: resolveAttachmentDisplayKind(input),
    region: resolveAttachmentDisplayRegion(input),
  };
}

export function isCoverCandidateKind(kind: AttachmentDisplayKind): boolean {
  return (
    kind === "cover" ||
    kind === "cover3d" ||
    kind === "grid" ||
    kind === "grid3d"
  );
}

export function isPhysicalNonCoverKind(kind: AttachmentDisplayKind): boolean {
  return kind === "back" || kind === "disc" || kind === "spine";
}

export function formatProviderDisplayName(
  input: AttachmentLabelInput,
): string | null {
  const source = input.source;
  if (!source) return null;
  const normalized = normalizeToken(source);
  if (!normalized) return null;
  // Orphan / consensus placeholder — not a real provider for the tooltip.
  if (isHiddenProviderSourceTag(source)) return null;

  // Synthetic tag → its fixed label; otherwise the registry label stamped on the
  // attachment; otherwise a best-effort title-cased fallback for unknown sources.
  return (
    SOURCE_TAG_LABELS[normalized] ||
    input.providerLabel ||
    titleCaseSourceToken(source)
  );
}

export function formatAttachmentKindLabel(
  kind: AttachmentDisplayKind,
  locale: AttachmentDisplayLocale = "fr",
): string {
  return KIND_LABELS[locale][kind];
}

export function formatAttachmentRegionLabel(
  region: LocaleRegion | null,
  locale: AttachmentDisplayLocale = "fr",
): string | null {
  if (!region) return null;
  return REGION_LABELS[locale][region];
}

/**
 * Label for a bare ISO language role (`de`, `en`, …). Returns null when the
 * role is a compound region token (`back-eu`, `au`) or an unknown code.
 */
export function formatAttachmentLanguageLabel(
  role?: string | null,
  locale: AttachmentDisplayLocale = "fr",
): string | null {
  const normalized = normalizeToken(role);
  if (!normalized) return null;
  // Compound ScreenScraper roles are regions, not languages.
  if (normalized.includes("-")) return null;
  return LANGUAGE_LABELS[locale][normalized] ?? null;
}

export function getAttachmentGalleryLabels(
  input: AttachmentLabelInput,
  locale: AttachmentDisplayLocale = "fr",
): {
  provider: string | null;
  sourceNames: string[];
  kind: string;
  region: string | null;
  detail: string | null;
  caption: string;
} {
  const kindKey = resolveAttachmentDisplayKind(input);
  const language = formatAttachmentLanguageLabel(input.role, locale);
  const regionKey = language
    ? null
    : resolveAttachmentDisplayRegion(input);
  const kind = formatAttachmentKindLabel(kindKey, locale);
  const region =
    language ?? formatAttachmentRegionLabel(regionKey, locale);
  const sourceNames = formatAttachmentSourceNames(input);
  const provider = sourceNames[0] ?? null;
  const styleLabel =
    input.gridStyleCoverLabelsSource &&
    (kindKey === "grid" || kindKey === "grid3d")
      ? parseSteamGridDbStyleLabel(input.title)
      : null;
  const detail = [kind, region, styleLabel].filter(Boolean).join(" · ");

  return {
    provider,
    sourceNames,
    kind,
    region,
    detail,
    caption: detail,
  };
}

/** @deprecated Use getAttachmentGalleryLabels instead */
export function getMediaTypeLabel(
  type: string,
  locale: AttachmentDisplayLocale = "fr",
): string {
  return formatAttachmentKindLabel(parseKindFromType(type), locale);
}
