/**
 * Naruto Carddass title / checklist sources — Manga-News, Carte de la semaine,
 * S6 FR printed ledger, Wayback site mirror helpers.
 */

import fs, {
  existsSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  mkdirSync,
} from "node:fs";
import path from "node:path";
import { httpGet } from "@/lib/http/httpClient";
import { dataRoot } from "@/lib/runtimeData";
import {
  appearanceSetsOf,
  appearanceValueForJson,
  canonicalizeNarutoPrintKey,
  loadNarutoAppearancesFile,
  mergeAppearanceValues,
  mintNarutoPrintKey,
  narutoCollectorKey,
  narutoDiskCardId,
  narutoLedgerNumber,
  narutoNumbersEqual,
  parseNarutoCollector,
  writeNarutoAppearancesFile,
  type NarutoLangAppearances,
} from "../identity";
import { narutoCuratedSourcesDir } from "../install/curated";
import { isImplausibleNarutoTitle } from "../pipeline";
import { NARUTO_PACK_ID } from "../indexStore";
import type { NarutoPrintRow, NarutoTitleRow } from "../indexStore";
import { cardTypeFromCollectorNumber } from "../parse/bandai";
import { waybackRawUrl } from "../parse/bandai";
import {
  MANGA_NEWS_DECKS,
  htmlToChecklistText,
  parseMangaNewsChecklistText,
} from "../parse/catalogues";
import type { MangaNewsChecklistLine } from "../parse/catalogues";
import { downloadRaw, runPool } from "../scrape/scrapeCards";

/**
 * Resolve FR titles/rarities from cached Manga-News deck HTML → print_titles rows.
 * Reads `staging/manga-news/` (no network).
 */



export type MangaNewsTitleHit = {
  number: string;
  name: string;
  rarity: string | null;
  /** Deck setHint that contributed this row, e.g. s1 */
  setHint: string;
};

function scoreName(name: string): number {
  // Prefer fuller MN names over truncated "…" endings.
  let s = name.length;
  if (/[.…]$/.test(name) || name.includes("...")) s -= 40;
  return s;
}

/**
 * Collapse MN lines for one collector number, preferring a matching setHint
 * then the fullest name.
 */
export function pickTitleForNumber(
  lines: readonly MangaNewsTitleHit[],
  preferSetHint?: string | null,
): { name: string; rarity: string | null; setHint: string } | null {
  if (lines.length === 0) return null;
  const preferred = preferSetHint
    ? lines.filter((l) => l.setHint === preferSetHint)
    : [];
  const pool = preferred.length ? preferred : [...lines];
  pool.sort((a, b) => scoreName(b.name) - scoreName(a.name));
  const best = pool[0]!;
  return { name: best.name, rarity: best.rarity, setHint: best.setHint };
}

function mangaNewsCacheDir(override?: string): string {
  return (
    override ?? path.join(dataRoot(), NARUTO_PACK_ID, "staging", "manga-news")
  );
}

export function loadMangaNewsTitleHitsFromCache(opts?: {
  cacheDir?: string;
}): MangaNewsTitleHit[] {
  const cacheDir = mangaNewsCacheDir(opts?.cacheDir);
  // Prefer staging; fall back to legacy checklist/ once during migration.
  const legacy = path.join(
    dataRoot(),
    NARUTO_PACK_ID,
    "checklist",
    "manga-news",
  );
  const dir = existsSync(cacheDir)
    ? cacheDir
    : existsSync(legacy)
      ? legacy
      : cacheDir;
  const out: MangaNewsTitleHit[] = [];

  for (const deck of MANGA_NEWS_DECKS) {
    if (deck.setHint === "ns") continue;
    const file = path.join(dir, `${deck.slug}.html`);
    if (!existsSync(file)) continue;
    const html = readFileSync(file, "utf8");
    const lines = parseMangaNewsChecklistText(htmlToChecklistText(html));
    for (const line of lines) {
      out.push(titleHitFromLine(line, deck.setHint));
    }
  }
  return out;
}

export function titleHitFromLine(
  line: MangaNewsChecklistLine,
  setHint: string,
): MangaNewsTitleHit {
  return {
    number: line.number,
    name: line.name,
    rarity: line.rarity === "unknown" ? null : line.rarity,
    setHint,
  };
}

export function titlesForPrints(
  prints: readonly NarutoPrintRow[],
  hits: readonly MangaNewsTitleHit[],
  lang = "fr",
): NarutoTitleRow[] {
  const byNumber = new Map<string, MangaNewsTitleHit[]>();
  for (const hit of hits) {
    const list = byNumber.get(hit.number) ?? [];
    list.push(hit);
    byNumber.set(hit.number, list);
  }

  const titles: NarutoTitleRow[] = [];
  for (const print of prints) {
    const list =
      byNumber.get(print.number) ??
      byNumber.get(narutoLedgerNumber(print.number) ?? "") ??
      [...byNumber.entries()].find(([n]) =>
        narutoNumbersEqual(n, print.number),
      )?.[1];
    if (!list?.length) continue;
    const picked = pickTitleForNumber(list, print.setCode);
    if (!picked) continue;
    titles.push({
      printKey: print.printKey,
      lang,
      fullName: picked.name,
      rarity: picked.rarity,
    });
  }
  return titles;
}

/**
 * Parse carddass.fr « archiveN_carte_semaine_*.html » (staging) into structured
 * card-number / name / date rows. Strategy spotlights — not tournament promos.
 */



export type CarteSemaineFeature = {
  week: number;
  date?: string;
  name: string;
  printedId: string;
  cardId: string;
  snippet?: string;
  page: string;
};

export type CarteSemaineWeek = {
  week: number;
  page: string;
  featured: CarteSemaineFeature[];
  alsoMentioned: string[];
};

export type CarteSemaineReport = {
  generatedAt: string;
  source: string;
  weekCount: number;
  featuredCount: number;
  uniqueFeaturedIds: string[];
  weeks: CarteSemaineWeek[];
};

const ID_RE = String.raw`((?:NI|TE|TA|CL|PR)[\s\-]?\d{1,3})`;

/** `NI-309` / `TE 263` → `ni309`. */
export function carteSemaineCardId(raw: string): string {
  const s = raw.replace(/[\s\-]/g, "").toLowerCase();
  const m = /^([a-z]+)(\d+)$/.exec(s);
  if (!m) return s;
  return `${m[1]}${Number(m[2]).toString().padStart(3, "0")}`;
}

function stripHtml(raw: string): string {
  return raw
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeEntities(raw: string): string {
  return raw
    .replace(/&agrave;/gi, "à")
    .replace(/&acirc;/gi, "â")
    .replace(/&eacute;/gi, "é")
    .replace(/&egrave;/gi, "è")
    .replace(/&ecirc;/gi, "ê")
    .replace(/&icirc;/gi, "î")
    .replace(/&ocirc;/gi, "ô")
    .replace(/&ugrave;/gi, "ù")
    .replace(/&ucirc;/gi, "û")
    .replace(/&ccedil;/gi, "ç")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&oeuml;|&ouml;/gi, "ö")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function cleanName(name: string): string {
  let n = name.replace(/\s+/g, " ").trim();
  n = n.replace(/^[\s\-–—:|]+/, "").replace(/[\s\-–—:|.,;:)\]}]+$/, "");
  // If the capture swallowed prior blurb, keep the last short title-like chunk.
  if (n.length > 70) {
    const parts = n.split(/(?<=[.!?])\s+/);
    n = parts[parts.length - 1] ?? n;
    n = n.replace(/\s+/g, " ").trim();
  }
  return n;
}

const FOCUS_STOP = String.raw`Cette|Voici|Son|Si|Une|Le|La|Les|Ce|Elle|Il|Avec|Ne|Pour|Grace|Grâce|De|Du|Des|En|Au|Aux|Sur|Par|Mais|Ou|Et|Car|Donc|Qui|Que|Dont|Quand`;

/** Push a focus card once (first win keeps the richer dated form). */
function pushFeature(
  featured: CarteSemaineFeature[],
  seen: Set<string>,
  entry: CarteSemaineFeature,
): void {
  if (seen.has(entry.cardId)) return;
  if (entry.name.length < 2) return;
  if (isImplausibleNarutoTitle(entry.name)) return;
  if (new RegExp(`^(?:${FOCUS_STOP})\\b`, "i").test(entry.name)) return;
  seen.add(entry.cardId);
  featured.push(entry);
}

function snippetAfter(
  plain: string,
  index: number,
  len = 220,
): string | undefined {
  const snip = plain
    .slice(index, index + len + 40)
    .replace(/\s+/g, " ")
    .trim();
  if (!snip) return undefined;
  return snip.length > len ? `${snip.slice(0, len - 1)}…` : snip;
}

/**
 * Guess set for a collector number when no disk art exists yet.
 * High S6 band used by cancelled-set previews on carddass.fr.
 */
export function guessSetForCarteSemaineId(cardId: string): string {
  const m = /^(ni|te|ta|cl|pr)(\d+)$/i.exec(cardId);
  if (!m) return "s6";
  const type = m[1]!.toLowerCase();
  const n = Number(m[2]);
  if (type === "pr") return "promo";
  if (type === "ni" && n >= 264) return "s6";
  if (type === "te" && n >= 236) return "s6";
  if (type === "ta" && n >= 238) return "s6";
  if (type === "ni" && n >= 201) return "s5";
  if (type === "te" && n >= 191) return "s5";
  if (type === "ta" && n >= 191) return "s5";
  return "unknown";
}

export function carteSemainePagesDir(root?: string): string {
  return path.join(
    root ?? path.join(dataRoot(), NARUTO_PACK_ID),
    "staging",
    "carddass-fr",
    "pages",
  );
}

export function parseCarteSemaineHtml(
  html: string,
  meta: { week: number; page: string },
): CarteSemaineWeek {
  const plain = stripHtml(decodeEntities(html));
  const featured: CarteSemaineFeature[] = [];
  const seen = new Set<string>();

  // Late archives: `15/12/2008 Mélodie du guerrier illusoire [TE-263]`
  const datedNameId = new RegExp(
    String.raw`(\d{2}/\d{2}/\d{4})\s+([^\[\]]{2,90}?)\s*\[${ID_RE}\]`,
    "gi",
  );
  for (const m of plain.matchAll(datedNameId)) {
    pushFeature(featured, seen, {
      week: meta.week,
      date: m[1],
      name: cleanName(m[2]!),
      printedId: m[3]!.toUpperCase().replace(/\s+/g, ""),
      cardId: carteSemaineCardId(m[3]!),
      snippet: snippetAfter(plain, m.index! + m[0].length),
      page: meta.page,
    });
  }

  // Mid archives: `27/06/2007 [TE-177] Arcanes Lunaires`
  const datedIdName = new RegExp(
    String.raw`(\d{2}/\d{2}/\d{4})\s*\[${ID_RE}\]\s+([^\[\]]{2,90}?)(?=\s*(?:\[|\d{2}/\d{2}/\d{4}|(?:${FOCUS_STOP})\b|$))`,
    "gi",
  );
  for (const m of plain.matchAll(datedIdName)) {
    pushFeature(featured, seen, {
      week: meta.week,
      date: m[1],
      name: cleanName(m[3]!),
      printedId: m[2]!.toUpperCase().replace(/\s+/g, ""),
      cardId: carteSemaineCardId(m[2]!),
      snippet: snippetAfter(plain, m.index! + m[0].length),
      page: meta.page,
    });
  }

  // Early archives: `[TE-122] L'art d'escalader`
  const undated = new RegExp(
    String.raw`\[${ID_RE}\]\s+([A-ZÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ0-9][^\[\]]{1,70}?)(?=\s*(?:\[|(?:${FOCUS_STOP})\b|$))`,
    "gi",
  );
  for (const m of plain.matchAll(undated)) {
    pushFeature(featured, seen, {
      week: meta.week,
      name: cleanName(m[2]!),
      printedId: m[1]!.toUpperCase().replace(/\s+/g, ""),
      cardId: carteSemaineCardId(m[1]!),
      snippet: snippetAfter(plain, m.index! + m[0].length),
      page: meta.page,
    });
  }

  const alsoMentioned = [
    ...new Set(
      [...plain.matchAll(new RegExp(String.raw`\[${ID_RE}\]`, "gi"))].map((m) =>
        carteSemaineCardId(m[1]!),
      ),
    ),
  ]
    .filter((id) => !seen.has(id))
    .sort();

  featured.sort((a, b) => {
    if (a.date && b.date) return b.date.localeCompare(a.date);
    if (a.date) return -1;
    if (b.date) return 1;
    return a.cardId.localeCompare(b.cardId);
  });

  return {
    week: meta.week,
    page: meta.page,
    featured,
    alsoMentioned,
  };
}

export function buildCarteSemaineReport(root?: string): CarteSemaineReport {
  const dir = carteSemainePagesDir(root);
  const weeks: CarteSemaineWeek[] = [];
  if (existsSync(dir)) {
    const files = readdirSync(dir)
      .map((name) => {
        const m = /^naruto__archiveN_carte_semaine_(\d+)\.html$/i.exec(name);
        if (!m) return null;
        return { week: Number(m[1]), page: name };
      })
      .filter((x): x is { week: number; page: string } => !!x)
      .sort((a, b) => a.week - b.week);

    for (const f of files) {
      const html = readFileSync(path.join(dir, f.page), "utf8");
      weeks.push(parseCarteSemaineHtml(html, f));
    }
  }

  const unique = [
    ...new Set(weeks.flatMap((w) => w.featured.map((e) => e.cardId))),
  ].sort();

  return {
    generatedAt: new Date().toISOString(),
    source: "staging/carddass-fr/pages/naruto__archiveN_carte_semaine_*.html",
    weekCount: weeks.length,
    featuredCount: weeks.reduce((n, w) => n + w.featured.length, 0),
    uniqueFeaturedIds: unique,
    weeks,
  };
}

export function formatCarteSemaineMarkdown(report: CarteSemaineReport): string {
  const lines: string[] = [
    "# Carddass.fr — archives « carte de la semaine »",
    "",
    `Généré : ${report.generatedAt.slice(0, 10)}`,
    "",
    `${report.featuredCount} focus / ${report.uniqueFeaturedIds.length} IDs uniques (${report.weekCount} pages).`,
    "",
  ];
  for (const w of report.weeks) {
    lines.push(`## Semaine ${w.week}`, "");
    if (!w.featured.length) {
      lines.push("_Aucun focus extrait._", "");
      continue;
    }
    for (const e of w.featured) {
      const when = e.date ? `${e.date} — ` : "";
      lines.push(`- ${when}**${e.name}** \`${e.cardId}\``);
      if (e.snippet) lines.push(`  > ${e.snippet}`);
    }
    if (w.alsoMentioned.length) {
      lines.push(
        "",
        `Mentions : ${w.alsoMentioned.map((id) => `\`${id}\``).join(", ")}`,
      );
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

export function writeCarteSemaineReport(root?: string): CarteSemaineReport {
  const pack = root ?? path.join(dataRoot(), NARUTO_PACK_ID);
  const report = buildCarteSemaineReport(pack);
  const logs = path.join(pack, "logs");
  mkdirSync(logs, { recursive: true });
  writeFileSync(
    path.join(logs, "carte-semaine.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  writeFileSync(
    path.join(logs, "carte-semaine.md"),
    formatCarteSemaineMarkdown(report),
  );
  return report;
}

/** Prefer first featured name per cardId (latest week wins if we scan high→low). */
export function carteSemaineNameByCardId(
  report: CarteSemaineReport,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const w of [...report.weeks].sort((a, b) => b.week - a.week)) {
    for (const e of w.featured) {
      if (
        !map.has(e.cardId) &&
        e.name.trim() &&
        !isImplausibleNarutoTitle(e.name)
      ) {
        map.set(e.cardId, e.name.trim());
      }
    }
  }
  return map;
}

/**
 * Fill missing FR titles from carte-de-la-semaine, and inject print stubs for
 * featured IDs still absent from the catalogue (S6 previews without art, etc.).
 */
export function mergeCarteSemaineIntoIndex(input: {
  prints: NarutoPrintRow[];
  titles: NarutoTitleRow[];
  report?: CarteSemaineReport;
  root?: string;
}): {
  prints: NarutoPrintRow[];
  titles: NarutoTitleRow[];
  named: string[];
  addedPrints: string[];
} {
  const report = input.report ?? buildCarteSemaineReport(input.root);
  const names = carteSemaineNameByCardId(report);
  const prints = [...input.prints];
  const titles = [...input.titles];
  const printByKey = new Map(
    prints.map((p) => [canonicalizeNarutoPrintKey(p.printKey), p]),
  );
  const titleByKey = new Map(
    titles
      .filter((t) => t.lang.toLowerCase() === "fr")
      .map((t) => [canonicalizeNarutoPrintKey(t.printKey), t]),
  );
  const named: string[] = [];
  const addedPrints: string[] = [];

  for (const [cardId, name] of names) {
    if (isImplausibleNarutoTitle(name)) continue;
    const wantKey = mintNarutoPrintKey(cardId);
    let rows = prints.filter(
      (p) =>
        (wantKey != null &&
          canonicalizeNarutoPrintKey(p.printKey) === wantKey) ||
        narutoNumbersEqual(p.number, cardId),
    );
    if (rows.length === 0) {
      const set = guessSetForCarteSemaineId(cardId);
      const printKey = mintNarutoPrintKey(cardId, set);
      if (!printKey || printByKey.has(printKey)) continue;
      const parsed = parseNarutoCollector(cardId);
      const print: NarutoPrintRow = {
        printKey,
        setCode: set,
        number: narutoDiskCardId(cardId) ?? cardId,
        cardType: cardTypeFromCollectorNumber(cardId),
        family: parsed?.family ?? null,
      };
      prints.push(print);
      printByKey.set(printKey, print);
      rows = [print];
      addedPrints.push(printKey);
    }
    for (const print of rows) {
      const existing = titleByKey.get(
        canonicalizeNarutoPrintKey(print.printKey),
      );
      if (!existing) {
        const title: NarutoTitleRow = {
          printKey: print.printKey,
          lang: "fr",
          fullName: name,
        };
        titles.push(title);
        titleByKey.set(canonicalizeNarutoPrintKey(print.printKey), title);
        named.push(print.printKey);
      } else if (!existing.fullName.trim()) {
        existing.fullName = name;
        named.push(print.printKey);
      }
    }
  }

  prints.sort((a, b) => a.printKey.localeCompare(b.printKey));
  return { prints, titles, named, addedPrints };
}

/**
 * Cartes S6 physiquement imprimées en français alors que le retail (boosters /
 * starters) a été annulé. Le registre `sets.json` reste `released: false`.
 */


type S6FrPrintedFile = {
  retailFr?: boolean;
  cards?: readonly { number?: string }[];
  kanaBlisterS5Reprints?: readonly { number?: string }[];
};

let keys: Set<string> | null = null;
let diskNumbers: string[] | null = null;

/** Formes disque pour un id ledger (`ta221` → ta221 / ta0221 / …). */
function numberForms(id: string): string[] {
  const raw = id.trim().toLowerCase();
  const m = /^(ni|te|ta|cl|pr)(\d+)$/i.exec(raw);
  if (!m) return raw ? [raw] : [];
  const type = m[1]!.toLowerCase();
  const n = Number.parseInt(m[2]!, 10);
  if (!Number.isFinite(n) || n < 0) return [raw];
  return [
    ...new Set([
      `${type}${n}`,
      `${type}${String(n).padStart(3, "0")}`,
      `${type}${String(n).padStart(4, "0")}`,
    ]),
  ];
}

function loadFile(): S6FrPrintedFile {
  return JSON.parse(
    readFileSync(
      path.join(narutoCuratedSourcesDir(), "s6-fr-printed.json"),
      "utf8",
    ),
  ) as S6FrPrintedFile;
}

/** Inédites S6 + reprints S5 de l'opération manga Kana (15 tomes). */
function ledgerNumbers(file: S6FrPrintedFile): string[] {
  const out: string[] = [];
  for (const row of file.cards ?? []) {
    const n = row.number?.trim();
    if (n) out.push(n);
  }
  for (const row of file.kanaBlisterS5Reprints ?? []) {
    const n = row.number?.trim();
    if (n) out.push(n);
  }
  return out;
}

function loadKeys(): Set<string> {
  if (keys) return keys;
  const out = new Set<string>();
  try {
    for (const number of ledgerNumbers(loadFile())) {
      const key = narutoCollectorKey(number);
      if (key) out.add(key);
    }
  } catch {
    /* ledger absent */
  }
  keys = out;
  return out;
}

export function resetNarutoS6FrPrintedCache(): void {
  keys = null;
  diskNumbers = null;
}

export function narutoS6FrPrintedNumbers(): Set<string> {
  return loadKeys();
}

/** Formes `prints.number` / disque pour élargir la membership S6 FR. */
export function narutoS6FrPrintedDiskNumbers(): string[] {
  if (diskNumbers) return diskNumbers;
  const out = new Set<string>();
  try {
    for (const raw of ledgerNumbers(loadFile())) {
      if (!raw) continue;
      for (const form of numberForms(raw)) out.add(form.toLowerCase());
      const disk = narutoDiskCardId(raw);
      if (disk) out.add(disk.toLowerCase());
    }
  } catch {
    /* ledger absent */
  }
  diskNumbers = [...out];
  return diskNumbers;
}

export function isNarutoS6FrPrintedNumber(raw: string): boolean {
  const key = narutoCollectorKey(raw);
  return key != null && loadKeys().has(key);
}

/**
 * Opération manga Kana (15) + inédites DVD → appearances FR `s6` (sqlite).
 * Les reprints gardent aussi `s5` (multi-set, comme NI-049).
 * @returns nombre de cartes FR dont la liste de sets a changé.
 */
export function syncNarutoS6FrPrintedAppearances(packRoot: string): number {
  const existing = loadNarutoAppearancesFile(packRoot);
  const appearances: Record<string, NarutoLangAppearances> = {
    ...(existing?.appearances ?? {}),
  };
  const generatedAt = existing?.generatedAt ?? new Date().toISOString();

  let changed = 0;
  try {
    for (const raw of ledgerNumbers(loadFile())) {
      if (!raw) continue;
      const diskId =
        narutoDiskCardId(raw) ??
        numberForms(raw).find((form) => /^[a-z]+\d{4}/.test(form)) ??
        numberForms(raw)[0];
      if (!diskId) continue;
      const langs = appearances[diskId] ?? {};
      const before = appearanceSetsOf(langs.fr).join(",");
      const merged = mergeAppearanceValues(langs.fr, "s6");
      langs.fr = appearanceValueForJson(merged);
      appearances[diskId] = langs;
      if (appearanceSetsOf(langs.fr).join(",") !== before) changed += 1;
    }
  } catch {
    return 0;
  }

  writeNarutoAppearancesFile(packRoot, {
    generatedAt,
    appearances,
  });
  return changed;
}

/**
 * Shared Wayback CDX → staging mirror helpers for official Naruto sites.
 * Staging only — never writes under `cards/`.
 */



export const WAYBACK_UA = "PlacarrNarutoScrape/1.0 (local collection)";

export type CdxRow = {
  timestamp: string;
  original: string;
  mimetype: string;
  statuscode: string;
};

export type MirrorHit = {
  timestamp: string;
  original: string;
  mimetype: string;
  /** Path under the staging root (posix-ish, lowercased). */
  relPath: string;
};

export function canonicalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.port === "80" || u.port === "443") u.port = "";
    u.hash = "";
    return u.toString().replace(/\/$/, "").toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Filesystem-safe relative path from an archived URL.
 * Query strings become `__k=v_k2=v2` before the extension (or + `.html`).
 */
export function stagingRelFromUrl(
  original: string,
  opts: {
    /** Keep only the path after this prefix (e.g. `/naruto/`). */
    stripPathPrefix?: string;
    /** Prepend host folder (`www.carddas.com/…`). */
    includeHost?: boolean;
  } = {},
): string | null {
  let u: URL;
  try {
    u = new URL(original);
  } catch {
    return null;
  }
  let pathname = decodeURIComponent(u.pathname).replace(/\\/g, "/");
  if (pathname.includes("%7c") || /archive-url=/i.test(pathname)) return null;

  const strip = opts.stripPathPrefix;
  if (strip) {
    const lower = pathname.toLowerCase();
    const needle = strip.toLowerCase();
    const idx = lower.indexOf(needle);
    if (idx < 0) return null;
    pathname = pathname.slice(idx + strip.length);
  }
  pathname = pathname.replace(/^\/+/, "");
  if (!pathname) pathname = "index.html";

  if (u.search && u.search.length > 1) {
    const q = u.search
      .slice(1)
      .replace(/[^a-zA-Z0-9._=-]+/g, "_")
      .slice(0, 180);
    const ext = path.posix.extname(pathname);
    if (ext) {
      pathname = `${pathname.slice(0, -ext.length)}__${q}${ext}`;
    } else {
      pathname = `${pathname}__${q}.html`;
    }
  }

  const host = normalizeArchiveHost(u.hostname);
  const rel = opts.includeHost ? path.posix.join(host, pathname) : pathname;
  return rel.toLowerCase();
}

/** Prefer `www.` so carddas.com / www.carddas.com do not fork the mirror. */
export function normalizeArchiveHost(hostname: string): string {
  const h = hostname.toLowerCase().replace(/:\d+$/, "");
  if (h === "carddas.com" || h === "www.carddas.com") return "www.carddas.com";
  if (h === "carddass.com" || h === "www.carddass.com")
    return "www.carddass.com";
  if (h === "bandaicg.com" || h === "www.bandaicg.com")
    return "www.bandaicg.com";
  return h.startsWith("www.") ? h : h;
}

export async function fetchCdxRows(
  cdxUrl: string,
  label: string,
): Promise<CdxRow[]> {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= 5; attempt++) {
    const started = Date.now();
    console.log(`CDX ${label} attempt ${attempt}/5…`);
    try {
      const response = await httpGet<string[][]>(cdxUrl, {
        headers: { "user-agent": WAYBACK_UA },
        // Le CDX Wayback met souvent 20–90s à répondre.
        timeout: 180_000,
        validateStatus: () => true,
      });
      if (response.status < 200 || response.status >= 300) {
        throw new Error(`CDX HTTP ${response.status}`);
      }
      const raw = response.data;
      const rows: CdxRow[] = [];
      for (const row of raw) {
        if (!row[0] || row[0] === "timestamp") continue;
        rows.push({
          timestamp: row[0]!,
          original: row[1]!,
          mimetype: (row[2] || "").toLowerCase(),
          statuscode: row[3] || "",
        });
      }
      console.log(
        `CDX ${label} done in ${Math.round((Date.now() - started) / 1000)}s → rows=${rows.length}`,
      );
      return rows;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const wait = attempt * 3_000;
      console.warn(
        `CDX ${label} attempt ${attempt}/5 failed: ${lastError.message} — retry in ${wait}ms`,
      );
      await sleep(wait);
    }
  }
  throw lastError ?? new Error(`CDX ${label} failed`);
}

/** Latest capture per canonical URL. */
export function dedupeLatest(rows: readonly CdxRow[]): CdxRow[] {
  const byCanon = new Map<string, CdxRow>();
  for (const row of rows) {
    if (!row.original) continue;
    const canon = canonicalizeUrl(row.original);
    const prev = byCanon.get(canon);
    if (!prev || row.timestamp > prev.timestamp) byCanon.set(canon, row);
  }
  return [...byCanon.values()];
}

export async function downloadMirrorHits(
  hits: readonly MirrorHit[],
  stagingDir: string,
  opts: {
    concurrency: number;
    delayMs: number;
    force: boolean;
    label: string;
  },
): Promise<{ ok: number; skip: number; fail: number }> {
  let ok = 0;
  let skip = 0;
  let fail = 0;
  let done = 0;
  const total = hits.length;
  const progressEvery = Math.max(10, Math.floor(total / 50) || 1);

  await runPool(hits, opts.concurrency, opts.delayMs, async (hit) => {
    const dest = path.join(stagingDir, hit.relPath);
    const url = waybackRawUrl(hit.timestamp, hit.original);
    const result = await downloadRaw(url, dest, !opts.force);
    if (result === "ok") ok += 1;
    else if (result === "skip") skip += 1;
    else fail += 1;
    done += 1;
    if (
      done === 1 ||
      done === total ||
      done % progressEvery === 0 ||
      result === "fail"
    ) {
      console.log(
        `${opts.label} ${done}/${total} (ok=${ok} skip=${skip} fail=${fail}) · ${hit.relPath}${result === "fail" ? " FAIL" : ""}`,
      );
    }
  });

  return { ok, skip, fail };
}

export function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}
