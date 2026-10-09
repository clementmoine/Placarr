/**
 * Shared `print_assets` core — art / back — across TCG packs.
 *
 * Packs historically used four shapes (`art`/`back`, `image_url`/`back_url`,
 * plus pack-specific columns). Readers normalize onto this core; pack-only
 * columns (Lorcana varnish, Naruto wayback, Pokémon foil) stay pack-local.
 *
 * @see docs/card_pack_contract.md §2
 */

function asText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Core face columns every card pack can expose. */
export type PrintAssetsCore = {
  printKey: string;
  lang: string;
  art: string | null;
  back: string | null;
};

/**
 * Map a raw sqlite / ingest row onto the shared art/back core.
 *
 * Accepts both core names and legacy DBS aliases (`image_url`, `back_url`).
 */
export function normalizePrintAssetColumns(
  row: Record<string, unknown>,
): Pick<PrintAssetsCore, "art" | "back"> {
  return {
    art:
      asText(row.art) ??
      asText(row.art_url) ??
      asText(row.artUrl) ??
      asText(row.image_url) ??
      asText(row.imageUrl) ??
      null,
    back:
      asText(row.back) ??
      asText(row.back_url) ??
      asText(row.backUrl) ??
      null,
  };
}

/** Column names present on `print_assets` for one open db. */
export function printAssetsColumnNames(
  db: { prepare: (sql: string) => { all: () => unknown[] } },
): Set<string> {
  try {
    const rows = db.prepare(`PRAGMA table_info(print_assets)`).all() as {
      name?: string;
    }[];
    return new Set(
      rows
        .map((row) => (typeof row.name === "string" ? row.name : ""))
        .filter(Boolean),
    );
  } catch {
    return new Set();
  }
}

/**
 * SQL expression for the face URL, preferring core `art` then legacy
 * `image_url`. Falls back to whichever column the table actually has.
 */
export function printAssetsArtSql(
  columns: ReadonlySet<string>,
  tableAlias = "a",
): string {
  const hasArt = columns.has("art");
  const hasImage = columns.has("image_url");
  if (hasArt && hasImage) {
    return `COALESCE(NULLIF(TRIM(${tableAlias}.art), ''), NULLIF(TRIM(${tableAlias}.image_url), ''))`;
  }
  if (hasArt) return `${tableAlias}.art`;
  if (hasImage) return `${tableAlias}.image_url`;
  return "NULL";
}

/**
 * SQL expression for the back URL, preferring core `back` then legacy
 * `back_url`.
 */
export function printAssetsBackSql(
  columns: ReadonlySet<string>,
  tableAlias = "a",
): string {
  const hasBack = columns.has("back");
  const hasBackUrl = columns.has("back_url");
  if (hasBack && hasBackUrl) {
    return `COALESCE(NULLIF(TRIM(${tableAlias}.back), ''), NULLIF(TRIM(${tableAlias}.back_url), ''))`;
  }
  if (hasBack) return `${tableAlias}.back`;
  if (hasBackUrl) return `${tableAlias}.back_url`;
  return "NULL";
}
