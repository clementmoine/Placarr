import { buildPrintKey } from "@/core/identify/printKey";

const SET_LABELS: Readonly<Record<string, string>> = {
  nr: "Ninja Ranks",
  ff: "Friends and Foes",
  sd: "Super Deformed",
  nw: "Ninja Warriors",
  ns: "Ninja Sensei",
  /** US Inkworks — chargeurs de display. */
  bl: "Box Loaders",
  pn: "Promos",
};

/**
 * EU (FR / IT) : PaniniMania, Coleka, Imadoki écrivent `GS1–3` (Group Seven).
 * Même set machine `bl` — on ne duplique pas les tirages.
 */
const EU_GROUP_SEVEN_LANGS = new Set(["fr", "it"]);

const SET_ORDER = ["nr", "ff", "sd", "nw", "ns", "bl", "pn"] as const;

function usesEuropeanGroupSevenLabel(
  language?: string | null,
): boolean {
  const lang = language?.trim().toLowerCase() ?? "";
  return EU_GROUP_SEVEN_LANGS.has(lang);
}

/** `naruto:nr-0001`, `naruto:ff-0001`, `naruto:pn-i`. */
export function ninjaRanksPrintKey(
  setCode: string,
  number: string,
): string | null {
  return buildPrintKey({
    game: "naruto",
    set: setCode,
    number,
  });
}

/**
 * Référence collectionneur.
 *
 * Inkworks US : `1`, `FF-1`, `BL-1`, `PN-i`.
 * EU FR/IT : les box loaders s'impriment `GS-1` (Group Seven) — Imadoki
 * `gs01-03`, Coleka `Ref. GS03`, PaniniMania GS1–GS3.
 */
export function formatNinjaRanksReference(
  cardType: string,
  number: string,
  _grouping?: string | null,
  language?: string | null,
): string {
  const type = cardType.trim().toLowerCase();
  const raw = number.trim();
  if (type === "nr") {
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) ? String(n) : raw;
  }
  const numeric = /^\d+$/.test(raw);
  const suffix = numeric ? String(Number.parseInt(raw, 10)) : raw;
  if (type === "pn" && suffix === "i") return "PN-i";
  if (type === "bl" && usesEuropeanGroupSevenLabel(language)) {
    return `GS-${numeric ? suffix : suffix.toUpperCase()}`;
  }
  return `${type.toUpperCase()}-${numeric ? suffix : suffix.toUpperCase()}`;
}

export function ninjaRanksSetLabel(
  setCode: string,
  language?: string | null,
): string {
  const key = setCode.trim().toLowerCase();
  if (key === "bl" && usesEuropeanGroupSevenLabel(language)) {
    return "Group Seven";
  }
  return SET_LABELS[key] ?? key.toUpperCase();
}

export function ninjaRanksSetSortKey(setCode: string): number | null {
  const i = SET_ORDER.indexOf(
    setCode.trim().toLowerCase() as (typeof SET_ORDER)[number],
  );
  return i < 0 ? null : i;
}

/**
 * `GS1` / `GS-1` / `BL-1` → fragment de `print_key` (`bl-0001`) pour la
 * recherche SQL. `gs` seul → `bl` (tout le set).
 */
export function normalizeNinjaRanksSearchQuery(query: string): string {
  const trimmed = query.trim();
  if (!trimmed) return query;

  if (/^gs$/i.test(trimmed)) return "bl";

  const insert = /^(gs|bl)[\s\-]*0*(\d+)$/i.exec(trimmed);
  if (insert) {
    const n = Number.parseInt(insert[2]!, 10);
    if (Number.isFinite(n) && n >= 1) {
      return `bl-${String(n).padStart(4, "0")}`;
    }
  }

  return query;
}
