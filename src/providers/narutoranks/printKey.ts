import { buildPrintKey } from "@/core/identify/printKey";

const SET_LABELS: Readonly<Record<string, string>> = {
  nr: "Ninja Ranks",
  ff: "Friends and Foes",
  sd: "Super Deformed",
  nw: "Ninja Warriors",
  bl: "Box Loaders",
  pn: "Promos",
};

const SET_ORDER = ["nr", "ff", "sd", "nw", "bl", "pn"] as const;

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

/** Référence telle que la checklist Inkworks l'écrit : `1`, `FF-1`, `PN-i`. */
export function formatNinjaRanksReference(
  cardType: string,
  number: string,
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
  return `${type.toUpperCase()}-${numeric ? suffix : suffix.toUpperCase()}`;
}

export function ninjaRanksSetLabel(setCode: string): string {
  const key = setCode.trim().toLowerCase();
  return SET_LABELS[key] ?? key.toUpperCase();
}

export function ninjaRanksSetSortKey(setCode: string): number | null {
  const i = SET_ORDER.indexOf(
    setCode.trim().toLowerCase() as (typeof SET_ORDER)[number],
  );
  return i < 0 ? null : i;
}
