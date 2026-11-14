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

import {
  dbsJccCuratedDir,
  dbsJccSyncedSourcePath,
} from "../pack";
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
  /** `partN` / `ssN` / `tinbox` / `sp` / `promo` when dbsjcc corpus applies; else null. */
  setHint: string | null;
  line: DeckcardmaniaLine;
  bandaiRange: string | null;
  releaseText: string | null;
  rares: string[];
  holos: string[];
  /**
   * Super Série full pool (`DB001`, `DB189-1`… / ranges). Empty for Série 1–10
   * (Bandai range + rares/holos only). Printed as `D-N` / `D-Na`.
   */
  checklist: string[];
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

/**
 * Prefer the largest DCM file DCM actually hosts.
 * Gallery: `_iNs.jpg` (thumb) → `_iNb.jpg` (big). Album: `{idm}s.jpg` → `{idm}b.jpg`.
 * No higher “raw/ori/hd” tier exists on deckcardmania.com (probed 2026-10-15).
 */
export function preferDeckcardmaniaBigImage(src: string): string {
  return src
    .replace(/(_i\d+)s\.(jpe?g|png|gif|webp)$/i, "$1b.$2")
    .replace(/(\/\d+)s\.(jpe?g|png|gif|webp)$/i, "$1b.$2");
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
 * `Série 1`…`Série 10` → partN ; Super Série N → ssN ; Tin box → tinbox ;
 * SP → sp ; Promo → promo. DBS Super Card Game / Zenzu → null.
 * DCM typo « Tim box » (idm=248) = Tin box métal Bandai — même setHint.
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
  if (/\bti[mn]\s*box\b/i.test(t)) {
    return { setHint: "tinbox", line: "other" };
  }
  const superSerie = t.match(/\bsuper\s+s[eé]rie\s+(\d{1,2})\b/i);
  if (superSerie) {
    const n = Number.parseInt(superSerie[1]!, 10);
    if (Number.isFinite(n) && n >= 1 && n <= 6) {
      return { setHint: `ss${n}`, line: "super-serie" };
    }
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

/** `1` → `a`, `2` → `b` … for DCM art variants (`189-1`, `DB189-2`). */
export function deckcardmaniaArtLetterFromIndex(index: number): string | null {
  if (!Number.isFinite(index) || index < 1 || index > 26) return null;
  return String.fromCharCode("a".charCodeAt(0) + index - 1);
}

/**
 * Normalise a D/SP/DB token from DCM lists → `D-12` / `D-189a` / `SP-1`.
 * `DB001`, `DB-102`, `DB189-1` (Super Série) need `allowArtVariants` for `-N`.
 */
export function normalizeDeckcardmaniaPrinted(
  raw: string,
  opts: { allowArtVariants?: boolean } = {},
): string | null {
  let clean = raw.trim().replace(/\*+$/, "");
  // Strip trailing pouvoir / grouping suffixes DCM glues on (enf, mai, mdk, nc6…).
  clean = clean.replace(
    /^(D\s*[-_]?\s*\d+)(?:enf|mai|mdk|main|nc\d+|kaio|holo|prism).*$/i,
    "$1",
  );

  const db = clean.match(/^DB\s*[-_]?\s*0*(\d+)(?:\s*[-–]\s*(\d+))?$/i);
  if (db) {
    const n = Number.parseInt(db[1]!, 10);
    if (!Number.isFinite(n) || n < 1) return null;
    if (db[2]) {
      if (!opts.allowArtVariants) return null;
      const letter = deckcardmaniaArtLetterFromIndex(Number.parseInt(db[2]!, 10));
      if (!letter) return null;
      return `D-${n}${letter}`;
    }
    return `D-${n}`;
  }

  const dArt = clean.match(/^D\s*[-_]?\s*0*(\d+)\s*[-–]\s*(\d+)$/i);
  if (dArt) {
    if (!opts.allowArtVariants) return null;
    const n = Number.parseInt(dArt[1]!, 10);
    const letter = deckcardmaniaArtLetterFromIndex(Number.parseInt(dArt[2]!, 10));
    if (!Number.isFinite(n) || n < 1 || !letter) return null;
    return `D-${n}${letter}`;
  }

  if (!/^(?:SP|D)\s*[-_]?\s*\d+[A-Z]?$/i.test(clean)) return null;
  const number = parseDbsjccNumber(clean);
  if (!number) return null;
  const split = number.match(/^(sp|d)(\d+)([a-z]?)$/i);
  if (!split) return null;
  const prefix = split[1]!.toLowerCase() === "sp" ? "SP" : "D";
  const n = Number.parseInt(split[2]!, 10);
  const letter = split[3]?.toLowerCase() ?? "";
  return `${prefix}-${n}${letter}`;
}

export type ParseDeckcardmaniaPrintedListOpts = {
  /** Bare `17` → `D-17` (Super Série holos / checklists). */
  assumeDPrefix?: boolean;
  /** `189-1` / `DB189-2` → `D-189a` / `D-189b`. */
  allowArtVariants?: boolean;
  /** Expand `DB-365 à DB-366` / `365 à 366`. */
  expandRanges?: boolean;
};

/**
 * Parse `D12, D26, D-30`, Super Série `DB001` / bare holos, optional ranges.
 * Plain integers alone need `assumeDPrefix`.
 */
export function parseDeckcardmaniaPrintedList(
  raw: string,
  opts: ParseDeckcardmaniaPrintedListOpts = {},
): string[] {
  let text = raw.replace(/\s+/g, " ").trim();
  if (opts.expandRanges) {
    text = text.replace(
      /(?:DB\s*[-_]?\s*)?(\d+)\s*(?:à|a)\s*(?:DB\s*[-_]?\s*)?(\d+)/gi,
      (full, a, b) => {
        const lo = Number.parseInt(a, 10);
        const hi = Number.parseInt(b, 10);
        if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi < lo) return full;
        if (hi - lo > 200) return full;
        return Array.from(
          { length: hi - lo + 1 },
          (_, i) => `D-${lo + i}`,
        ).join(", ");
      },
    );
  }

  const out: string[] = [];
  const seen = new Set<string>();
  const tokens = text.split(/[,;]/).map((t) => t.trim()).filter(Boolean);
  const normOpts = { allowArtVariants: opts.allowArtVariants === true };
  for (const token of tokens) {
    const cleaned = token
      .replace(/\*+$/, "")
      .replace(/[.:;]+$/g, "")
      .trim();
    if (!cleaned) continue;
    // Skip ambiguous variants unless Super Série art letters are enabled.
    if (
      !opts.allowArtVariants &&
      /(?:^|DB?\s*[-_]?\s*)\d+\s*[-–]\s*\d+/i.test(cleaned)
    ) {
      continue;
    }
    let printed = normalizeDeckcardmaniaPrinted(cleaned, normOpts);
    if (!printed && opts.assumeDPrefix) {
      const bareArt = cleaned.match(/^(\d+)\s*[-–]\s*(\d+)$/);
      if (bareArt && opts.allowArtVariants) {
        printed = normalizeDeckcardmaniaPrinted(
          `D-${bareArt[1]}-${bareArt[2]}`,
          normOpts,
        );
      } else {
        const bare = cleaned.match(/^(\d+)$/);
        if (bare) {
          printed = normalizeDeckcardmaniaPrinted(`D-${bare[1]}`, normOpts);
        }
      }
    }
    if (!printed || seen.has(printed)) continue;
    seen.add(printed);
    out.push(printed);
  }
  return out;
}

/**
 * Full Super Série pool from the fiche body (`DB001…` or `Liste des cartes:`).
 */
export function extractDeckcardmaniaSuperSerieChecklist(html: string): string[] {
  const liste = html.match(
    /Liste\s+des\s+cartes\s*:?\s*([\s\S]+?)(?:Exemple|Deck\s+de|Booster|Avis\s+des|$)/i,
  );
  let blob = liste?.[1] ?? "";
  if (!blob) {
    const afterHolo = html.split(/Cartes\s+Holographiques/i)[1] ?? "";
    // Drop the holo values line — SS3 writes holos as `DB403…`, which would
    // otherwise steal the checklist start from the real pool (`DB256…`).
    const afterHoloList = afterHolo.replace(/^[\s\S]*?<\/div>/i, "");
    const dbStart = afterHoloList.search(/\bDB\s*[-_]?\s*\d/i);
    const fromDb =
      dbStart >= 0 ? afterHoloList.slice(dbStart) : afterHoloList;
    blob =
      fromDb.split(/Exemple\s+de|Avis\s+des|Deck\s+de|Booster\s+de/i)[0] ??
      fromDb;
  }
  const text = stripTags(blob.replace(/<br\s*\/?>/gi, ","));
  return parseDeckcardmaniaPrintedList(text, {
    assumeDPrefix: true,
    allowArtVariants: true,
    expandRanges: true,
  });
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
  opts: ParseDeckcardmaniaPrintedListOpts,
): string[] {
  const m = html.match(
    new RegExp(
      `${label.source}[^:]*:\\s*</b>\\s*([^<\\n]+)`,
      label.flags.includes("i") ? "i" : "i",
    ),
  );
  if (!m) return [];
  return parseDeckcardmaniaPrintedList(stripTags(m[1]!), opts);
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
  const assumeD =
    line === "jcc-serie" ||
    line === "jcc-sp" ||
    line === "jcc-promo" ||
    line === "super-serie";
  const listOpts = {
    assumeDPrefix: assumeD,
    allowArtVariants: line === "super-serie",
    expandRanges: line === "super-serie",
  };

  const packshotRel = html.match(
    new RegExp(`(?:src|href)=["'](files/${DECKCARDMANIA_IDF}/${idm}b\\.(?:jpe?g|png|gif))["']`, "i"),
  );
  const packshotAbs = packshotRel
    ? deckcardmaniaAbsoluteFileUrl(packshotRel[1]!)
    : null;
  const packshotUrl = packshotAbs
    ? preferDeckcardmaniaBigImage(packshotAbs)
    : null;

  const gallery: DeckcardmaniaGalleryImage[] = [];
  const seen = new Set<string>();
  const linkRe = new RegExp(
    `<a\\s+href=["'](files/${DECKCARDMANIA_IDF}/${idm}_i(\\d+)b\\.(?:jpe?g|png|gif))["'][^>]*title=["']([^"']*)["'][^>]*>\\s*<img[^>]*src=["'](files/${DECKCARDMANIA_IDF}/${idm}_i\\d+s\\.(?:jpe?g|png|gif))["']`,
    "gi",
  );
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(html)) !== null) {
    const bigRaw = deckcardmaniaAbsoluteFileUrl(m[1]!);
    const big = bigRaw ? preferDeckcardmaniaBigImage(bigRaw) : null;
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

  // Fallback: links without paired thumb in the same <a> (also upgrade any _iNs).
  const looseRe = new RegExp(
    `href=["'](files/${DECKCARDMANIA_IDF}/${idm}_i(\\d+)[sb]?\\.(?:jpe?g|png|gif))["'][^>]*title=["']([^"']*)["']`,
    "gi",
  );
  while ((m = looseRe.exec(html)) !== null) {
    const bigRaw = deckcardmaniaAbsoluteFileUrl(m[1]!);
    const big = bigRaw ? preferDeckcardmaniaBigImage(bigRaw) : null;
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
    rares: extractLabeledList(html, /Cartes\s+Rares/i, listOpts),
    holos: extractLabeledList(html, /Cartes\s+Holographiques/i, listOpts),
    checklist:
      line === "super-serie"
        ? extractDeckcardmaniaSuperSerieChecklist(html)
        : [],
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
      "Fiches set (pas un dump face-par-face). Packshot files/3/{idm}b.jpg + galerie _iNb.jpg. Listes Cartes Rares / Holographiques (D-###) pour JCC FR. Super Séries : checklist DB### → membership print_sets ssN (reprints partN). Faces sample uniquement quand title/alt nomme clairement une carte (Carte SP01 / D-###). DBS CG / Zenzu = hors corpus.",
    hub: DECKCARDMANIA_HUB,
    listed: sorted.length,
    albums: sorted,
  };
}

export function dbsJccDeckcardmaniaLedgerPath(): string {
  return dbsJccSyncedSourcePath("deckcardmania.json");
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
