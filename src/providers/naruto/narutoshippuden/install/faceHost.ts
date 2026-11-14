/**
 * Shippuden JA face host preference.
 *
 * Suruga-ya CDN scans are shop catalogue crops — prefer them over Mercari /
 * Fril / eBay listing photos (playmat, sleeve, glare) most of the time.
 */

/** Lower rank wins. Unknown hosts lose to known ones. */
const SHIPPUDEN_ART_HOST_RANK: Readonly<Record<string, number>> = {
  suruga: 0,
  ebay: 1,
  mercari: 2,
  fril: 3,
};

export function shippudenArtHostOf(
  art: string | null | undefined,
): string | null {
  const m = /^art\.([a-z0-9-]+)\./i.exec((art ?? "").trim());
  return m?.[1]?.toLowerCase() ?? null;
}

/**
 * Pick the better of two `art.*` filenames for `print_assets.art`.
 * Incoming wins on ties / unknown current.
 */
export function preferShippudenArt(
  current: string | null | undefined,
  incoming: string,
): string {
  const next = incoming.trim();
  if (!next) return (current ?? "").trim() || next;
  const cur = (current ?? "").trim();
  if (!cur) return next;

  const curHost = shippudenArtHostOf(cur);
  const inHost = shippudenArtHostOf(next);
  if (!inHost) return cur;
  if (!curHost) return next;

  const curRank = SHIPPUDEN_ART_HOST_RANK[curHost] ?? 50;
  const inRank = SHIPPUDEN_ART_HOST_RANK[inHost] ?? 50;
  return inRank < curRank ? next : cur;
}
