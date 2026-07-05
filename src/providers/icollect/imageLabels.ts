export type ICollectImageKind = "cover" | "back" | "disc";

function normalizeICollectLabel(value?: string | null): string {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function icollectImageIndexFromUrl(url?: string | null): number | null {
  if (!url) return null;
  const match = url.match(/_(\d+)\.(?:jpe?g|png|webp)$/i);
  if (!match) return null;
  const index = Number.parseInt(match[1], 10);
  return Number.isFinite(index) && index > 0 ? index : null;
}

export function icollectImageKindFromLabel(
  label?: string | null,
  url?: string | null,
): ICollectImageKind {
  const normalized = normalizeICollectLabel(label);

  if (/\b(back|rear|verso)\b/.test(normalized)) return "back";
  if (/\bdisc\b/.test(normalized)) return "disc";
  if (/\bmain image 1\b|\bfront\b/.test(normalized)) return "cover";
  if (/\bmain image 2\b/.test(normalized)) return "back";
  if (/\bmain image 3\b/.test(normalized)) return "disc";

  const index = icollectImageIndexFromUrl(url);
  if (index === 1) return "cover";
  if (index === 2) return "back";
  if (index != null && index >= 3) return "disc";

  return "cover";
}

export function icollectAttachmentRole(
  label: string | undefined,
  url: string | undefined,
  region?: string | null,
): string | undefined {
  const kind = icollectImageKindFromLabel(label, url);
  if (!region) {
    if (kind === "back") return "back";
    if (kind === "disc") return "disc";
    return undefined;
  }
  if (kind === "back") return `back-${region}`;
  if (kind === "disc") return `disc-${region}`;
  return region;
}

/** Drop collector-inferred region tokens when the rating board does not confirm them. */
export function icollectRoleWithoutCollectorRegion(
  role?: string | null,
): string | undefined {
  if (!role) return undefined;
  if (role === "back" || role === "disc") return role;
  if (role.startsWith("back-")) return "back";
  if (role.startsWith("disc-")) return "disc";
  return undefined;
}

function cleanICollectAgeRating(value?: string | null): string | undefined {
  const trimmed = (value || "").replace(/\s+/g, " ").trim();
  return trimmed || undefined;
}

export function icollectCoverRegionFromAgeRating(
  ageRating?: string | null,
): string | undefined {
  const value = cleanICollectAgeRating(ageRating);
  if (!value) return undefined;
  // iCollect occasionally stores timestamps in the Rating field.
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return undefined;

  const normalized = value.toLowerCase();
  if (/\bpegi\b/.test(normalized)) return "eu";
  if (/\besrb\b/.test(normalized)) return "us";
  if (/\bcero\b/.test(normalized)) return "jp";
  if (/\busk\b/.test(normalized)) return "eu";
  if (/\bacb\b/.test(normalized)) return "wor";

  return undefined;
}

export function isICollectAgeRatingFact(fact: {
  kind?: string;
  source?: string | null;
}): boolean {
  return fact.kind === "age-rating" && fact.source === "icollect";
}

export function isICollectAttachmentSource(source?: string | null): boolean {
  return source === "icollect";
}
