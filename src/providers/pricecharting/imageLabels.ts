function normalizePriceChartingLabel(value?: string | null): string {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Closed taxonomy of PriceCharting's own #images gallery chrome — used for
 * cover/role scoring. Unknown labels (bundles, variants, community uploads)
 * are still stored as gallery attachments; they just stay "unrecognized" here
 * so they do not win the primary cover slot.
 */
const CATALOG_PRODUCT_PHOTO_RE =
  /\b(?:box(?:\s+view)?|console|dock|controller|cart(?:ridge)?|manual|insert|backside|system\s*only|loose)\b/;

export type PriceChartingImageKind =
  "cover" | "back" | "spine" | "disc" | "product";

export function priceChartingImageKindFromLabel(
  label?: string | null,
): PriceChartingImageKind | null {
  const normalized = normalizePriceChartingLabel(label);
  if (!normalized) return null;

  if (
    /\bcover\s*\(\s*back\s*\)|\bback\s+cover\b|\brear\s+cover\b|\bverso\b|\bbackside\b|\bbox\s+back(?:\s+art)?\b|\bback\b/.test(
      normalized,
    )
  ) {
    return "back";
  }
  if (/\bspine\b|spine\s*\/\s*sides\b/.test(normalized)) {
    return "spine";
  }
  if (/\bdisc\b/.test(normalized)) return "disc";
  if (
    /\bmain\s+image\b|\bfull\s+art\b|\bbox\s+front(?:\s+art)?\b|\bfront\b|\bbox\s+view\b|\bbox\s+art\b/.test(
      normalized,
    )
  ) {
    return "cover";
  }
  if (CATALOG_PRODUCT_PHOTO_RE.test(normalized)) {
    return "product";
  }

  return null;
}

export function priceChartingAttachmentRole(
  label: string | undefined,
  isPal: boolean,
): string {
  const region = isPal ? "eu" : "us";
  const kind = priceChartingImageKindFromLabel(label);
  if (kind === "back") return `back-${region}`;
  if (kind === "spine") return `spine-${region}`;
  if (kind === "disc") return `disc-${region}`;
  // Product photos use type "image"; region alone keeps locale ranking.
  return region;
}

export function priceChartingAttachmentType(
  label: string | undefined,
): "cover" | "image" {
  const kind = priceChartingImageKindFromLabel(label);
  // Recognized box/media chrome stays "cover"; product shots + unknown gallery
  // labels (bundles, variants, fan uploads) stay "image" so they don't steal
  // the default cover slot.
  if (
    kind === "cover" ||
    kind === "back" ||
    kind === "spine" ||
    kind === "disc"
  ) {
    return "cover";
  }
  return "image";
}

export function priceChartingCoverLabelScore(label?: string | null): number {
  const normalized = normalizePriceChartingLabel(label);
  const kind = priceChartingImageKindFromLabel(label);
  switch (kind) {
    case "cover":
      return normalized.includes("main image")
        ? 100
        : normalized.includes("box view")
          ? 90
          : 80;
    case "product":
      // Out-of-box console shots beat generic accessory chrome for hardware.
      return /\bsystem\s*only\b|^loose$/.test(normalized) ? 70 : 20;
    case "back":
      return -50;
    case "spine":
      return -80;
    case "disc":
      return -90;
    default:
      return 10;
  }
}

export function priceChartingGalleryLabelIsRecognized(
  label?: string | null,
): boolean {
  return priceChartingImageKindFromLabel(label) !== null;
}

export function pickPriceChartingPrimaryCoverUrl(
  images: Array<{ url: string; label?: string }>,
): string | undefined {
  const covers = images.filter((image) => {
    const kind = priceChartingImageKindFromLabel(image.label);
    return kind === "cover" || kind === "product";
  });
  if (covers.length === 0) return undefined;

  return [...covers].sort(
    (a, b) =>
      priceChartingCoverLabelScore(b.label) -
      priceChartingCoverLabelScore(a.label),
  )[0]?.url;
}
