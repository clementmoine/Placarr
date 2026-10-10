/**
 * nikita.jp `/cardlist/dbc` — ドラゴンボール カードゲーム (partial JA titles).
 *
 * Same D-/SP- collector numbers as the FR JCC adaptation — titles join onto
 * existing `dbsjcc:…` printKeys. Honest partial: nikita hosts a subset only.
 *
 * Structure HTML parsée par le client partagé ; ici seulement l'identité DBC.
 */
import {
  NIKITA_TCG_DB_ORIGIN,
  nikitaCardlistPath,
  nikitaFaceUrl,
  parseNikitaCardlistRows,
} from "@/providers/shared/nikita/cardlist";

export const NIKITA_DBC_ORIGIN = NIKITA_TCG_DB_ORIGIN;
export const NIKITA_DBC_CARDLIST_PATH = nikitaCardlistPath("dbc");

export type NikitaDbcCard = {
  printed: string;
  /** Normalized `d0005` / `sp0001` — matches `parseDbsjccNumber`. */
  number: string;
  nameJa: string;
  faceUrlJa: string;
  setLabel: string | null;
};

function normalizePrinted(
  raw: string,
): { printed: string; number: string } | null {
  const m = raw.trim().toUpperCase().match(/^(D|SP)-?(\d+)$/);
  if (!m) return null;
  const prefix = m[1]!;
  const n = Number.parseInt(m[2]!, 10);
  if (!Number.isFinite(n) || n < 1) return null;
  const printed = `${prefix}-${n}`;
  const number = `${prefix.toLowerCase()}${String(n).padStart(4, "0")}`;
  return { printed, number };
}

export function parseNikitaDbcCardlist(html: string): NikitaDbcCard[] {
  const out: NikitaDbcCard[] = [];
  const seen = new Set<string>();
  for (const row of parseNikitaCardlistRows(html, "dbc")) {
    const key = row.printedRef;
    if (!/^(D|SP)-?\d+$/.test(key)) continue;
    const norm = normalizePrinted(key);
    if (!norm || seen.has(norm.number)) continue;
    seen.add(norm.number);
    // Le fichier face garde le zéro-padding imprimé (`D-005`), tiret inséré.
    const fileKey = key.includes("-") ? key : key.replace(/^(D|SP)/, "$1-");
    out.push({
      printed: norm.printed,
      number: norm.number,
      nameJa: row.nameJa,
      faceUrlJa: nikitaFaceUrl("dbc", fileKey),
      setLabel: row.setLabel,
    });
  }
  out.sort((a, b) => a.number.localeCompare(b.number));
  return out;
}
