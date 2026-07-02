function normalizePriceChartingLabel(value?: string | null): string {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export type PriceChartingImageKind = "cover" | "back" | "spine" | "disc";

export function priceChartingImageKindFromLabel(
  label?: string | null,
): PriceChartingImageKind | null {
  const normalized = normalizePriceChartingLabel(label);
  if (!normalized) return null;

  if (
    /\bcover\s*\(\s*back\s*\)|\bback\s+cover\b|\brear\s+cover\b|\bverso\b/.test(
      normalized,
    )
  ) {
    return "back";
  }
  if (/\bspine\b|spine\s*\/\s*sides\b/.test(normalized)) {
    return "spine";
  }
  if (/\bdisc\b/.test(normalized)) return "disc";
  if (/\bmain\s+image\b|\bfull\s+art\b|\bfront\b/.test(normalized)) {
    return "cover";
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
  return region;
}

export function priceChartingCoverLabelScore(label?: string | null): number {
  const normalized = normalizePriceChartingLabel(label);
  const kind = priceChartingImageKindFromLabel(label);
  switch (kind) {
    case "cover":
      return normalized.includes("main image") ? 100 : 80;
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
  const covers = images.filter(
    (image) => priceChartingImageKindFromLabel(image.label) === "cover",
  );
  if (covers.length === 0) return undefined;

  return [...covers].sort(
    (a, b) =>
      priceChartingCoverLabelScore(b.label) -
      priceChartingCoverLabelScore(a.label),
  )[0]?.url;
}
