import { resolveLocaleRegion, type LocaleRegion } from "@/lib/localePreference";

export type AttachmentDisplayLocale = "fr" | "en";

export type AttachmentDisplayKind =
  | "cover"
  | "back"
  | "disc"
  | "spine"
  | "cover3d"
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
   * server-side (see `@/services/providerSourceTraits`). The chip label reads
   * this so this client-safe module carries no provider-id→label map. Absent for
   * non-provider tags (handled below) and for unknown sources (title-cased).
   */
  providerLabel?: string | null;
};

// Synthetic, non-provider attachment sources (not registry providers, so no
// `info.label`); these keep an explicit display label here.
const SOURCE_TAG_LABELS: Record<string, string> = {
  barcode: "Scan",
  metadata: "Metadata",
  merged: "Fusion",
  user: "Perso",
};

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

function parseKindFromTitle(
  title?: string | null,
): AttachmentDisplayKind | null {
  const normalized = normalizeToken(title);
  if (!normalized) return null;

  if (/box\s*-\s*back|cart\s*-\s*back|flyer\s*-\s*back/.test(normalized)) {
    return "back";
  }
  if (/box\s*-\s*spine/.test(normalized)) return "spine";
  if (/\bdisc\b|fanart\s*-\s*disc/.test(normalized)) return "disc";
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
    normalized.startsWith("3d-") ||
    normalized.endsWith("-3d") ||
    normalized.includes("3d")
  ) {
    return "cover3d";
  }
  if (normalized === "grid-vertical" || normalized === "capsule") {
    return "cover";
  }
  if (normalized === "grid-horizontal" || normalized === "header") {
    return "artwork";
  }
  if (normalized === "front") return "cover";

  return null;
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
  return kind === "cover" || kind === "cover3d";
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

  // Synthetic tag → its fixed label; otherwise the registry label stamped on the
  // attachment; otherwise a best-effort title-cased fallback for unknown sources.
  return (
    SOURCE_TAG_LABELS[normalized] ||
    input.providerLabel ||
    source.replace(/[_-]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase())
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

export function getAttachmentGalleryLabels(
  input: AttachmentLabelInput,
  locale: AttachmentDisplayLocale = "fr",
): {
  provider: string | null;
  kind: string;
  region: string | null;
  detail: string | null;
  caption: string;
} {
  const kindKey = resolveAttachmentDisplayKind(input);
  const regionKey = resolveAttachmentDisplayRegion(input);
  const kind = formatAttachmentKindLabel(kindKey, locale);
  const region = formatAttachmentRegionLabel(regionKey, locale);
  const provider = formatProviderDisplayName(input);
  const detail = region ? `${kind} · ${region}` : kind;

  return {
    provider,
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
