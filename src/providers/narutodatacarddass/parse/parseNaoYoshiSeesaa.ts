/**
 * Parse nao-yoshi.seesaa.net Data Carddass CODE128 articles
 * (DN / NM / NF / NX barcode + rarity + Japanese names).
 *
 * Articles are Shift_JIS / cp932 HTML with tables:
 *   NO. | カード名 | レア | start | データ | CheckDigit | stop
 * (DN/NM articles also have a leading 種 column.)
 */
export const NAO_YOSHI_SEESAA_ORIGIN = "https://nao-yoshi.seesaa.net";

export const NAO_YOSHI_SEESAA_ARTICLES: ReadonlyArray<{
  id: string;
  cabinet: "dn" | "nm" | "nf" | "nx";
  label: string;
  path: string;
}> = [
  {
    id: "387082531",
    cabinet: "dn",
    label: "Card Battle DN-001–107 + DNP",
    path: "/article/387082531.html",
  },
  {
    id: "387082805",
    cabinet: "dn",
    label: "Card Battle DN-108–250",
    path: "/article/387082805.html",
  },
  {
    id: "387083049",
    cabinet: "nm",
    label: "Mission NM + DMP",
    path: "/article/387083049.html",
  },
  {
    id: "387083386",
    cabinet: "nf",
    label: "Formation NF + NFP",
    path: "/article/387083386.html",
  },
  {
    id: "387083772",
    cabinet: "nx",
    label: "Cross NX + NXP / NX-MAC",
    path: "/article/387083772.html",
  },
];

/** Printed refs like DN-001T, NX-MAC001, NXP-002 — not raw CODE128 payloads. */
export const NAO_YOSHI_PRINTED_RE =
  /^(?:DN|DT|DNP|DMP|NM|NC|NF|NFC|NFM|NFP|NX|NXP|NXPF)-(?:\d{1,3}[A-Z]*|MAC\d{1,3}|CAM\d{1,3})$/i;

export type NaoYoshiSeesaaRow = {
  printed: string;
  nameJa: string;
  rarity: string | null;
  barcodeData: string | null;
  cabinet: "dn" | "nm" | "nf" | "nx";
  articleId: string;
};

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/g, "&")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtmlBytes(raw: Buffer | string): string {
  if (typeof raw === "string") return raw;
  // Seesaa articles are Shift_JIS / cp932.
  try {
    return new TextDecoder("shift_jis").decode(raw);
  } catch {
    return raw.toString("utf8");
  }
}

/**
 * Map blog rarity glyphs to catalogue labels.
 * Fullwidth Ｎ/Ｒ and abbreviations 激/爆 expand to collector-facing forms.
 */
export function normalizeNaoYoshiRarity(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const t = raw.trim();
  if (!t || t === "-" || t === "－" || t === "—") return null;
  const compact = t.replace(/\s+/g, "");
  const map: Record<string, string> = {
    Ｎ: "N",
    N: "N",
    Ｒ: "R",
    R: "R",
    SR: "SR",
    NR: "NR",
    UR: "UR",
    WNR: "WNR",
    JR: "JR",
    BR: "BR",
    SC: "SC",
    激: "激レア",
    激レア: "激レア",
    爆: "爆レア",
    爆レア: "爆レア",
    呪印: "呪印",
    暁: "暁",
    絆: "絆",
  };
  if (map[compact]) return map[compact];
  // Ignore parser noise / barcode leftovers.
  if (
    /^(A|start|stop|データ|CheckDigit)$/i.test(compact) ||
    (compact.length >= 6 && /^[A-Z0-9;()]+$/i.test(compact))
  ) {
    return null;
  }
  return compact;
}

function extractPrintedRefs(cell: string): string[] {
  const parts = cell
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (!parts.length) return [];
  if (!parts.every((p) => NAO_YOSHI_PRINTED_RE.test(p))) return [];
  return parts.map((p) => p.toUpperCase());
}

/**
 * Parse one article HTML (already decoded as Unicode text).
 */
export function parseNaoYoshiSeesaaArticle(
  html: string,
  meta: { articleId: string; cabinet: NaoYoshiSeesaaRow["cabinet"] },
): NaoYoshiSeesaaRow[] {
  const rows: NaoYoshiSeesaaRow[] = [];
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  for (const match of html.matchAll(trRe)) {
    const rowHtml = match[1]!;
    const cells = Array.from(
      rowHtml.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi),
    )
      .map((m) => stripTags(m[1]!))
      .filter((c) => c && c !== "&nbsp;");
    if (!cells.length) continue;

    let refIdx = -1;
    let refs: string[] = [];
    for (let i = 0; i < cells.length; i++) {
      const found = extractPrintedRefs(cells[i]!);
      if (found.length) {
        refIdx = i;
        refs = found;
        break;
      }
    }
    if (refIdx < 0) continue;

    const rest = cells.slice(refIdx + 1);
    const nameJa = rest[0]?.trim() ?? "";
    if (!nameJa || nameJa === "カード名" || nameJa.startsWith("【")) continue;

    const rarityRaw = rest[1] ?? null;
    let barcodeData: string | null = null;
    if (rest.length > 3 && (rest[2] === "A" || rest[2] === "start" || rest[2] === "-")) {
      barcodeData = rest[3] && rest[3] !== "-" ? rest[3] : null;
    } else if (rest.length > 2 && rest[2] && !["A", "start", "-"].includes(rest[2])) {
      barcodeData = rest[2];
    }

    const rarity = normalizeNaoYoshiRarity(rarityRaw);
    for (const printed of refs) {
      rows.push({
        printed,
        nameJa,
        rarity,
        barcodeData,
        cabinet: meta.cabinet,
        articleId: meta.articleId,
      });
    }
  }
  return rows;
}

export function parseNaoYoshiSeesaaBytes(
  raw: Buffer,
  meta: { articleId: string; cabinet: NaoYoshiSeesaaRow["cabinet"] },
): NaoYoshiSeesaaRow[] {
  return parseNaoYoshiSeesaaArticle(decodeHtmlBytes(raw), meta);
}

export function mergeNaoYoshiSeesaaRows(
  rows: readonly NaoYoshiSeesaaRow[],
): Map<string, NaoYoshiSeesaaRow> {
  const out = new Map<string, NaoYoshiSeesaaRow>();
  for (const row of rows) {
    const key = row.printed.toUpperCase();
    const prev = out.get(key);
    if (!prev) {
      out.set(key, row);
      continue;
    }
    // Prefer a named row with rarity over a sparse one.
    const score = (r: NaoYoshiSeesaaRow) =>
      (r.nameJa ? 2 : 0) + (r.rarity ? 1 : 0) + (r.barcodeData ? 1 : 0);
    if (score(row) >= score(prev)) out.set(key, row);
  }
  return out;
}

/** True when a checklist Japanese title looks like mojibake / replacement chars. */
export function looksLikeMojibakeJa(name: string | null | undefined): boolean {
  if (!name) return false;
  if (name.includes("�")) return true;
  // Typical Shift_JIS→UTF-8 corruption from Wayback fudanin pages.
  return /[縺繧]/.test(name);
}
