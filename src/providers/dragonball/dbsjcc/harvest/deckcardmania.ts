/**
 * Harvest DeckCardMania Dragon Ball set fiches (idf=3 albums) → curated ledger.
 *
 * Honest scope: album pages are **set sheets**, not a per-card face dump.
 * Capture packshot + gallery URLs, Bandai ranges, rare/holo D-lists, and
 * only gallery images whose title clearly names a card (Carte SP01 / D-###).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { httpGet } from "@/lib/http/httpClient";

import { dbsJccCuratedDir } from "../pack";
import { parseDbsjccNumber } from "../printKey";

export const DECKCARDMANIA_ORIGIN = "https://www.deckcardmania.com";
export const DECKCARDMANIA_IDF = 3;
/** Hub listing for Dragon Ball grandes séries (idd=125). */
export const DECKCARDMANIA_HUB =
  `${DECKCARDMANIA_ORIGIN}/?pag=cid508&idf=${DECKCARDMANIA_IDF}&idd=125`;

/**
 * Attested Dragon Ball albums under idf=3 (user-curated crawl list).
 * Mix of FR JCC séries 1–10 / SP / Promo, Super Séries, DBS CG, Zenzu Blast.
 */
export const DECKCARDMANIA_ALBUM_IDS: readonly number[] = [
  120, 119, 118, 117, 113, 112, 111, 110, 148, 81, 86, 85, 7, 6, 4, 150, 247,
  246, 248, 558, 512, 559, 517, 84,
];

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

export type DeckcardmaniaLine =
  | "jcc-serie"
  | "jcc-sp"
  | "jcc-promo"
  | "super-serie"
  | "dbs-cg"
  | "other";

export type DeckcardmaniaGalleryKind =
  | "packshot"
  | "dos"
  | "liste"
  | "exemple"
  | "named"
  | "other";

export type DeckcardmaniaGalleryImage = {
  title: string;
  url: string;
  thumbUrl: string | null;
  kind: DeckcardmaniaGalleryKind;
  /** Printed when title clearly names a card (`Carte SP01`, `D-86`, …). */
  printed: string | null;
  number: string | null;
};

export type DeckcardmaniaAlbum = {
  idm: number;
  title: string;
  albumUrl: string;
  /** `partN` / `sp` / `promo` when FR JCC corpus applies; else null. */
  setHint: string | null;
  line: DeckcardmaniaLine;
  bandaiRange: string | null;
  releaseText: string | null;
  rares: string[];
  holos: string[];
  packshotUrl: string | null;
  gallery: DeckcardmaniaGalleryImage[];
};

export type DeckcardmaniaLedger = {
  source: string;
  observed: string;
  ingest: string;
  crawl: boolean;
  note: string;
  hub: string;
  listed: number;
  albums: DeckcardmaniaAlbum[];
};

/** Decode the ISO-8859-1 body DeckCardMania serves. */
export function decodeDeckcardmaniaHtml(bytes: Uint8Array): string {
  return new TextDecoder("iso-8859-1").decode(bytes);
}

export function deckcardmaniaAlbumUrl(idm: number): string {
  return `${DECKCARDMANIA_ORIGIN}/?pag=cid508_alb&idf=${DECKCARDMANIA_IDF}&idm=${idm}`;
}

export function deckcardmaniaAbsoluteFileUrl(src: string): string | null {
  const trimmed = src.trim().replace(/&amp;/g, "&");
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  const pathPart = trimmed.replace(/^\.\//, "").replace(/^\//, "");
  return `${DECKCARDMANIA_ORIGIN}/${pathPart}`;
}

/** Prefer big gallery file (`_iNb.jpg`) over thumb (`_iNs.jpg`). */
export function preferDeckcardmaniaBigImage(src: string): string {
  return src.replace(/(_i\d+)s\.(jpe?g|png|gif|webp)$/i, "$1b.$2");
}

function decodeEntities(raw: string): string {
  return raw
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&nbsp;/gi, " ");
}

function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

/**
 * Map album title → FR JCC setHint when attested.
 * `Série 1`…`Série 10` → partN ; SP → sp ; Promo → promo.
 * Super Séries / DBS Super Card Game / Zenzu → null (other packs / lines).
 */
export function extractSetHintFromDeckcardmaniaTitle(
  title: string,
): { setHint: string | null; line: DeckcardmaniaLine } {
  const t = title.replace(/\s+/g, " ").trim();
  if (/super\s+card\s+game/i.test(t) || /\bDBS\b.*\bCard\s+Game\b/i.test(t)) {
    return { setHint: null, line: "dbs-cg" };
  }
  if (/zenzu\s+blast/i.test(t)) {
    return { setHint: null, line: "other" };
  }
  if (/super\s+s[eé]rie/i.test(t)) {
    return { setHint: null, line: "super-serie" };
  }
  if (/\bs[eé]rie\s+promo\b/i.test(t)) {
    return { setHint: "promo", line: "jcc-promo" };
  }
  if (/\bs[eé]rie\s+sp\b/i.test(t) || /\bhors[-\s]?s[eé]rie\b/i.test(t)) {
    return { setHint: "sp", line: "jcc-sp" };
  }
  const serie = t.match(/\bs[eé]rie\s+(\d{1,2})\b/i);
  if (serie) {
    const n = Number.parseInt(serie[1]!, 10);
    if (Number.isFinite(n) && n >= 1 && n <= 10) {
      return { setHint: `part${n}`, line: "jcc-serie" };
    }
  }
  return { setHint: null, line: "other" };
}

/** Normalise a D/SP token from DCM lists (`D12`, `D-12`, `SP01`, `D504enf`) → `D-12`. */
export function normalizeDeckcardmaniaPrinted(raw: string): string | null {
  let clean = raw.trim();
  // Strip trailing pouvoir / grouping suffixes DCM glues on (enf, mai, mdk, nc6…).
  clean = clean.replace(
    /^(D\s*[-_]?\s*\d+)(?:enf|mai|mdk|main|nc\d+|kaio|holo|prism).*$/i,
    "$1",
  );
  // Refuse bare integers — Super Série lists use plain DB numbers without D/SP.
  if (!/^(?:SP|D)\s*[-_]?\s*\d+$/i.test(clean)) return null;
  const number = parseDbsjccNumber(clean);
  if (!number) return null;
  const prefix = number.startsWith("sp") ? "SP" : "D";
  const n = Number.parseInt(number.replace(/^[a-z]+/, ""), 10);
  return `${prefix}-${n}`;
}

/**
 * Parse `D12, D26, D-30` (and plain numbers in Super Série holos) into printed
 * refs. Plain integers alone are **not** treated as D- without album context —
 * callers pass `assumeDPrefix` for FR JCC rare/holo lists only.
 */
export function parseDeckcardmaniaPrintedList(
  raw: string,
  opts: { assumeDPrefix?: boolean } = {},
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const tokens = raw.split(/[,;]/).map((t) => t.trim()).filter(Boolean);
  for (const token of tokens) {
    const cleaned = token.replace(/\*+$/, "").trim();
    // Skip variant suffixes like D-933-1 / 189-1 — not a plain collector number.
    if (/(?:^|D\s*[-_]?\s*)\d+\s*[-–]\s*\d+/i.test(cleaned)) continue;
    let printed = normalizeDeckcardmaniaPrinted(cleaned);
    if (!printed && opts.assumeDPrefix) {
      const bare = cleaned.match(/^(\d+)$/);
      if (bare) {
        printed = normalizeDeckcardmaniaPrinted(`D-${bare[1]}`);
      }
    }
    if (!printed || seen.has(printed)) continue;
    seen.add(printed);
    out.push(printed);
  }
  return out;
}

/**
 * Extract a clearly named card from a gallery title/alt.
 * Accepts `Carte SP01`, `Carte D-86`, `Cartes N°: D-891`, plain `D-86`.
 * Rejects ambiguous variant suffixes (`D 933-1`, `Carte 189-1` without D/SP).
 */
export function extractNamedCardFromDeckcardmaniaTitle(
  title: string,
): { printed: string; number: string } | null {
  const t = title.replace(/\s+/g, " ").trim();
  if (!t) return null;

  const sp = t.match(
    /(?:carte|cartes?\s*n[°o.]?:?\s*)?\s*(SP)\s*[-_]?\s*(\d+)\b/i,
  );
  if (sp) {
    const printed = normalizeDeckcardmaniaPrinted(`${sp[1]}-${sp[2]}`);
    const number = printed ? parseDbsjccNumber(printed) : null;
    if (printed && number) return { printed, number };
  }

  const d = t.match(
    /(?:carte|cartes?\s*n[°o.]?:?\s*)?\s*(D)\s*[-_]?\s*(\d+)\b(?!\s*[-–]\s*\d)/i,
  );
  if (d) {
    // Reject leftover variant markers: "D 933-1", "D-891-2 Holo"
    const after = t.slice(d.index! + d[0].length);
    if (/^\s*[-–]\s*\d/.test(after)) return null;
    const printed = normalizeDeckcardmaniaPrinted(`${d[1]}-${d[2]}`);
    const number = printed ? parseDbsjccNumber(printed) : null;
    if (printed && number) return { printed, number };
  }

  return null;
}

function classifyGalleryTitle(title: string): DeckcardmaniaGalleryKind {
  const t = title.toLowerCase();
  if (/dos\s+de\s+card/.test(t)) return "dos";
  if (/liste\s+des\s+cartes/.test(t)) return "liste";
  if (/exemple/.test(t)) return "exemple";
  if (extractNamedCardFromDeckcardmaniaTitle(title)) return "named";
  if (/pochette|bo[iî]te|booster|deck|packshot/.test(t)) return "other";
  return "other";
}

function extractBandaiRange(html: string): string | null {
  // Prefer post-title fiche body — meta description also contains "Bandaï : …".
  const afterH1 = html.search(/<\/h1>/i);
  const body = afterH1 >= 0 ? html.slice(afterH1) : html;
  const m = body.match(
    /(?:Banda[iïî]|Bandai|Carddass(?:\/Banda[iïî])?)\s*:\s*([^<\n]{2,60})/i,
  );
  if (!m) return null;
  let text = stripTags(m[1]!).replace(/\s+/g, " ").trim();
  // Cut meta bleed ("D1 à D134. Fiche N° …")
  text = text.replace(/\.\s*Fiche\s*N.*$/i, "").trim();
  if (
    !text ||
    /voir\s+(la\s+)?liste/i.test(text) ||
    /voir\s+le\s+d[eé]tail/i.test(text) ||
    /^BT\d/i.test(text)
  ) {
    return null;
  }
  return text;
}

function extractReleaseText(html: string): string | null {
  const m = html.match(
    /Premi[eè]re\s+parution\s*:\s*<\/b>\s*([^<\n]+)/i,
  );
  return m ? stripTags(m[1]!).trim() || null : null;
}

function extractLabeledList(
  html: string,
  label: RegExp,
  assumeDPrefix: boolean,
): string[] {
  const m = html.match(
    new RegExp(
      `${label.source}[^:]*:\\s*</b>\\s*([^<\\n]+)`,
      label.flags.includes("i") ? "i" : "i",
    ),
  );
  if (!m) return [];
  return parseDeckcardmaniaPrintedList(stripTags(m[1]!), { assumeDPrefix });
}

/**
 * Parse one album fiche HTML into a structured album row.
 */
export function parseDeckcardmaniaAlbumHtml(
  html: string,
  idm: number,
): DeckcardmaniaAlbum {
  const h1 = html.match(/<h1>\s*([\s\S]*?)\s*<\/h1>/i);
  const title = h1 ? stripTags(h1[1]!) : `Album ${idm}`;
  const { setHint, line } = extractSetHintFromDeckcardmaniaTitle(title);
  const assumeD = line === "jcc-serie" || line === "jcc-sp" || line === "jcc-promo";

  const packshotRel = html.match(
    new RegExp(`(?:src|href)=["'](files/${DECKCARDMANIA_IDF}/${idm}b\\.(?:jpe?g|png|gif))["']`, "i"),
  );
  const packshotUrl = packshotRel
    ? deckcardmaniaAbsoluteFileUrl(packshotRel[1]!)
    : null;

  const gallery: DeckcardmaniaGalleryImage[] = [];
  const seen = new Set<string>();
  const linkRe = new RegExp(
    `<a\\s+href=["'](files/${DECKCARDMANIA_IDF}/${idm}_i(\\d+)b\\.(?:jpe?g|png|gif))["'][^>]*title=["']([^"']*)["'][^>]*>\\s*<img[^>]*src=["'](files/${DECKCARDMANIA_IDF}/${idm}_i\\d+s\\.(?:jpe?g|png|gif))["']`,
    "gi",
  );
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(html)) !== null) {
    const big = deckcardmaniaAbsoluteFileUrl(m[1]!);
    if (!big || seen.has(big)) continue;
    seen.add(big);
    const titleAttr = decodeEntities(m[3]!).trim();
    const named = extractNamedCardFromDeckcardmaniaTitle(titleAttr);
    gallery.push({
      title: titleAttr,
      url: big,
      thumbUrl: deckcardmaniaAbsoluteFileUrl(m[4]!),
      kind: named ? "named" : classifyGalleryTitle(titleAttr),
      printed: named?.printed ?? null,
      number: named?.number ?? null,
    });
  }

  // Fallback: links without paired thumb in the same <a>
  const looseRe = new RegExp(
    `href=["'](files/${DECKCARDMANIA_IDF}/${idm}_i(\\d+)b\\.(?:jpe?g|png|gif))["'][^>]*title=["']([^"']*)["']`,
    "gi",
  );
  while ((m = looseRe.exec(html)) !== null) {
    const big = deckcardmaniaAbsoluteFileUrl(m[1]!);
    if (!big || seen.has(big)) continue;
    seen.add(big);
    const titleAttr = decodeEntities(m[3]!).trim();
    const named = extractNamedCardFromDeckcardmaniaTitle(titleAttr);
    gallery.push({
      title: titleAttr,
      url: big,
      thumbUrl: null,
      kind: named ? "named" : classifyGalleryTitle(titleAttr),
      printed: named?.printed ?? null,
      number: named?.number ?? null,
    });
  }

  gallery.sort((a, b) => a.url.localeCompare(b.url));

  return {
    idm,
    title,
    albumUrl: deckcardmaniaAlbumUrl(idm),
    setHint,
    line,
    bandaiRange: extractBandaiRange(html),
    releaseText: extractReleaseText(html),
    rares: extractLabeledList(html, /Cartes\s+Rares/i, assumeD),
    holos: extractLabeledList(html, /Cartes\s+Holographiques/i, assumeD),
    packshotUrl,
    gallery,
  };
}

export function buildDeckcardmaniaLedger(
  albums: readonly DeckcardmaniaAlbum[],
  observed = new Date().toISOString().slice(0, 10),
): DeckcardmaniaLedger {
  const sorted = [...albums].sort((a, b) => a.idm - b.idm);
  return {
    source:
      "deckcardmania.com — Dragon Ball set fiches (idf=3, grandes séries / SP / promo / Super Séries)",
    observed,
    ingest: "set-fiches",
    crawl: true,
    note:
      "Fiches set (pas un dump face-par-face). Packshot files/3/{idm}b.jpg + galerie _iNb.jpg. Listes Cartes Rares / Holographiques (D-###) pour JCC FR. Faces sample uniquement quand title/alt nomme clairement une carte (Carte SP01 / D-###). Super Séries / DBS CG / Zenzu = ledger only (hors corpus dbsjcc).",
    hub: DECKCARDMANIA_HUB,
    listed: sorted.length,
    albums: sorted,
  };
}

export function dbsJccDeckcardmaniaLedgerPath(): string {
  return path.join(dbsJccCuratedDir(), "sources", "deckcardmania.json");
}

export function writeDeckcardmaniaLedger(
  ledger: DeckcardmaniaLedger,
  outPath = dbsJccDeckcardmaniaLedgerPath(),
): string {
  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(ledger, null, 2)}\n`, "utf8");
  return outPath;
}

export function readDeckcardmaniaLedger(
  ledgerPath = dbsJccDeckcardmaniaLedgerPath(),
): DeckcardmaniaLedger | null {
  if (!existsSync(ledgerPath)) return null;
  return JSON.parse(readFileSync(ledgerPath, "utf8")) as DeckcardmaniaLedger;
}

export async function fetchDeckcardmaniaAlbumHtml(
  idm: number,
): Promise<string> {
  const res = await httpGet<ArrayBuffer>(deckcardmaniaAlbumUrl(idm), {
    headers: {
      "User-Agent": UA,
      Accept: "text/html,*/*",
    },
    timeout: 40_000,
    responseType: "arraybuffer",
    validateStatus: (status) => status === 200,
    noDedup: true,
  });
  return decodeDeckcardmaniaHtml(new Uint8Array(res.data as ArrayBuffer));
}

export async function fetchDeckcardmaniaAlbums(
  idms: readonly number[] = DECKCARDMANIA_ALBUM_IDS,
  opts: { delayMs?: number } = {},
): Promise<DeckcardmaniaAlbum[]> {
  const delayMs = opts.delayMs ?? 200;
  const albums: DeckcardmaniaAlbum[] = [];
  for (let i = 0; i < idms.length; i += 1) {
    const idm = idms[i]!;
    const html = await fetchDeckcardmaniaAlbumHtml(idm);
    albums.push(parseDeckcardmaniaAlbumHtml(html, idm));
    if (i < idms.length - 1 && delayMs > 0) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  return albums;
}

/** Live harvest → rewrite curated ledger. */
export async function harvestDbsJccDeckcardmania(
  opts: { idms?: readonly number[]; delayMs?: number } = {},
): Promise<{ albums: number; rares: number; holos: number; named: number; path: string }> {
  const albums = await fetchDeckcardmaniaAlbums(opts.idms, {
    delayMs: opts.delayMs,
  });
  const ledger = buildDeckcardmaniaLedger(albums);
  const out = writeDeckcardmaniaLedger(ledger);
  let rares = 0;
  let holos = 0;
  let named = 0;
  for (const album of albums) {
    rares += album.rares.length;
    holos += album.holos.length;
    named += album.gallery.filter((g) => g.kind === "named").length;
  }
  return { albums: albums.length, rares, holos, named, path: out };
}
