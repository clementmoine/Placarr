/**
 * Parse Fullset.fr TCG set index HTML (`/{game}/sets`).
 * Public grids expose `data-set-*` — `/api` is robots-Disallow.
 */

export type FullsetGameSlug = "pokemon" | "yugioh" | "magic";

export type FullsetSetRow = {
  fullsetId: string;
  nameFr: string;
  nameEn: string;
  /** Official-ish abbr when present (`BLK`, `MZMU`, `SPM`). */
  ref: string | null;
  releasedAt: string | null;
  path: string | null;
  iconPath: string | null;
  imagePath: string | null;
  setType: string | null;
};

export type FullsetSetsLedger = {
  source: string;
  observed: string;
  game: FullsetGameSlug;
  sets: FullsetSetRow[];
};

export function fullsetSetsIndexUrl(game: FullsetGameSlug): string {
  return `https://fullset.fr/${game}/sets?display=grid&sort=type&order=desc`;
}

function decodeEntities(raw: string): string {
  return raw
    .replace(/&#(\d+);/g, (_, n: string) =>
      String.fromCharCode(Number(n)),
    )
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) =>
      String.fromCharCode(Number.parseInt(n, 16)),
    )
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .trim();
}

function attr(block: string, name: string): string | null {
  const m = new RegExp(`data-${name}="([^"]*)"`, "i").exec(block);
  if (!m?.[1]) return null;
  const v = decodeEntities(m[1]).trim();
  return v || null;
}

/**
 * Fold for EN-name matching.
 * Punctuation / diacritics stripped so « Sword & Shield » ≈ « Sword and Shield ».
 */
export function foldFullsetSetName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeFullsetSetRef(
  ref: string | null | undefined,
): string | null {
  const raw = (ref ?? "").trim().toUpperCase();
  if (!raw) return null;
  const compact = raw.replace(/[^A-Z0-9]/g, "");
  return compact || null;
}

/** Parse a Fullset sets grid HTML into rows (deduped by fullsetId). */
export function parseFullsetSetsHtml(
  html: string,
  game: FullsetGameSlug,
): FullsetSetRow[] {
  const parts = html.split(/(?=data-set-id=")/i);
  const byId = new Map<string, FullsetSetRow>();
  const pathRe = new RegExp(`href="(/${game}/sets/\\d+/[^"]+)"`, "i");
  const iconRe = new RegExp(
    `src="(/assets/media/${game}/sets/icons/[^"]+)"`,
    "i",
  );
  const imageRe = new RegExp(
    `src="(/assets/media/${game}/sets/image_[^"]+)"`,
    "i",
  );

  for (const block of parts) {
    if (!/data-set-id="/i.test(block)) continue;
    const fullsetId = attr(block, "set-id");
    const nameFr = attr(block, "set-name");
    if (!fullsetId || !nameFr) continue;

    const href = pathRe.exec(block);
    const icon = iconRe.exec(block);
    const image = imageRe.exec(block);
    const nameEnAttr = attr(block, "set-name-en");

    const next: FullsetSetRow = {
      fullsetId,
      nameFr,
      nameEn: nameEnAttr ?? nameFr,
      ref: normalizeFullsetSetRef(attr(block, "set-ref")),
      releasedAt: attr(block, "set-date"),
      path: href?.[1] ?? null,
      iconPath: icon?.[1] ?? null,
      imagePath: image?.[1] ?? null,
      setType: attr(block, "set-type"),
    };
    const prev = byId.get(fullsetId);
    if (!prev) {
      byId.set(fullsetId, next);
      continue;
    }
    byId.set(fullsetId, {
      fullsetId,
      nameFr: next.nameFr || prev.nameFr,
      nameEn: next.nameEn || prev.nameEn,
      ref: next.ref ?? prev.ref,
      releasedAt: next.releasedAt ?? prev.releasedAt,
      path: next.path ?? prev.path,
      iconPath: next.iconPath ?? prev.iconPath,
      imagePath: next.imagePath ?? prev.imagePath,
      setType: next.setType ?? prev.setType,
    });
  }

  return [...byId.values()];
}
