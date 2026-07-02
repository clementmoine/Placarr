const PAL_REGION_IDS = new Set([6, 7, 8]);

export function isPalRegionId(regionId?: number | null): boolean {
  return regionId != null && PAL_REGION_IDS.has(regionId);
}

export function regionIdToAttachmentRole(
  regionId?: number | null,
): string | undefined {
  if (regionId == null) return undefined;
  if (isPalRegionId(regionId)) return "eu";
  if (regionId === 4) return "jp";
  if (regionId === 1 || regionId === 2) return "us";
  return "wor";
}
