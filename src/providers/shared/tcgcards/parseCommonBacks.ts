/**
 * Discover category / pack sleeves from TCG Cards list HTML.
 *
 * There is no client-side type→back map: Symfony sets each tile's lazyload
 * `src` to `…/cards/common/back-{segment}.webp` (One Piece) or
 * `…/cards/original/back.webp` (most other hosts). We observe those URLs,
 * then optionally probe the CDN for type-filter labels that never appear on
 * the default page (DON!!, Stage, …).
 */
import type { TcgCardsSite } from "./sites";

export type ObservedTcgCardsBack = {
  url: string;
  kind: "common" | "original";
  /**
   * CDN segment after `back-` (e.g. `leader`, `don!!`).
   * `null` for `cards/original/back.webp`.
   */
  segment: string | null;
};

const COMMON_BACK_RE =
  /https?:\/\/static\.[^/"'\s]+\/cards\/common\/back-([^/"'?\s]+)\.webp/gi;
const ORIGINAL_BACK_RE =
  /https?:\/\/static\.[^/"'\s]+\/cards\/original\/back\.webp/gi;
const TYPE_LABEL_RE =
  /<label[^>]*\bfor="card_filter_typesData_values_\d+"[^>]*>([^<]+)<\/label>/gi;

/** `https://www.opecards.fr` → `https://static.opecards.fr`. */
export function tcgCardsStaticOrigin(siteOrigin: string): string {
  const u = new URL(siteOrigin);
  const host = u.hostname.replace(/^www\./, "");
  return `${u.protocol}//static.${host}`;
}

/**
 * Local stamp / filename slug: keep `[a-z0-9-]` only (`don!!` → `don`).
 */
export function localBackSlugFromCdnSegment(segment: string): string {
  const raw = segment
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return raw;
}

/** Slugify a type filter label for CDN probe (`DON!!` → `don!!`). */
export function slugifyTcgCardsTypeLabel(label: string): string {
  return label
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9!]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function parseTcgCardsBackUrls(html: string): ObservedTcgCardsBack[] {
  const byUrl = new Map<string, ObservedTcgCardsBack>();

  for (const match of html.matchAll(COMMON_BACK_RE)) {
    const url = match[0];
    const segment = decodeURIComponent(match[1] ?? "");
    if (!segment) continue;
    byUrl.set(url, { url, kind: "common", segment });
  }
  for (const match of html.matchAll(ORIGINAL_BACK_RE)) {
    const url = match[0];
    byUrl.set(url, { url, kind: "original", segment: null });
  }

  return [...byUrl.values()];
}

export function parseTcgCardsTypeFilterLabels(html: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const match of html.matchAll(TYPE_LABEL_RE)) {
    const label = (match[1] ?? "").replace(/\s+/g, " ").trim();
    if (!label || seen.has(label)) continue;
    seen.add(label);
    out.push(label);
  }
  return out;
}

/**
 * Card-list paths to fetch for observation (FR/EN/JA lists when published).
 */
export function tcgCardsCardListPaths(site: TcgCardsSite): string[] {
  const paths = new Set<string>(["/cards"]);
  if (site.lists) {
    for (const path of Object.values(site.lists)) {
      paths.add(path.startsWith("/") ? path : `/${path}`);
    }
  } else {
    // Shared Symfony routes on OP / Lorcana / … even when not in site.lists.
    for (const suffix of [
      "francaises",
      "anglaises",
      "japonaises",
    ] as const) {
      paths.add(`/cards/liste-cartes-${suffix}`);
    }
  }
  return [...paths];
}

/**
 * CDN URLs to probe from a type label (label slug + local slug if different).
 */
export function tcgCardsProbeUrlsForTypeLabel(
  staticOrigin: string,
  label: string,
): string[] {
  const base = staticOrigin.replace(/\/$/, "");
  const segment = slugifyTcgCardsTypeLabel(label);
  if (!segment) return [];
  const urls = new Set<string>([
    `${base}/cards/common/back-${segment}.webp`,
  ]);
  const local = localBackSlugFromCdnSegment(segment);
  if (local && local !== segment) {
    urls.add(`${base}/cards/common/back-${local}.webp`);
  }
  return [...urls];
}

export function tcgCardsOriginalBackUrl(staticOrigin: string): string {
  return `${staticOrigin.replace(/\/$/, "")}/cards/original/back.webp`;
}

/**
 * Prefer pack default: original sleeve, else `character`, else first common.
 */
export function pickDefaultBackObservation(
  observed: readonly ObservedTcgCardsBack[],
): ObservedTcgCardsBack | null {
  const original = observed.find((o) => o.kind === "original");
  if (original) return original;
  const character = observed.find(
    (o) => o.kind === "common" && o.segment?.toLowerCase() === "character",
  );
  if (character) return character;
  return observed.find((o) => o.kind === "common") ?? null;
}
