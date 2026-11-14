/**
 * Public citation URLs — preuve ouvrable, pas un hostname.
 *
 * A citation must open the **specific** public resource (product fiche, listing,
 * article, YouTube watch, forum post…). Site roots / marketing homepages are
 * attribution chips only — never a substitute for the proof.
 *
 * When the live page is gone but archived, stamp a Wayback Machine URL that
 * wraps the original deep link (not archive.org's own homepage).
 */

const IMAGE_EXTENSION_RE = /\.(jpe?g|png|gif|webp|avif|bmp|svg)(\?|$)/i;

/** Single-segment paths that are still “home / locale hub”, not a document. */
const SHALLOW_SEGMENTS = new Set([
  "en",
  "fr",
  "de",
  "es",
  "it",
  "ja",
  "jp",
  "pt",
  "nl",
  "home",
  "welcome",
  "index",
  "accueil",
  "main",
  "about",
  "contact",
  "login",
  "search",
  "2v2",
]);

/**
 * Final path segment that means a list / API hub, not a card or article.
 * `/fr/galerie`, `/fr/naruto-mythos/cards`, `/api/cards` — not `/cards/ks-001`.
 */
const HUB_TAIL_SEGMENTS = new Set([
  "galerie",
  "gallery",
  "cards",
  "cardlist",
  "cards-list",
  "catalog",
  "catalogue",
  "browse",
  "search",
  "products",
  "api",
]);

const WAYBACK_HOST_RE = /^(?:www\.)?web\.archive\.org$/i;

export function isWaybackHost(hostname: string): boolean {
  return WAYBACK_HOST_RE.test(hostname.trim());
}

/**
 * Parse `https://web.archive.org/web/<ts>/<original>` (optional `im_` / `id_` /
 * `if_` modifiers on the timestamp).
 */
export function unwrapWaybackUrl(
  url: string,
): { timestamp: string; originalUrl: string } | null {
  try {
    const parsed = new URL(url.trim());
    if (!isWaybackHost(parsed.hostname)) return null;
    const match = parsed.pathname.match(
      /^\/web\/(\d{8,14})(?:[a-z_]+)?\/(.+)$/i,
    );
    if (!match) return null;
    const original = match[2]!;
    const originalUrl = /^https?:\/\//i.test(original)
      ? original
      : `https://${original}`;
    return { timestamp: match[1]!, originalUrl };
  } catch {
    return null;
  }
}

/** Build a Wayback citation that opens the archived deep page. */
export function waybackPublicCitationUrl(
  timestamp: string,
  originalUrl: string,
): string {
  const ts = timestamp.replace(/\D/g, "");
  const original = originalUrl.trim();
  if (!ts || !/^https?:\/\//i.test(original)) {
    throw new Error("waybackPublicCitationUrl requires timestamp + http(s) URL");
  }
  return `https://web.archive.org/web/${ts}/${original}`;
}

/**
 * True when the URL is only a site root or shallow hub (locale / welcome),
 * not a specific document the collector can verify.
 */
export function isSiteRootOrShallowCitationUrl(url: string): boolean {
  try {
    const parsed = new URL(url.trim());
    const path = parsed.pathname.replace(/\/+$/, "") || "";
    if (!path) return true;
    const segments = path.split("/").filter(Boolean);
    if (segments.length === 1) {
      const only = segments[0]!.toLowerCase();
      if (SHALLOW_SEGMENTS.has(only)) return true;
    }
    // JSON/API endpoints are not collector-facing proofs.
    if (segments.some((seg) => seg.toLowerCase() === "api")) return true;
    const last = segments[segments.length - 1]!.toLowerCase();
    if (HUB_TAIL_SEGMENTS.has(last)) return true;
    return false;
  } catch {
    return true;
  }
}

/**
 * True when a click should open a **verifiable public document** (or Wayback
 * of one). Rejects bare origins, shallow hubs, and image CDN paths.
 */
export function isOpenablePublicCitationUrl(url: string): boolean {
  const trimmed = url?.trim();
  if (!trimmed || !/^https?:\/\//i.test(trimmed)) return false;
  try {
    const parsed = new URL(trimmed);
    if (IMAGE_EXTENSION_RE.test(parsed.pathname)) return false;

    const wayback = unwrapWaybackUrl(trimmed);
    if (wayback) {
      return isOpenablePublicCitationUrl(wayback.originalUrl);
    }

    if (isSiteRootOrShallowCitationUrl(trimmed)) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Keep only openable public citations. Homepage / shallow / invalid → `null`
 * (prefer no URL over a lying homepage stamp).
 */
export function sanitizePublicCitationUrl(
  url: string | null | undefined,
): string | null {
  const trimmed = url?.trim() || "";
  if (!trimmed) return null;
  return isOpenablePublicCitationUrl(trimmed) ? trimmed : null;
}
