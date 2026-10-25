/**
 * Parse HTML narutomarket.com — listing `/fr/cards` + fiches `data-card`.
 *
 * Les aperçus d’illustration (`artwork: true`) doublonnent la galerie Bandai
 * (`preview/g01…g12`) : on les ignore ici.
 */
export type NarutoMarketCard = {
  slug: string;
  name: string;
  /** Printed collector when known (`N-001`, `CP-001`, …). */
  ref: string;
  imagePath: string;
  pagePath: string;
  type: string;
  kind: string;
  artwork: boolean;
  state: string;
  edition: string;
};

export type NarutoMarketIdentity = {
  setCode: string;
  number: string;
  /** Variante d’impression (Yankees / Gen Con / Premium…) — segment printKey. */
  grouping?: string | null;
};

const ORIGIN = "https://narutomarket.com";

/** Refs Bandai → slug de numéro catalogue (`N-001` → `n001`). */
export function normalizeNarutoMarketRef(ref: string): string | null {
  const raw = ref.trim().toUpperCase();
  if (!raw) return null;
  const m = raw.match(/^([A-Z]{1,3})-?(\d{1,4})$/);
  if (!m) return null;
  return `${m[1].toLowerCase()}${m[2].padStart(3, "0")}`;
}

/**
 * Même ref imprimée, plusieurs impressions (Yankees / Gen Con / Premium…).
 * Le numéro catalogue porte le suffixe d’édition pour éviter les collisions.
 */
export function narutoMarketIdentity(
  card: Pick<NarutoMarketCard, "slug" | "ref" | "edition" | "artwork">,
): NarutoMarketIdentity | null {
  if (card.artwork) return null;
  const base = normalizeNarutoMarketRef(card.ref);
  if (!base) return null;

  const slug = card.slug.toLowerCase();
  const edition = card.edition.toLowerCase();

  if (slug.includes("premium-vol-00") || edition.includes("premium")) {
    return { setCode: "premium00", number: base, grouping: "premiumvol00" };
  }
  if (slug.includes("yankees") || edition.includes("yankees")) {
    return { setCode: "promo", number: base, grouping: "yankees" };
  }
  if (slug.includes("event-promo") || edition.includes("event-promo")) {
    return { setCode: "promo", number: base, grouping: "event" };
  }
  if (
    base.startsWith("cp") &&
    (slug.includes("gen-con") || edition.includes("gen con"))
  ) {
    return { setCode: "promo", number: base, grouping: "gencon" };
  }

  return { setCode: "demo", number: base };
}

export function absoluteNarutoMarketUrl(pathOrUrl: string): string {
  const t = pathOrUrl.trim();
  if (!t) return ORIGIN;
  if (/^https?:\/\//i.test(t)) return t;
  return `${ORIGIN}${t.startsWith("/") ? t : `/${t}`}`;
}

/** Strip `?v=` cache-buster for stable face URLs. */
export function narutoMarketFaceUrl(imagePath: string): string {
  const abs = absoluteNarutoMarketUrl(imagePath);
  try {
    const u = new URL(abs);
    u.search = "";
    return u.toString();
  } catch {
    return abs.split("?")[0] ?? abs;
  }
}

function decodeDataCardAttr(raw: string): NarutoMarketCard | null {
  try {
    const json = raw
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">");
    const row = JSON.parse(json) as Record<string, unknown>;
    const slug = typeof row.slug === "string" ? row.slug.trim() : "";
    if (!slug) return null;
    return {
      slug,
      name: typeof row.name === "string" ? row.name.trim() : slug,
      ref: typeof row.ref === "string" ? row.ref.trim() : "",
      imagePath: typeof row.image === "string" ? row.image.trim() : "",
      pagePath: typeof row.url === "string" ? row.url.trim() : `/fr/cards/${slug}`,
      type: typeof row.type === "string" ? row.type.trim() : "",
      kind: typeof row.kind === "string" ? row.kind.trim() : "",
      artwork: row.artwork === true,
      state: typeof row.state === "string" ? row.state.trim() : "",
      edition: typeof row.edition === "string" ? row.edition.trim() : "",
    };
  } catch {
    return null;
  }
}

/** Listing ou fiche — tous les `data-card="…"`. */
export function parseNarutoMarketDataCards(html: string): NarutoMarketCard[] {
  const out: NarutoMarketCard[] = [];
  const seen = new Set<string>();
  const re = /data-card="(\{&quot;[^"]+\})"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const card = decodeDataCardAttr(m[1] ?? "");
    if (!card || seen.has(card.slug)) continue;
    seen.add(card.slug);
    out.push(card);
  }
  return out;
}

/** Slugs via JSON-LD ItemList (fallback si le grid n’expose pas data-card). */
export function parseNarutoMarketListingSlugs(html: string): string[] {
  const fromData = parseNarutoMarketDataCards(html)
    .map((c) => c.slug)
    .filter(Boolean);
  if (fromData.length) return fromData;

  const slugs: string[] = [];
  const seen = new Set<string>();
  const re =
    /https:\/\/narutomarket\.com\/fr\/cards\/([a-z0-9-]+)|href="\/fr\/cards\/([a-z0-9-]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const slug = (m[1] ?? m[2] ?? "").toLowerCase();
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    slugs.push(slug);
  }
  return slugs;
}

export function narutoMarketListingUrl(locale = "fr"): string {
  return `${ORIGIN}/${locale}/cards`;
}

export function narutoMarketDetailUrl(slug: string, locale = "fr"): string {
  return `${ORIGIN}/${locale}/cards/${slug}`;
}
