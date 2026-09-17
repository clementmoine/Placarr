/**
 * Cardlists officiels Data Carddass (Wayback / miroir carddas.com + fudanin).
 * SHIFT_JIS → noms JP + refs DN/NM/NF/NX (+ annexes).
 */

export type OfficialDcdCard = {
  printed: string;
  nameJa: string;
};

const PRINTED_RE =
  /^(NXPF|NX-CAM|NX-MAC|NFP|NFM|NFC|NFF|NXP|DNP|DMP|CAN|DN|DT|NM|NC|NF|NX)-?(\d+)(?:-?([A-Za-z]))?$/i;

function toHalfWidth(s: string): string {
  return s.replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
}

/** `NF001` / `DN-001T` → `NF-001` / `DN-001T`. */
export function normalizeOfficialPrinted(raw: string): string | null {
  const trimmed = toHalfWidth(raw.trim().replace(/\s+/g, "")).toUpperCase();
  const m = PRINTED_RE.exec(trimmed);
  if (!m) return null;
  return `${m[1]!.toUpperCase()}-${m[2]!}${m[3] ? m[3].toUpperCase() : ""}`;
}

export function decodeOfficialCardlistBytes(raw: Buffer | Uint8Array): string {
  return new TextDecoder("shift_jis").decode(raw);
}

function unescapeHtml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim();
}

function dedupe(cards: OfficialDcdCard[]): OfficialDcdCard[] {
  const out = new Map<string, OfficialDcdCard>();
  for (const card of cards) {
    if (!card.printed || !card.nameJa) continue;
    if (!out.has(card.printed)) out.set(card.printed, card);
  }
  return [...out.values()];
}

/**
 * CSV officiel `battle_card.csv` (DN / DNP).
 * Colonnes : 収録, カードNo, カード名, …
 */
export function parseBattleCardCsv(csvText: string): OfficialDcdCard[] {
  const lines = csvText.replace(/^\uFEFF/, "").split(/\r?\n/);
  const cards: OfficialDcdCard[] = [];
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    const cols = splitCsvLine(line);
    if (cols.length < 3) continue;
    const printed = normalizeOfficialPrinted(cols[1] ?? "");
    const nameJa = (cols[2] ?? "").trim();
    if (!printed || !nameJa) continue;
    if (!/^(DN|DNP)-/.test(printed)) continue;
    cards.push({ printed, nameJa });
  }
  return dedupe(cards);
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]!;
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

/**
 * Pages Mission (`cardlist*.shtml`, promocard, tokunin, clear) :
 * `>NM-001</td>…<a>うずまきナルト</a>`.
 */
export function parseMissionCardlistHtml(
  html: string,
  prefixes: ReadonlySet<string> = new Set(["NM", "NC", "DMP", "DNP", "DN"]),
): OfficialDcdCard[] {
  const cards: OfficialDcdCard[] = [];
  const re =
    />\s*((?:NM|NC|DMP|DNP|DN)[-]?\d+[A-Za-z]?)\s*<\/td>[\s\S]{0,900}?<a[^>]*>\s*([^<]+)\s*(?:<br[^>]*>)?/gi;
  for (const match of html.matchAll(re)) {
    const printed = normalizeOfficialPrinted(match[1]!);
    if (!printed) continue;
    const pref = printed.split("-")[0]!;
    if (!prefixes.has(pref)) continue;
    const nameJa = unescapeHtml(match[2]!);
    if (!nameJa || /カード/.test(nameJa)) continue;
    cards.push({ printed, nameJa });
  }
  return dedupe(cards);
}

/**
 * Pages Formation fudanin (`1st.php`…`7th.php`, clear, advance) :
 * `>NF001</td>…<a>うずまきナルト<br>(疾風伝)</a>`.
 */
export function parseFormationCardlistHtml(html: string): OfficialDcdCard[] {
  const cards: OfficialDcdCard[] = [];
  const re =
    />\s*((?:NF|NFP|NFM|NFC|DMP)[-]?\d+)\s*<\/td>[\s\S]{0,600}?<a[^>]*>\s*([\s\S]*?)\s*<\/a>/gi;
  for (const match of html.matchAll(re)) {
    const printed = normalizeOfficialPrinted(match[1]!);
    if (!printed) continue;
    let nameJa = unescapeHtml(match[2]!.replace(/<[^>]+>/g, " "));
    nameJa = nameJa.replace(/\s+/g, " ").replace(/\([^)]*\)\s*$/u, "").trim();
    if (!nameJa) continue;
    cards.push({ printed, nameJa });
  }
  return dedupe(cards);
}

/**
 * Page Cross fudanin (`index.php?category=…`) :
 * `>NX-001</td>…<a>うずまきナルト</a>` / `NXP-` / `NXpf-`.
 */
export function parseCrossCardlistHtml(html: string): OfficialDcdCard[] {
  const cards: OfficialDcdCard[] = [];
  const re =
    />\s*((?:NXPF|NXpf|NXP|NX)[-]?\d+[A-Za-z]?)\s*<\/td>[\s\S]{0,600}?<a[^>]*>\s*([^<]+)(?:<br[^>]*>[^<]*)?\s*<\/a>/gi;
  for (const match of html.matchAll(re)) {
    const printed = normalizeOfficialPrinted(match[1]!);
    if (!printed) continue;
    const nameJa = unescapeHtml(match[2]!);
    if (!nameJa) continue;
    cards.push({ printed, nameJa });
  }
  return dedupe(cards);
}
