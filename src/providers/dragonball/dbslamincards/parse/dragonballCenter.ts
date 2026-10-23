/**
 * Parse listing / fiche objet Dragon Ball Center (Edibas Lamincards).
 */
export const DBC_ORIGIN = "https://dragonball.center";

export type DbcSeriesSpec = {
  setCode: string;
  label: string;
  lang: string;
  collectionId: number;
  slug: string;
  listingPath: string;
  expectedCards?: number;
  enabled?: boolean;
  note?: string;
};

export type DbcListingCard = {
  objetoId: string;
  slug: string;
  printed: string;
  number: string;
  /** Parallel DBC : `s` Silver, `g` Gold — sinon base. */
  grouping: string | null;
  rarityLabel: string | null;
  pagePath: string;
  /** Plein format depuis le `visor` de la tuile listing (quand présent). */
  frontPath: string | null;
  backPath: string | null;
};

export type DbcObjectFaces = {
  facePaths: string[];
  /** Premier JPEG objet = recto ; second = verso quand présent. */
  frontPath: string | null;
  backPath: string | null;
};

const OBJETOS_PATH_ONE =
  /^\/files\/module_dbc\/objetos\/\d+\/[a-z0-9]+\.jpe?g$/i;

const OBJETOS_PATH_RE =
  /\/files\/module_dbc\/objetos\/\d+\/[a-z0-9]+\.jpe?g/gi;

/**
 * Tuile FR / riches : `visor(front, 1, gallery, true, objetoId, 'Lamincard N', 'Silver||…', …)`
 * puis `href="/catalogo/objeto/{id}/lamincard-N"`.
 */
const LISTING_TILE_RICH_RE =
  /visor\(\s*'(\/files\/module_dbc\/objetos\/\d+\/[a-z0-9]+\.jpe?g)'\s*,\s*\d+\s*,\s*'([^']*)'\s*,\s*true\s*,\s*(\d+)\s*,\s*'([^']*)'\s*,\s*'([^']*)'[\s\S]{0,400}?href="(\/catalogo\/objeto\/\3\/(lamincard-(\d+)[^"]*))"/gi;

/**
 * Tuile listing courte : `visor(front, 1, gallery, …)` puis lien `lamincard-N`.
 */
const LISTING_TILE_RE =
  /visor\(\s*'(\/files\/module_dbc\/objetos\/\d+\/[a-z0-9]+\.jpe?g)'\s*,\s*\d+\s*,\s*'([^']*)'\s*,[\s\S]{0,200}?href="(\/catalogo\/objeto\/(\d+)\/(lamincard-(\d+)[^"]*))"/gi;

const LISTING_CARD_RE =
  /href="(\/catalogo\/objeto\/(\d+)\/(lamincard-(\d+)[^"]*))"/gi;

const VISOR_CALL_RE =
  /visor\(\s*'(\/files\/module_dbc\/objetos\/\d+\/[a-z0-9]+\.jpe?g)'\s*,\s*\d+\s*,\s*'([^']*)'\s*\)/gi;

const VISOR_SINGLE_RE =
  /visor\(\s*'(\/files\/module_dbc\/objetos\/\d+\/[a-z0-9]+\.jpe?g)'/gi;

function galleryPaths(first: string, gallery: string): string[] {
  const ordered: string[] = [];
  const seen = new Set<string>();
  const push = (path: string) => {
    if (!path || seen.has(path) || !OBJETOS_PATH_ONE.test(path)) return;
    seen.add(path);
    ordered.push(path);
  };
  push(first);
  for (const part of gallery.split("|")) push(part.trim());
  return ordered;
}

/** `Silver||777777||S|||` → `{ grouping: "s", label: "Silver" }`. */
export function parseDbcRarityTag(raw: string): {
  grouping: string | null;
  label: string | null;
} {
  const label = raw.split("||")[0]?.trim() || "";
  if (!label) return { grouping: null, label: null };
  const lower = label.toLowerCase();
  if (lower === "silver" || lower === "argento" || lower === "s") {
    return { grouping: "s", label: "Silver" };
  }
  if (lower === "gold" || lower === "or" || lower === "oro" || lower === "g") {
    return { grouping: "g", label: "Gold" };
  }
  const slug = lower.replace(/[^a-z0-9]+/g, "").slice(0, 8);
  return { grouping: slug || null, label };
}

function cardKey(number: string, grouping: string | null): string {
  return grouping ? `${number}:${grouping}` : number;
}

export function parseDbcListingCards(html: string): DbcListingCard[] {
  const seen = new Map<string, DbcListingCard>();
  const seenObjetos = new Set<string>();

  for (const match of html.matchAll(LISTING_TILE_RICH_RE)) {
    const front = match[1]!;
    const gallery = match[2]!;
    const objetoId = match[3]!;
    const rarityTag = match[5]!;
    const pagePath = match[6]!;
    const slug = match[7]!;
    const printed = match[8]!;
    const n = Number.parseInt(printed, 10);
    if (!Number.isFinite(n) || n < 1) continue;
    const number = String(n).padStart(4, "0");
    const { grouping, label } = parseDbcRarityTag(rarityTag);
    const key = cardKey(number, grouping);
    if (seen.has(key)) continue;
    const paths = galleryPaths(front, gallery);
    seenObjetos.add(objetoId);
    seen.set(key, {
      objetoId,
      slug,
      printed: String(n),
      number,
      grouping,
      rarityLabel: label,
      pagePath,
      frontPath: paths[0] ?? null,
      backPath: paths[1] ?? null,
    });
  }

  for (const match of html.matchAll(LISTING_TILE_RE)) {
    const front = match[1]!;
    const gallery = match[2]!;
    const pagePath = match[3]!;
    const objetoId = match[4]!;
    const slug = match[5]!;
    const printed = match[6]!;
    if (seenObjetos.has(objetoId)) continue;
    const n = Number.parseInt(printed, 10);
    if (!Number.isFinite(n) || n < 1) continue;
    const number = String(n).padStart(4, "0");
    const key = cardKey(number, null);
    if (seen.has(key)) continue;
    const paths = galleryPaths(front, gallery);
    seenObjetos.add(objetoId);
    seen.set(key, {
      objetoId,
      slug,
      printed: String(n),
      number,
      grouping: null,
      rarityLabel: null,
      pagePath,
      frontPath: paths[0] ?? null,
      backPath: paths[1] ?? null,
    });
  }

  // Secours : liens seuls (sans tuile visor) — faces à récupérer sur la fiche.
  for (const match of html.matchAll(LISTING_CARD_RE)) {
    const pagePath = match[1]!;
    const objetoId = match[2]!;
    const slug = match[3]!;
    const printed = match[4]!;
    if (seenObjetos.has(objetoId)) continue;
    const n = Number.parseInt(printed, 10);
    if (!Number.isFinite(n) || n < 1) continue;
    const number = String(n).padStart(4, "0");
    const key = cardKey(number, null);
    if (seen.has(key)) continue;
    seenObjetos.add(objetoId);
    seen.set(key, {
      objetoId,
      slug,
      printed: String(n),
      number,
      grouping: null,
      rarityLabel: null,
      pagePath,
      frontPath: null,
      backPath: null,
    });
  }

  return [...seen.values()].sort((a, b) => {
    const byNum =
      Number.parseInt(a.printed, 10) - Number.parseInt(b.printed, 10);
    if (byNum !== 0) return byNum;
    return (a.grouping ?? "").localeCompare(b.grouping ?? "");
  });
}

export function parseDbcObjectFaces(html: string): DbcObjectFaces {
  const ordered: string[] = [];
  const seen = new Set<string>();

  const push = (path: string) => {
    if (!path || seen.has(path)) return;
    seen.add(path);
    ordered.push(path);
  };

  for (const match of html.matchAll(VISOR_CALL_RE)) {
    for (const path of galleryPaths(match[1]!, match[2]!)) push(path);
  }

  if (!ordered.length) {
    for (const match of html.matchAll(VISOR_SINGLE_RE)) {
      push(match[1]!);
    }
  }
  if (!ordered.length) {
    for (const path of html.matchAll(OBJETOS_PATH_RE)) {
      push(path[0]!);
    }
  }

  return {
    facePaths: ordered,
    frontPath: ordered[0] ?? null,
    backPath: ordered[1] ?? null,
  };
}

export function dbcAbsoluteUrl(pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  return `${DBC_ORIGIN}${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`;
}

/** Dossier disque : `0008` ou `0008-s`. */
export function dbcCardFolderName(
  number: string,
  grouping: string | null | undefined,
): string {
  const n = number.trim().toLowerCase();
  const g = grouping?.trim().toLowerCase();
  return g ? `${n}-${g}` : n;
}
