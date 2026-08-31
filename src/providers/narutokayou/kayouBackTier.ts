/**
 * Kayou rarity → `cards/back.<tier>.webp` slug + lookup.
 */
import { assetsPackFileUrl } from "@/lib/packAssetUrls";

/** Printed rarity → filename slug (`◇XR` → `shin-xr`, `UR` → `ur`). */
export function kayouBackTierSlug(
  rarity: string | null | undefined,
): string | null {
  let raw = rarity?.trim().toUpperCase() ?? "";
  if (!raw) return null;
  raw = raw.replace(/\u25C7/g, "SHIN-").replace(/◇/g, "SHIN-");
  const slug = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || null;
}

export function kayouCardBackUrlForRarity(
  packId: string,
  rarity: string | null | undefined,
): string | null {
  const slug = kayouBackTierSlug(rarity);
  if (!slug) return null;
  return assetsPackFileUrl(packId, "cards", `back.${slug}.webp`);
}
