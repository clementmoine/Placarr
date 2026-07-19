/** Map rating-board labels (PEGI, ESRB, …) to cover region tokens. */
export function coverRegionFromAgeRatingBoard(
  ageRating?: string | null,
): string | undefined {
  const trimmed = (ageRating || "").replace(/\s+/g, " ").trim();
  if (!trimmed) return undefined;
  // Collector catalogs occasionally store timestamps in the Rating field.
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return undefined;

  const normalized = trimmed.toLowerCase();
  if (/\bpegi\b/.test(normalized)) return "eu";
  if (/\besrb\b/.test(normalized)) return "us";
  if (/\bcero\b/.test(normalized)) return "jp";
  if (/\busk\b/.test(normalized)) return "eu";
  if (/\bacb\b/.test(normalized)) return "wor";

  return undefined;
}

/** Drop collector-inferred region tokens when the rating board does not confirm them. */
export function roleWithoutCollectorRegion(
  role?: string | null,
): string | undefined {
  if (!role) return undefined;
  if (role === "back" || role === "disc") return role;
  if (role.startsWith("back-")) return "back";
  if (role.startsWith("disc-")) return "disc";
  return undefined;
}
