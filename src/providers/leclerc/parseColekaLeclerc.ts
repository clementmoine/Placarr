/**
 * Listing Coleka — opérations collector Leclerc (supermarché).
 * Pages `?p=` : parfois OK via Flare (cache HIT). `?nbpp=240` = toujours
 * uncached → Turnstile — ne pas l’utiliser pour le harvest auto.
 * Complément CDN : `curated/sources/coleka-cdn-faces.json` (index Bing → thumbs.coleka.com).
 */
export const COLEKA_LECLERC_ORIGIN = "https://www.coleka.com";
export const COLEKA_LECLERC_LANG = "fr";
export const COLEKA_LECLERC_SOURCE_ID = "coleka";
/** Max listing pages to try (1 = no `?p=`, then 2…). */
export const COLEKA_LECLERC_MAX_LISTING_PAGES = 3;

export type ColekaLeclercListing = {
  setCode: string;
  listingPath: string;
};

/** Rubriques Coleka (marvel21 FR : `revele-ton-pouvoir_r22334`). */
export const COLEKA_LECLERC_LISTINGS: readonly ColekaLeclercListing[] = [
  {
    setCode: "marvel21",
    listingPath:
      "/fr/cartes-de-collection/cartes-de-supermarche/revele-ton-pouvoir_r22334",
  },
  {
    setCode: "marvel22",
    listingPath:
      "/fr/cartes-de-collection/cartes-de-supermarche/cartes-marvel-pars-en-mission-leclerc_r28635",
  },
  {
    setCode: "marvel23",
    listingPath:
      "/fr/cartes-de-collection/cartes-de-supermarche/cartes-marvel-defie-tes-heros_r35559",
  },
  {
    setCode: "marvel24",
    listingPath:
      "/fr/cartes-de-collection/cartes-de-supermarche/explore-l-univers-marvel-avec-groot-leclerc_r41370",
  },
  {
    setCode: "disney25",
    listingPath:
      "/fr/cartes-de-collection/cartes-de-supermarche/decouvre-la-magie-de-disney-leclerc_r46879",
  },
] as const;

export type ColekaLeclercCard = {
  setCode: string;
  number: string;
  name: string;
  kind: "card" | "fixeez";
  thumbUrl: string;
  faceUrl: string;
  pageUrl: string;
};

export type ColekaLeclercParse = {
  cards: ColekaLeclercCard[];
  rejected: { name: string; reason: string }[];
};

function decodeEntities(raw: string): string {
  return raw
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) =>
      String.fromCharCode(Number.parseInt(n, 16)),
    )
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Thumb `_250x250.webp` → full CDN face. */
export function colekaLeclercFaceUrl(thumbUrl: string): string {
  return thumbUrl.replace(
    /_\d+x\d+(?=\.(?:webp|jpe?g|png|gif)(?:\?|$))/i,
    "",
  );
}

/** Listing URL for page index (1-based). Page 1 has no `?p=`. */
export function colekaLeclercListingUrl(
  listing: ColekaLeclercListing,
  page = 1,
): string {
  const base = `${COLEKA_LECLERC_ORIGIN}${listing.listingPath}`;
  return page <= 1 ? base : `${base}?p=${page}`;
}

const CDN_SKIP =
  /album|pochette|bo[iî]te|bandeau|starter|display|carnet|\blot\b/i;

/**
 * Infer print number from a `thumbs.coleka.com/.../file.webp` basename.
 * Used for CDN ledgers (Bing index) when listing HTML is walled.
 */
export function colekaLeclercNumberFromCdnPath(
  faceUrlOrPath: string,
): string | null {
  const path = faceUrlOrPath.split("?")[0]?.split("/").pop() ?? "";
  if (!path || CDN_SKIP.test(path)) return null;
  if (/fixeez/i.test(path)) {
    const fm = path.match(/[-_]f(\d{1,2})(?:[-_.]|$)/i);
    return fm ? `f${String(Number(fm[1])).padStart(2, "0")}` : null;
  }
  const carteN = path.match(/carte-n[-_]?(\d{1,3})[-_](\d{3})/i);
  if (carteN) return String(Number(carteN[2])).padStart(3, "0");
  const carteNShort = path.match(/carte-n[-_]?(\d{1,3})(?:[-_.]|$)/i);
  if (carteNShort) return String(Number(carteNShort[1])).padStart(3, "0");
  const before001 = path.match(/[-_](\d{3})[-_]001\.(?:webp|jpe?g|png)$/i);
  if (before001) {
    const n = Number(before001[1]);
    if (n >= 1 && n <= 200) return String(n).padStart(3, "0");
  }
  const trailing3 = path.match(/[-_](\d{3})\.(?:webp|jpe?g|png)$/i);
  if (trailing3) {
    const n = Number(trailing3[1]);
    if (n >= 1 && n <= 200) return String(n).padStart(3, "0");
  }
  const trailing2 = path.match(/[-_](\d{1,2})\.(?:webp|jpe?g|png)$/i);
  if (trailing2) {
    const n = Number(trailing2[1]);
    if (n >= 1 && n <= 200) return String(n).padStart(3, "0");
  }
  return null;
}

const SKIP_TITLE =
  /^(album|pochette|bo[iî]te|display|starter|lot\b)/i;

function parseFixeezNumber(
  title: string,
  href: string,
  thumbUrl: string,
): string | null {
  const fromHref =
    href.match(/[-_]f(\d{1,2})(?:[-_./?]|$)/i) ||
    thumbUrl.match(/[-_]f(\d{1,2})(?:[-_./?]|$)/i) ||
    title.match(/\bF(\d{1,2})\b/i);
  if (!fromHref) return null;
  return `f${String(Number(fromHref[1])).padStart(2, "0")}`;
}

/** Fold Fixeez / checklist labels for name → `fNN` matching (Coleka sans n° F). */
export function foldLeclercFixeezKey(raw: string): string {
  const stripped = raw
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/^fixeez\s*[—\-:]?\s*/i, "")
    .toLowerCase();
  return stripped
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export type LeclercFixeezLookupRow = {
  number: string;
  name: string;
  aka?: string[];
};

/**
 * Map folded Fixeez label → `fNN`. Ambiguous folds keep the lowest number
 * (album order); distinct `aka` disambiguate (e.g. Spidey → f13).
 */
export function buildLeclercFixeezLookup(
  rows: readonly LeclercFixeezLookupRow[],
): Map<string, string> {
  const buckets = new Map<string, string[]>();
  for (const row of rows) {
    const number = row.number.trim().toLowerCase();
    if (!/^f\d{1,2}$/.test(number)) continue;
    const padded = `f${String(Number(number.slice(1))).padStart(2, "0")}`;
    const keys = [foldLeclercFixeezKey(row.name)];
    for (const aka of row.aka ?? []) {
      keys.push(foldLeclercFixeezKey(aka));
    }
    for (const key of keys) {
      if (!key) continue;
      const list = buckets.get(key) ?? [];
      if (!list.includes(padded)) list.push(padded);
      buckets.set(key, list);
    }
  }
  const out = new Map<string, string>();
  for (const [key, nums] of buckets) {
    nums.sort();
    out.set(key, nums[0]!);
  }
  return out;
}

/**
 * Resolve Fixeez number from Coleka title / CDN path, then checklist name lookup.
 */
export function resolveLeclercFixeezNumber(
  name: string,
  href: string,
  thumbUrl: string,
  lookup?: ReadonlyMap<string, string>,
): string | null {
  const fromPath = parseFixeezNumber(name, href, thumbUrl);
  if (fromPath) return fromPath;
  if (!lookup?.size) return null;

  const key = foldLeclercFixeezKey(name);
  if (!key) return null;
  const exact = lookup.get(key);
  if (exact) return exact;

  const containment = [...lookup.entries()].filter(
    ([k]) => k.includes(key) || key.includes(k),
  );
  const nums = [...new Set(containment.map(([, n]) => n))];
  return nums.length === 1 ? nums[0]! : null;
}

export type ParseColekaLeclercOptions = {
  /** Checklist-backed Fixeez name → `fNN` when Coleka omits F numbers. */
  fixeezLookup?: ReadonlyMap<string, string>;
};

/**
 * Parse a Coleka rubrique listing HTML for one Leclerc set.
 * Cards: `Ref. NNN` + product title. Fixeez: Fnn in path/title, else checklist name.
 */
export function parseColekaLeclercListing(
  html: string,
  setCode: string,
  opts: ParseColekaLeclercOptions = {},
): ColekaLeclercParse {
  const cards: ColekaLeclercCard[] = [];
  const rejected: ColekaLeclercParse["rejected"] = [];
  const seen = new Set<string>();
  const lookup = opts.fixeezLookup;

  for (const m of html.matchAll(
    /<li class="[^"]*\bcol-md-4\b[^"]*"[\s\S]*?<\/li>/gi,
  )) {
    const block = m[0] ?? "";
    const titleMatch = block.match(/<h3 class="product-title">([^<]+)<\/h3>/i);
    const imgMatch = block.match(
      /src="(https:\/\/thumbs\.coleka\.com\/media\/item\/[^"]+)"/i,
    );
    const hrefMatch = block.match(/href="([^"]+_i\d+)"/i);
    if (!titleMatch || !imgMatch) continue;

    const name = decodeEntities(titleMatch[1] ?? "");
    const thumbUrl = imgMatch[1] ?? "";
    const href = hrefMatch?.[1] ?? "";
    if (!name || !thumbUrl) continue;
    if (SKIP_TITLE.test(name)) {
      rejected.push({ name, reason: "non-card" });
      continue;
    }

    const isFixeez = /^fixeez\b/i.test(name);
    let number: string | null = null;
    if (isFixeez) {
      number = resolveLeclercFixeezNumber(name, href, thumbUrl, lookup);
      if (!number) {
        rejected.push({ name, reason: "fixeez-no-number" });
        continue;
      }
    } else {
      const ref = block.match(/Ref\.\s*(\d{1,3})\b/i);
      if (!ref) {
        rejected.push({ name, reason: "no-ref" });
        continue;
      }
      const n = Number(ref[1]);
      if (!Number.isFinite(n) || n < 1 || n > 200) {
        rejected.push({ name, reason: "bad-ref" });
        continue;
      }
      number = String(n).padStart(3, "0");
    }

    if (seen.has(number)) continue;
    seen.add(number);

    const pageUrl = href.startsWith("http")
      ? href
      : `${COLEKA_LECLERC_ORIGIN}${href}`;
    cards.push({
      setCode,
      number,
      name: isFixeez ? name.replace(/^Fixeez\s+/i, "").trim() || name : name,
      kind: isFixeez ? "fixeez" : "card",
      thumbUrl,
      faceUrl: colekaLeclercFaceUrl(thumbUrl),
      pageUrl,
    });
  }

  cards.sort((a, b) => a.number.localeCompare(b.number));
  return { cards, rejected };
}

export function colekaLeclercListingForSet(
  setCode: string,
): ColekaLeclercListing | null {
  const code = setCode.trim().toLowerCase();
  return COLEKA_LECLERC_LISTINGS.find((row) => row.setCode === code) ?? null;
}
