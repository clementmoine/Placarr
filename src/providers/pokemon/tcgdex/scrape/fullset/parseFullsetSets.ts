/**
 * Parse Fullset.fr Pokémon set index HTML (`/pokemon/sets`).
 * Public grid pages expose `data-set-*` attrs — no private `/api`.
 */

export type FullsetPokemonSetRow = {
  fullsetId: string;
  nameFr: string;
  nameEn: string;
  /** Official-ish abbr when present (`BLK`, `M24`). */
  ref: string | null;
  releasedAt: string | null;
  path: string | null;
  iconPath: string | null;
  imagePath: string | null;
  setType: string | null;
};

export type FullsetPokemonSetsLedger = {
  source: string;
  observed: string;
  sets: FullsetPokemonSetRow[];
};

const SETS_INDEX_URL =
  "https://fullset.fr/pokemon/sets?display=grid&sort=type&order=desc";

export function fullsetPokemonSetsIndexUrl(): string {
  return SETS_INDEX_URL;
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
 * Fold for EN-name matching against TCGdex `sets.name`.
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

export function normalizeFullsetSetRef(ref: string | null | undefined): string | null {
  const raw = (ref ?? "").trim().toUpperCase();
  if (!raw) return null;
  const compact = raw.replace(/[^A-Z0-9]/g, "");
  return compact || null;
}

/** Parse the Pokémon sets grid HTML into rows (deduped by fullsetId). */
export function parseFullsetPokemonSetsHtml(html: string): FullsetPokemonSetRow[] {
  const parts = html.split(/(?=data-set-id=")/i);
  const byId = new Map<string, FullsetPokemonSetRow>();

  for (const block of parts) {
    if (!/data-set-id="/i.test(block)) continue;
    const fullsetId = attr(block, "set-id");
    const nameFr = attr(block, "set-name");
    if (!fullsetId || !nameFr) continue;

    const href = /href="(\/pokemon\/sets\/\d+\/[^"]+)"/i.exec(block);
    const icon = /src="(\/assets\/media\/pokemon\/sets\/icons\/[^"]+)"/i.exec(
      block,
    );
    const image = /src="(\/assets\/media\/pokemon\/sets\/image_[^"]+)"/i.exec(
      block,
    );

    const next: FullsetPokemonSetRow = {
      fullsetId,
      nameFr,
      nameEn: attr(block, "set-name-en") ?? nameFr,
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
    // Prefer non-null fields when the same id appears twice in the grid.
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
