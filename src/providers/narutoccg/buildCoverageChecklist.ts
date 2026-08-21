/**
 * Cross-source coverage checklist for Naruto CACG FR.
 *
 * Anchors:
 * - Manga-News deck goodies (S1–S5 checklists + Nouvelle Série note)
 * - Local cards-index / disk (Wayback carddass.fr dump)
 *
 *   pnpm naruto:cards -- --only checklist
 *     HTML decks + photos (`staging/manga-news/images/`). Pas un grab manuel.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import type { CardsIndexV1 } from "@/effects/cardsIndex";
import { httpGet } from "@/lib/http/httpClient";
import { dataRoot } from "@/lib/runtimeData";

import {
  MANGA_NEWS_DECKS,
  htmlToChecklistText,
  mangaNewsDeckImageUrl,
  normalizeCardNumber,
  parseMangaNewsChecklistText,
  uniqueNumbers,
  type MangaNewsChecklistLine,
  type MangaNewsDeckMeta,
} from "./parseMangaNewsChecklist";
import { NARUTO_PACK_ID } from "./indexStore";

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

export { htmlToChecklistText } from "./parseMangaNewsChecklist";

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

Écrit par \`pnpm naruto:cards -- --only checklist\` (URL lue dans le HTML
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

export async function runNarutoChecklistCli(opts?: {
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
