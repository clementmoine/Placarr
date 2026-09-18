/**
 * Action module: pipeline/coverage.ts
 * Merged from: buildApacheIndex.ts, buildCompleteness.ts, buildCoverageChecklist.ts
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import type { CardsIndexV1 } from "@/effects/cardsIndex";
import { httpGet } from "@/lib/http/httpClient";
import { dataRoot } from "@/lib/runtimeData";
import universe from "../curated/sources/cardcheckbox-jp.json";
import { NARUTO_PACK_ID, apacheIndexPath } from "../identity";
import {
  MANGA_NEWS_DECKS,
  htmlToChecklistText,
  mangaNewsDeckImageUrl,
  normalizeCardNumber,
  parseMangaNewsChecklistText,
  uniqueNumbers,
  type MangaNewsChecklistLine,
  type MangaNewsDeckMeta,
} from "../parse/catalogues";

export { apacheIndexPath };

// --- from buildApacheIndex.ts ---

/**
 * Rebuild `data/naruto/carddass/logs/apache-index.json` from Wayback Apache Index-of
 * HTML under `data/naruto/carddass/staging/carddass-fr/pages/`.
 *
 * Prefer autoindex pages over CDX: they list files that existed on the server
 * even when Wayback never captured the JPEG itself. Regenerable → `data/`, not
 * `curated/`.
 *
 *   Catalogue Sync --only sources
 */



const INDEX_TITLE_RE =
  /<title>\s*Index of\s+(\/naruto\/images(?:\/[^<\s]*)?)\s*<\/title>/i;
const HREF_FILE_RE = /href="([^"?#]+\.(?:jpe?g|gif|png|pdf|webp))"/gi;

export type ApacheIndexDirectory = {
  timestamp?: string;
  files: string[];
};

export type ApacheIndexDoc = {
  source: string;
  note: string;
  generatedAt: string;
  directories: Record<string, ApacheIndexDirectory>;
};

function pagesDir(): string {
  return path.join(
    dataRoot(),
    NARUTO_PACK_ID,
    "staging",
    "carddass-fr",
    "pages",
  );
}

function normalizeDir(raw: string): string {
  let dir = decodeURIComponent(raw.trim());
  if (!dir.startsWith("/")) dir = `/${dir}`;
  if (!dir.endsWith("/")) dir = `${dir}/`;
  return dir;
}

function decodeHrefName(href: string): string | null {
  const cleaned = href.trim();
  if (!cleaned || cleaned.startsWith("?") || cleaned.startsWith("/")) {
    // Absolute site paths are parent/dir links — skip; files are relative.
    if (cleaned.startsWith("/")) return null;
  }
  try {
    return decodeURIComponent(cleaned);
  } catch {
    return cleaned;
  }
}

/** Parse one Index-of HTML body → directory key + file basenames. */
export function parseApacheIndexHtml(html: string): {
  dir: string;
  files: string[];
} | null {
  const title = INDEX_TITLE_RE.exec(html);
  if (!title?.[1]) return null;
  const dir = normalizeDir(title[1]);
  const files = new Set<string>();
  for (const match of html.matchAll(HREF_FILE_RE)) {
    const name = decodeHrefName(match[1] ?? "");
    if (!name) continue;
    // Skip lock / junk siblings; keep .LCK out of attestation.
    if (/\.lck$/i.test(name)) continue;
    const base = path.posix.basename(name);
    if (base && base !== name && name.includes("/")) continue;
    files.add(base);
  }
  return { dir, files: [...files].sort((a, b) => a.localeCompare(b, "en")) };
}

function walkHtmlFiles(root: string): string[] {
  if (!existsSync(root)) return [];
  const out: string[] = [];
  const stack = [root];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const name of readdirSync(cur)) {
      if (name.startsWith(".")) continue;
      const full = path.join(cur, name);
      let st;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) stack.push(full);
      else if (/\.html?$/i.test(name)) out.push(full);
    }
  }
  return out;
}

function cdxTimestampsByDir(): Map<string, string> {
  const cdxPath = path.join(
    dataRoot(),
    NARUTO_PACK_ID,
    "staging",
    "carddass-fr",
    "cdx.json",
  );
  const map = new Map<string, string>();
  if (!existsSync(cdxPath)) return map;
  try {
    const rows = JSON.parse(readFileSync(cdxPath, "utf8")) as unknown;
    if (!Array.isArray(rows)) return map;
    for (const row of rows) {
      if (!Array.isArray(row) || row.length < 3) continue;
      const timestamp = String(row[1] ?? "");
      const original = String(row[2] ?? "");
      if (!/^\d{14}$/.test(timestamp)) continue;
      let pathname = "";
      try {
        pathname = new URL(original).pathname;
      } catch {
        continue;
      }
      if (!pathname.includes("/naruto/images")) continue;
      // Directory listing captures end with / or lack a file extension.
      const isDir =
        pathname.endsWith("/") || !path.posix.basename(pathname).includes(".");
      if (!isDir) continue;
      const dir = normalizeDir(pathname);
      const prev = map.get(dir);
      if (!prev || timestamp > prev) map.set(dir, timestamp);
    }
  } catch {
    return map;
  }
  return map;
}

export function buildApacheIndexFromStaging(): ApacheIndexDoc {
  const directories: Record<string, ApacheIndexDirectory> = {};
  const stamps = cdxTimestampsByDir();

  for (const file of walkHtmlFiles(pagesDir())) {
    const html = readFileSync(file, "utf8");
    const parsed = parseApacheIndexHtml(html);
    if (!parsed) continue;
    const existing = directories[parsed.dir];
    if (!existing || parsed.files.length >= existing.files.length) {
      directories[parsed.dir] = {
        ...(stamps.get(parsed.dir)
          ? { timestamp: stamps.get(parsed.dir) }
          : existing?.timestamp
            ? { timestamp: existing.timestamp }
            : {}),
        files: parsed.files,
      };
    }
  }

  return {
    source: "Apache autoindex of carddass.fr /naruto/images/ (Wayback)",
    note: "Authoritative list of files that EXISTED on the server, including files Wayback never downloaded. Regenerated from staging/carddass-fr/pages Index-of HTML.",
    generatedAt: new Date().toISOString(),
    directories,
  };
}

export function writeApacheIndexSource(opts?: { dryRun?: boolean }): {
  path: string;
  directories: number;
  files: number;
  dryRun: boolean;
} {
  const doc = buildApacheIndexFromStaging();
  const dest = apacheIndexPath();
  const files = Object.values(doc.directories).reduce(
    (n, d) => n + d.files.length,
    0,
  );
  if (!opts?.dryRun) {
    mkdirSync(path.dirname(dest), { recursive: true });
    writeFileSync(dest, `${JSON.stringify(doc, null, 1)}\n`, "utf8");
  }
  return {
    path: dest,
    directories: Object.keys(doc.directories).length,
    files,
    dryRun: Boolean(opts?.dryRun),
  };
}

export function runNarutoSources(opts?: { dryRun?: boolean }): void {
  console.log(`── Naruto derived sources${opts?.dryRun ? " (dry run)" : ""}`);
  const result = writeApacheIndexSource(opts);
  console.log(
    `   apache-index.json  ${result.directories} dirs / ${result.files} files` +
      `${opts?.dryRun ? "" : ` → ${result.path}`}`,
  );
  console.log(
    "   (curated ledgers: checklist / names / sets / coleka — not automated)",
  );
}

// --- from buildCompleteness.ts ---

/**
 * Is the catalogue complete — and how do we know?
 *
 * The face coverage we kept quoting answers one axis out of four. A card is a
 * row of facts, and each can be present or missing independently:
 *
 *   numéro   the print exists at all, inside the numbering Bandai published
 *   titre    it has a name in that locale
 *   image    it has a face on disk
 *   détail   gameplay data (cost, combat, traits, effect) — JA only for now
 *
 * This builds the four-axis view per locale, plus the provenance of every face
 * (which source served it) so the report says *where* the catalogue comes from,
 * not only how full it is.
 *
 * The published numbering comes from `cardcheckbox-jp.json`, the only source
 * that states Bandai's own per-release ranges. It bounds the JP line only;
 * FR / IT / EN have no equivalent published list, so their "numéro" axis is
 * reported against what the catalogue holds, and flagged as such.
 */



export type CompletenessAxis = {
  held: number;
  missing: number;
  pct: string;
};

export type LocaleCompleteness = {
  prints: number;
  /** A face on disk. */
  image: CompletenessAxis;
  /** A name in this locale. */
  title: CompletenessAxis;
  /** Gameplay facts (JA only today). */
  detail: CompletenessAxis;
  /** Faces by source — where this locale's images actually come from. */
  faceSources: Record<string, number>;
  /** Prints holding an image but no title, and the reverse. */
  imageWithoutTitle: number;
  titleWithoutImage: number;
};

export type PublishedNumbering = {
  family: string;
  max: number;
  held: number;
  missing: number;
  missingNumbers: number[];
};

export type NarutoCompleteness = {
  version: 1;
  generatedAt: string;
  prints: number;
  locales: Record<string, LocaleCompleteness>;
  /** JP only: what Bandai published vs what the catalogue holds. */
  publishedNumbering: PublishedNumbering[];
  publishedTotal: { max: number; held: number; missing: number };
};

const FAMILY_MAX: ReadonlyArray<readonly [string, string, number]> = [
  ["ni", "忍", universe.universe.ni.max],
  ["te", "術", universe.universe.te.max],
  ["ta", "作", universe.universe.ta.max],
  ["cl", "依", universe.universe.cl.max],
  ["ki", "騎", universe.universe.ki.max],
];

function pct(held: number, total: number): string {
  if (total <= 0) return "—";
  return `${((held / total) * 100).toFixed(1)}%`;
}

function axis(held: number, total: number): CompletenessAxis {
  return { held, missing: Math.max(0, total - held), pct: pct(held, total) };
}

/** `art.drive.webp` → `drive`; anything unnamed stays `legacy`. */
export function faceSourceOfFilename(file: string): string {
  const m = /^art\.([a-z0-9]+)\./i.exec(file);
  return m ? m[1]!.toLowerCase() : "legacy";
}

type Counters = { art: number; name: number; detail: number };

export function buildNarutoCompleteness(
  index: CardsIndexV1,
  facts: { cards: Record<string, unknown> } | null,
): NarutoCompleteness {
  const locales: Record<string, LocaleCompleteness> = {};
  const counters = new Map<string, Counters>();
  const held: Record<string, Set<number>> = {};
  for (const [prefix] of FAMILY_MAX) held[prefix] = new Set();

  for (const card of Object.values(index.cards)) {
    const numbered = /^(ni|te|ta|cl|ki)(\d+)$/.exec(card.card ?? "");
    if (numbered) held[numbered[1]!]?.add(Number(numbered[2]));

    for (const [rawLang, slot] of Object.entries(card.langs ?? {})) {
      const lang = rawLang.toLowerCase();
      const bucket = (locales[lang] ??= {
        prints: 0,
        image: axis(0, 0),
        title: axis(0, 0),
        detail: axis(0, 0),
        faceSources: {},
        imageWithoutTitle: 0,
        titleWithoutImage: 0,
      });
      const count = counters.get(lang) ?? { art: 0, name: 0, detail: 0 };
      counters.set(lang, count);

      bucket.prints += 1;
      const hasArt = Boolean(slot.art);
      const hasName = Boolean((slot.name ?? "").trim());
      if (hasArt) {
        const source = faceSourceOfFilename(slot.art!);
        bucket.faceSources[source] = (bucket.faceSources[source] ?? 0) + 1;
        count.art += 1;
      }
      if (hasName) count.name += 1;
      if (hasArt && !hasName) bucket.imageWithoutTitle += 1;
      if (!hasArt && hasName) bucket.titleWithoutImage += 1;
      if (lang === "ja" && facts?.cards?.[card.card ?? ""]) count.detail += 1;
    }
  }

  for (const [lang, bucket] of Object.entries(locales)) {
    const count = counters.get(lang) ?? { art: 0, name: 0, detail: 0 };
    bucket.image = axis(count.art, bucket.prints);
    bucket.title = axis(count.name, bucket.prints);
    bucket.detail = axis(count.detail, bucket.prints);
  }

  const publishedNumbering: PublishedNumbering[] = FAMILY_MAX.map(
    ([prefix, printed, max]) => {
      const have = held[prefix] ?? new Set<number>();
      const missingNumbers: number[] = [];
      for (let n = 1; n <= max; n += 1) {
        if (!have.has(n)) missingNumbers.push(n);
      }
      return {
        family: `${printed} (${prefix})`,
        max,
        held: max - missingNumbers.length,
        missing: missingNumbers.length,
        missingNumbers,
      };
    },
  );
  const publishedMax = publishedNumbering.reduce((n, r) => n + r.max, 0);
  const publishedHeld = publishedNumbering.reduce((n, r) => n + r.held, 0);

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    prints: Object.keys(index.cards).length,
    locales,
    publishedNumbering,
    publishedTotal: {
      max: publishedMax,
      held: publishedHeld,
      missing: publishedMax - publishedHeld,
    },
  };
}

export function renderCompletenessMarkdown(report: NarutoCompleteness): string {
  const lines: string[] = [];
  lines.push("# Naruto — complétude du catalogue", "");
  lines.push(`Généré : ${report.generatedAt}`, "");
  lines.push(
    "Quatre axes, indépendants : un tirage peut avoir un numéro sans titre,",
    "un titre sans image, une image sans détail de jeu.",
    "",
  );
  lines.push("## Par locale", "");
  lines.push(
    "| Locale | Tirages | Image | Titre | Détail de jeu | Image sans titre | Titre sans image |",
    "| ------ | ------: | ----: | ----: | ------------: | ---------------: | ---------------: |",
  );
  const order = ["fr", "en", "ja", "it"];
  const rank = (lang: string) => {
    const i = order.indexOf(lang);
    return i < 0 ? order.length : i;
  };
  const langs = Object.keys(report.locales).sort(
    (a, b) => rank(a) - rank(b) || a.localeCompare(b),
  );
  for (const lang of langs) {
    const l = report.locales[lang]!;
    lines.push(
      `| **${lang.toUpperCase()}** | ${l.prints} | ${l.image.held} (${l.image.pct}) | ${l.title.held} (${l.title.pct}) | ${l.detail.held} (${l.detail.pct}) | ${l.imageWithoutTitle} | ${l.titleWithoutImage} |`,
    );
  }
  lines.push("");
  lines.push("## Numérotation publiée (JP — cardcheckbox)", "");
  lines.push(
    "| Famille | Publié | Tenus | Absents |",
    "| ------- | -----: | ----: | ------: |",
  );
  for (const row of report.publishedNumbering) {
    lines.push(`| ${row.family} | ${row.max} | ${row.held} | ${row.missing} |`);
  }
  lines.push(
    `| **total** | **${report.publishedTotal.max}** | **${report.publishedTotal.held}** | **${report.publishedTotal.missing}** |`,
    "",
  );
  lines.push("## D'où viennent les faces", "");
  for (const lang of langs) {
    const l = report.locales[lang]!;
    const entries = Object.entries(l.faceSources).sort((a, b) => b[1] - a[1]);
    if (!entries.length) continue;
    lines.push(
      `- **${lang.toUpperCase()}** : ${entries.map(([s, n]) => `${s} ${n}`).join(", ")}`,
    );
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

export function writeNarutoCompleteness(root?: string): {
  jsonPath: string;
  mdPath: string;
  report: NarutoCompleteness;
} {
  const packRoot = path.join(root ?? dataRoot(), NARUTO_PACK_ID);
  const index = JSON.parse(
    readFileSync(path.join(packRoot, "cards-index.json"), "utf8"),
  ) as CardsIndexV1;
  const factsPath = path.join(packRoot, "facts-ja.json");
  const facts = existsSync(factsPath)
    ? (JSON.parse(readFileSync(factsPath, "utf8")) as {
        cards: Record<string, unknown>;
      })
    : null;
  const report = buildNarutoCompleteness(index, facts);
  const logs = path.join(packRoot, "logs");
  mkdirSync(logs, { recursive: true });
  const jsonPath = path.join(logs, "completeness.json");
  const mdPath = path.join(logs, "completeness.md");
  writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeFileSync(mdPath, renderCompletenessMarkdown(report), "utf8");
  return { jsonPath, mdPath, report };
}

// --- from buildCoverageChecklist.ts ---

/**
 * Cross-source coverage checklist for Naruto CACG FR.
 *
 * Anchors:
 * - Manga-News deck goodies (S1–S5 checklists + Nouvelle Série note)
 * - Local cards-index / disk (Wayback carddass.fr dump)
 *
 *   Catalogue Sync --only checklist
 *     HTML decks + photos (`staging/manga-news/images/`). Pas un grab manuel.
 */



export type CoverageSource = "manga-news" | "local-index";

export type CoverageCardRow = {
  number: string;
  type: string;
  /** Sets where local index has art for this collector number */
  localSets: string[];
  /** Deck setHints that list this number */
  mangaNewsDecks: string[];
  names: string[];
  rarities: string[];
  inMangaNews: boolean;
  inLocal: boolean;
};

export type CoverageReport = {
  generatedAt: string;
  scope: string;
  decks: Array<{
    slug: string;
    setHint: string;
    url: string;
    fetched: boolean;
    lineCount: number;
    uniqueNumbers: number;
    note?: string;
  }>;
  summary: {
    mangaNewsUnique: number;
    localUnique: number;
    both: number;
    mangaNewsOnly: number;
    localOnly: number;
    localPromoExtra: number;
    localS6Extra: number;
  };
  mangaNewsOnly: string[];
  localOnly: string[];
  /** Local cards whose set is promo / s6 (expected outside MN S1–5) */
  localOutsideS1to5: string[];
  cards: CoverageCardRow[];
};

const USER_AGENT =
  "PlacarrNarutoChecklist/1.0 (+https://github.com/local; research)";

function packRoot(): string {
  return path.join(dataRoot(), NARUTO_PACK_ID);
}

/** Raw Manga-News HTML — same role as pokemon `staging/cdn-manifests`. */
function mangaNewsStagingDir(): string {
  return path.join(packRoot(), "staging", "manga-news");
}

/** Coverage reports — same role as pack `logs/`. */
function logsDir(): string {
  return path.join(packRoot(), "logs");
}

/**
 * Legacy `data/naruto/checklist/` → staging (HTML) + logs (coverage).
 */
export function ensureNarutoChecklistLayout(): void {
  const legacy = path.join(packRoot(), "checklist");
  if (!existsSync(legacy)) return;
  const legacyMn = path.join(legacy, "manga-news");
  const stagedMn = mangaNewsStagingDir();
  if (existsSync(legacyMn)) {
    mkdirSync(stagedMn, { recursive: true });
    for (const name of readdirSync(legacyMn)) {
      if (name === ".DS_Store") continue;
      const src = path.join(legacyMn, name);
      const dest = path.join(stagedMn, name);
      if (!existsSync(dest)) renameSync(src, dest);
    }
  }
  mkdirSync(logsDir(), { recursive: true });
  for (const name of ["coverage.json", "coverage.md"] as const) {
    const src = path.join(legacy, name);
    const dest = path.join(logsDir(), name);
    if (existsSync(src) && !existsSync(dest)) renameSync(src, dest);
  }
  try {
    rmSync(legacy, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

function loadLocalNumbers(): {
  byNumber: Map<string, string[]>;
  promo: string[];
  s6: string[];
} {
  const indexPath = path.join(packRoot(), "cards-index.json");
  if (!existsSync(indexPath)) {
    throw new Error(`Missing ${indexPath} — run scrape / index first`);
  }
  const index = JSON.parse(readFileSync(indexPath, "utf8")) as CardsIndexV1;
  const byNumber = new Map<string, string[]>();
  const promo: string[] = [];
  const s6: string[] = [];

  for (const [printKey, entry] of Object.entries(index.cards)) {
    const raw = String(entry.card);
    const base = raw.replace(/-cdf$/i, "");
    const m = base.match(/^(ni|te|ta|cl)(\d+)$/i);
    if (!m) continue;
    const number = normalizeCardNumber(
      m[1]!.toLowerCase() as "ni" | "te" | "ta" | "cl",
      m[2]!,
    );
    const sets = byNumber.get(number) ?? [];
    if (!sets.includes(entry.set)) sets.push(entry.set);
    byNumber.set(number, sets);

    if (entry.set === "promo" || printKey.includes(":promo-")) {
      promo.push(number);
    }
    if (entry.set === "s6") s6.push(number);
  }

  return { byNumber, promo: [...new Set(promo)], s6: [...new Set(s6)] };
}

async function fetchDeckHtml(
  deck: MangaNewsDeckMeta,
  cacheDir: string,
  force: boolean,
): Promise<{ html: string; fromCache: boolean }> {
  mkdirSync(cacheDir, { recursive: true });
  const cachePath = path.join(cacheDir, `${deck.slug}.html`);
  if (!force && existsSync(cachePath)) {
    return { html: readFileSync(cachePath, "utf8"), fromCache: true };
  }
  const res = await httpGet<string>(deck.url, {
    headers: { "user-agent": USER_AGENT, accept: "text/html" },
    responseType: "text",
    validateStatus: (status) => status === 200,
  });
  const html = typeof res.data === "string" ? res.data : String(res.data);
  writeFileSync(cachePath, html, "utf8");
  return { html, fromCache: false };
}

function deckImageDest(cacheDir: string, imageUrl: string): string {
  const name = path.basename(new URL(imageUrl).pathname);
  return path.join(cacheDir, "images", name);
}

async function fetchDeckImage(
  html: string,
  cacheDir: string,
  force: boolean,
): Promise<string | null> {
  const imageUrl = mangaNewsDeckImageUrl(html);
  if (!imageUrl) return null;
  const dest = deckImageDest(cacheDir, imageUrl);
  if (!force && existsSync(dest)) return dest;
  const res = await httpGet<ArrayBuffer>(imageUrl, {
    headers: { "user-agent": USER_AGENT, accept: "image/*" },
    responseType: "arraybuffer",
    validateStatus: (status) => status === 200,
  });
  mkdirSync(path.dirname(dest), { recursive: true });
  writeFileSync(dest, Buffer.from(res.data));
  return dest;
}

export { htmlToChecklistText } from "../parse/catalogues";

export async function buildNarutoCoverageChecklist(opts?: {
  forceFetch?: boolean;
  /** Include Nouvelle Série deck fetch (usually no lines). */
  includeNouvelleSerie?: boolean;
}): Promise<CoverageReport> {
  const forceFetch = opts?.forceFetch === true;
  const includeNs = opts?.includeNouvelleSerie !== false;
  const cacheDir = mangaNewsStagingDir();
  ensureNarutoChecklistLayout();
  mkdirSync(cacheDir, { recursive: true });
  const local = loadLocalNumbers();

  const decksMeta = MANGA_NEWS_DECKS.filter(
    (d) => includeNs || d.setHint !== "ns",
  );

  const deckLines = new Map<string, MangaNewsChecklistLine[]>();
  const deckSummaries: CoverageReport["decks"] = [];

  for (const deck of decksMeta) {
    try {
      const { html } = await fetchDeckHtml(deck, cacheDir, forceFetch);
      await fetchDeckImage(html, cacheDir, forceFetch);
      const lines = parseMangaNewsChecklistText(htmlToChecklistText(html));
      deckLines.set(deck.setHint, lines);
      deckSummaries.push({
        slug: deck.slug,
        setHint: deck.setHint,
        url: deck.url,
        fetched: true,
        lineCount: lines.length,
        uniqueNumbers: uniqueNumbers(lines).length,
        note:
          deck.setHint === "ns" && lines.length === 0
            ? "Page MN sans liste NI/TE/TA (~118 cartes annoncées) — hors dump carddass.fr S1–6"
            : undefined,
      });
    } catch (err) {
      deckSummaries.push({
        slug: deck.slug,
        setHint: deck.setHint,
        url: deck.url,
        fetched: false,
        lineCount: 0,
        uniqueNumbers: 0,
        note: err instanceof Error ? err.message : String(err),
      });
    }
  }

  type Acc = {
    number: string;
    type: string;
    mangaNewsDecks: Set<string>;
    names: Set<string>;
    rarities: Set<string>;
  };

  const universe = new Map<string, Acc>();

  function touch(number: string): Acc {
    let row = universe.get(number);
    if (!row) {
      const type = number.slice(0, 2);
      row = {
        number,
        type,
        mangaNewsDecks: new Set(),
        names: new Set(),
        rarities: new Set(),
      };
      universe.set(number, row);
    }
    return row;
  }

  for (const [setHint, lines] of deckLines) {
    if (setHint === "ns") continue; // no lines expected
    for (const line of lines) {
      const row = touch(line.number);
      row.mangaNewsDecks.add(setHint);
      if (line.name) row.names.add(line.name);
      if (line.rarity !== "unknown") row.rarities.add(line.rarity);
    }
  }

  for (const number of local.byNumber.keys()) {
    touch(number);
  }

  const cards: CoverageCardRow[] = [...universe.values()]
    .sort((a, b) => a.number.localeCompare(b.number))
    .map((row) => {
      const localSets = local.byNumber.get(row.number) ?? [];
      const mangaNewsDecks = [...row.mangaNewsDecks].sort();
      return {
        number: row.number,
        type: row.type,
        localSets: [...localSets].sort(),
        mangaNewsDecks,
        names: [...row.names].sort(),
        rarities: [...row.rarities].sort(),
        inMangaNews: mangaNewsDecks.length > 0,
        inLocal: localSets.length > 0,
      };
    });

  const mangaNewsOnly = cards
    .filter((c) => c.inMangaNews && !c.inLocal)
    .map((c) => c.number);
  const localOnly = cards
    .filter((c) => c.inLocal && !c.inMangaNews)
    .map((c) => c.number);

  const s1to5 = new Set(
    cards.filter((c) => c.inMangaNews).map((c) => c.number),
  );
  const localOutsideS1to5 = [...local.byNumber.entries()]
    .filter(([n, sets]) => {
      if (s1to5.has(n)) return false;
      return sets.some((s) => s === "s6" || s === "promo");
    })
    .map(([n]) => n)
    .sort();

  const mangaNewsUnique = cards.filter((c) => c.inMangaNews).length;
  const localUnique = cards.filter((c) => c.inLocal).length;
  const both = cards.filter((c) => c.inMangaNews && c.inLocal).length;

  const report: CoverageReport = {
    generatedAt: new Date().toISOString(),
    scope:
      "FR CACG — Manga-News decks S1–S5 vs local carddass dump (S1–S6+promo)",
    decks: deckSummaries,
    summary: {
      mangaNewsUnique,
      localUnique,
      both,
      mangaNewsOnly: mangaNewsOnly.length,
      localOnly: localOnly.length,
      localPromoExtra: local.promo.length,
      localS6Extra: local.s6.length,
    },
    mangaNewsOnly,
    localOnly,
    localOutsideS1to5,
    cards,
  };

  mkdirSync(path.join(cacheDir, "images"), { recursive: true });
  writeFileSync(
    path.join(cacheDir, "images", "README.md"),
    `# Manga-News — photos de decks Naruto FR

Écrit par \`Catalogue Sync --only checklist\` (URL lue dans le HTML
du deck, \`og:image\`). **Pas un grab manuel.**
`,
    "utf8",
  );

  mkdirSync(logsDir(), { recursive: true });
  const outPath = path.join(logsDir(), "coverage.json");
  writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  const mdPath = path.join(logsDir(), "coverage.md");
  writeFileSync(mdPath, formatCoverageMarkdown(report), "utf8");

  return report;
}

export function formatCoverageMarkdown(report: CoverageReport): string {
  const lines: string[] = [
    `# Naruto CACG — coverage checklist`,
    ``,
    `Généré : ${report.generatedAt}`,
    ``,
    report.scope,
    ``,
    `## Résumé`,
    ``,
    `| Métrique | N |`,
    `|---------|---|`,
    `| Uniques Manga-News (S1–S5) | ${report.summary.mangaNewsUnique} |`,
    `| Uniques local (index) | ${report.summary.localUnique} |`,
    `| Les deux | ${report.summary.both} |`,
    `| MN seulement (manquants local) | ${report.summary.mangaNewsOnly} |`,
    `| Local seulement | ${report.summary.localOnly} |`,
    `| Dont local promo | ${report.summary.localPromoExtra} |`,
    `| Dont local s6 | ${report.summary.localS6Extra} |`,
    ``,
    `## Decks Manga-News`,
    ``,
  ];

  for (const d of report.decks) {
    lines.push(
      `- **${d.setHint}** (${d.slug}): ${d.lineCount} lignes / ${d.uniqueNumbers} uniques${d.note ? ` — _${d.note}_` : ""}`,
    );
  }

  lines.push(``, `## Manquants local (présents MN)`, ``);
  if (report.mangaNewsOnly.length === 0) {
    lines.push(`_Aucun — checklist MN S1–S5 couverte par l’index._`);
  } else {
    for (const n of report.mangaNewsOnly) {
      const card = report.cards.find((c) => c.number === n);
      const name = card?.names[0] ?? "";
      lines.push(`- \`${n}\`${name ? ` — ${name}` : ""}`);
    }
  }

  lines.push(``, `## Local seulement (hors MN S1–S5)`, ``);
  if (report.localOnly.length === 0) {
    lines.push(`_Aucun._`);
  } else {
    for (const n of report.localOnly) {
      const card = report.cards.find((c) => c.number === n);
      const sets = card?.localSets.join(", ") ?? "?";
      lines.push(`- \`${n}\` (${sets})`);
    }
  }

  lines.push(``);
  return lines.join("\n");
}

export async function runNarutoChecklist(opts?: {
  forceFetch?: boolean;
}): Promise<void> {
  const report = await buildNarutoCoverageChecklist({
    forceFetch: opts?.forceFetch,
  });
  const outDir = logsDir();
  console.log(`Coverage écrite : ${path.join(outDir, "coverage.md")}`);
  console.log(JSON.stringify(report.summary, null, 2));
  if (report.mangaNewsOnly.length) {
    console.log(
      `Manquants local (${report.mangaNewsOnly.length}):`,
      report.mangaNewsOnly.slice(0, 40).join(", ") +
        (report.mangaNewsOnly.length > 40 ? "…" : ""),
    );
  }
  if (report.localOnly.length) {
    console.log(
      `Local only (${report.localOnly.length}):`,
      report.localOnly.slice(0, 40).join(", ") +
        (report.localOnly.length > 40 ? "…" : ""),
    );
  }
}
