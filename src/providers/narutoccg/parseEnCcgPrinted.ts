/**
 * Printed Bandai USA CCG collector codes (`N-1646`, `N-US122`, `PR-060`).
 * Not TCDB acronyms (`PTHJ-001`) and not Carddass (`NI-1650`).
 *
 * `N-US122` is a tin/US exclusive — disk `nus0122`, never `n0122`.
 */
export type EnCcgPrinted = {
  cardType: "n" | "j" | "m" | "c" | "pr" | "ps";
  /** Disk id `n1646` / `nus122` / `pr060`. */
  number: string | null;
  usExclusive: boolean;
};

const TYPE: Record<string, EnCcgPrinted["cardType"]> = {
  n: "n",
  j: "j",
  m: "m",
  c: "c",
  pr: "pr",
  ps: "ps",
};

function padCollector(prefix: string, digits: string): string {
  const n = Number.parseInt(digits, 10);
  if (!Number.isFinite(n) || n < 1) return `${prefix}${digits.toLowerCase()}`;
  const width = Math.max(digits.length, 3);
  return `${prefix}${String(n).padStart(width, "0")}`;
}

/** `N-1646` / `N-US122` / `C-035` / `PR-060`. */
export function parseEnCcgPrintedRef(raw: string): EnCcgPrinted | null {
  const m =
    /^(N|J|M|C|PR|PS)[\s-]*(US)?[\s-]*(\d{1,4})$/i.exec(raw.trim()) ?? null;
  if (!m) return null;
  const cardType = TYPE[m[1]!.toLowerCase()];
  if (!cardType) return null;
  const usExclusive = Boolean(m[2]);
  const digits = m[3]!;
  const prefix = usExclusive ? `${cardType}us` : cardType;
  return {
    cardType,
    number: padCollector(prefix, digits),
    usExclusive,
  };
}
