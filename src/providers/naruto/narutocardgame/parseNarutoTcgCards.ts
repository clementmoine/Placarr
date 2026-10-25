/**
 * Parse HTML narutotcgcards.com/cards — listing + fiche (og:image).
 *
 * Identité alignée sur narutomarket (`demo` / `promo` / `premium00` / `preview`)
 * pour fusionner les faces, pas pour inventer un second corpus.
 */
export type NarutoTcgCardsEntry = {
  slug: string;
  name: string;
  facePath: string;
  pagePath: string;
};

export type NarutoTcgCardsIdentity = {
  setCode: string;
  number: string;
  grouping?: string | null;
};

const ORIGIN = "https://narutotcgcards.com";

/** Aperçus gallery Bandai — ordre card01…card12. */
const PREVIEW_SLUG_TO_GALLERY: Readonly<Record<string, string>> = {
  "preview-reveals-orochimaru": "g01",
  "preview-reveals-boruto-uzumaki": "g02",
  "preview-reveals-sasuke-uchiha-special": "g03",
  "preview-reveals-naruto-uzumaki-special-hidden-leaf-village": "g04",
  "preview-reveals-jiraiya": "g05",
  "preview-reveals-itachi-uchiha": "g06",
  "preview-reveals-sasuke-uchiha-the-taka": "g07",
  "preview-reveals-naruto-uzumaki-wind": "g08",
  "preview-reveals-sakura-haruno": "g09",
  "preview-reveals-tsunade": "g10",
  "preview-reveals-sasuke-uchiha-uchiha-clan": "g11",
  "preview-reveals-naruto-uzumaki-jinchuriki": "g12",
};

/**
 * Decks démo sans n° dans le slug — refs attestées côté narutomarket
 * (Orochimaru = N-017, pas le fichier K-001.webp mal nommé du hub).
 */
const DEMO_SLUG_TO_REF: Readonly<Record<string, string>> = {
  "demo-decks-choji-akimichi": "n002",
  "demo-decks-naruto-uzumaki": "n003",
  "demo-decks-orochimaru": "n017",
  "demo-decks-hinata-hyuga": "n018",
  "demo-decks-sakura-haruno": "n020",
};

const SKIP_SLUGS = new Set(["accessories", "sets"]);

export function absoluteNarutoTcgCardsUrl(pathOrUrl: string): string {
  const t = pathOrUrl.trim();
  if (!t) return ORIGIN;
  if (/^https?:\/\//i.test(t)) return t;
  return `${ORIGIN}${t.startsWith("/") ? t : `/${t}`}`;
}

/** Prefers full-size `/images/cards/X.webp` over `-w160` / `-w320` / `-w640`. */
export function pickNarutoTcgCardsFacePath(
  paths: readonly string[],
): string | null {
  const full = paths.filter(
    (p) =>
      /\/images\/cards\//i.test(p) &&
      /\.webp$/i.test(p) &&
      !/-w(?:160|320|640)\.webp$/i.test(p),
  );
  if (full[0]) return full[0];
  return paths.find((p) => /\/images\/cards\//i.test(p)) ?? null;
}

export function narutoTcgCardsListingUrl(): string {
  return `${ORIGIN}/cards`;
}

export function narutoTcgCardsDetailUrl(slug: string): string {
  return `${ORIGIN}/cards/${slug}`;
}

export function parseNarutoTcgCardsListingSlugs(html: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const re = /href="\/cards\/([A-Za-z0-9._-]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const slug = (m[1] ?? "").trim();
    if (!slug || SKIP_SLUGS.has(slug) || seen.has(slug)) continue;
    seen.add(slug);
    out.push(slug);
  }
  return out;
}

export function parseNarutoTcgCardsDetail(
  html: string,
  slug: string,
): NarutoTcgCardsEntry | null {
  const h1 = html.match(/<h1[^>]*>([^<]+)<\/h1>/i)?.[1]?.trim();
  const title = html.match(/<title>([^<]+)<\/title>/i)?.[1]?.trim() ?? "";
  const name =
    h1 ||
    title.replace(/\s*[—|].*$/, "").trim() ||
    slug;
  const og = html.match(
    /property="og:image"\s+content="([^"]+)"/i,
  )?.[1];
  const imgPaths = [
    ...(og ? [og.replace(ORIGIN, "")] : []),
    ...Array.from(html.matchAll(/\/images\/cards\/[A-Za-z0-9._-]+\.webp/g)).map(
      (x) => x[0],
    ),
  ];
  const facePath = pickNarutoTcgCardsFacePath(imgPaths);
  if (!facePath) return null;
  return {
    slug,
    name,
    facePath: facePath.startsWith("http")
      ? new URL(facePath).pathname
      : facePath,
    pagePath: `/cards/${slug}`,
  };
}

function normalizePrintedRef(raw: string): string | null {
  const m = raw.trim().toUpperCase().match(/^([A-Z]{1,3})-?(\d{1,4})$/);
  if (!m) return null;
  return `${m[1]!.toLowerCase()}${m[2]!.padStart(3, "0")}`;
}

export function narutoTcgCardsIdentity(
  slug: string,
): NarutoTcgCardsIdentity | null {
  const s = slug.trim().toLowerCase();
  if (!s || SKIP_SLUGS.has(s)) return null;

  const preview = PREVIEW_SLUG_TO_GALLERY[s];
  if (preview) return { setCode: "preview", number: preview };

  if (s.startsWith("premium-card-collection-vol-00-")) {
    const m = s.match(/\b([cs])-(\d{3})\b/);
    if (!m) return null;
    const number = normalizePrintedRef(`${m[1]}-${m[2]}`);
    if (!number) return null;
    return { setCode: "premium00", number, grouping: "premiumvol00" };
  }

  if (s === "cp-001" || s === "cp-001-chakra-card") {
    return { setCode: "promo", number: "cp001", grouping: "event" };
  }
  if (s.includes("yankee")) {
    return { setCode: "promo", number: "cp001", grouping: "yankees" };
  }
  if (s.includes("gencon") || s.includes("gen-con")) {
    if (s.startsWith("cp-001") || s.includes("chakra-card")) {
      return { setCode: "promo", number: "cp001", grouping: "gencon" };
    }
  }

  const numbered = s.match(/\b([ncks])-(\d{3})\b/);
  if (numbered) {
    const number = normalizePrintedRef(`${numbered[1]}-${numbered[2]}`);
    if (!number) return null;
    return { setCode: "demo", number };
  }

  const mapped = DEMO_SLUG_TO_REF[s];
  if (mapped) return { setCode: "demo", number: mapped };

  return null;
}
