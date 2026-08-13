/**
 * Parse carddass.fr « archiveN_carte_semaine_*.html » (staging) into structured
 * card-number / name / date rows. Strategy spotlights — not tournament promos.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

import { buildPrintKey } from "@/core/identify/printKey";
import { dataRoot } from "@/lib/runtimeData";

import { NARUTO_PACK_ID, type NarutoPrintRow, type NarutoTitleRow } from "./indexStore";
import { cardTypeFromCollectorNumber } from "./parseBandaicgAsset";

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

const FOCUS_STOP =
  String.raw`Cette|Voici|Son|Si|Une|Le|La|Les|Ce|Elle|Il|Avec|Ne|Pour|Grace|Grâce|De|Du|Des|En|Au|Aux|Sur|Par|Mais|Ou|Et|Car|Donc`;

/** Push a focus card once (first win keeps the richer dated form). */
function pushFeature(
  featured: CarteSemaineFeature[],
  seen: Set<string>,
  entry: CarteSemaineFeature,
): void {
  if (seen.has(entry.cardId)) return;
  if (entry.name.length < 2) return;
  seen.add(entry.cardId);
  featured.push(entry);
}

function snippetAfter(plain: string, index: number, len = 220): string | undefined {
  const snip = plain.slice(index, index + len + 40).replace(/\s+/g, " ").trim();
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
  return "s6";
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
      if (!map.has(e.cardId) && e.name.trim()) map.set(e.cardId, e.name.trim());
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
  const printByKey = new Map(prints.map((p) => [p.printKey, p]));
  const printsByNumber = new Map<string, NarutoPrintRow[]>();
  for (const p of prints) {
    const list = printsByNumber.get(p.number) ?? [];
    list.push(p);
    printsByNumber.set(p.number, list);
  }
  const titleByKey = new Map(
    titles
      .filter((t) => t.lang.toLowerCase() === "fr")
      .map((t) => [t.printKey, t]),
  );
  const named: string[] = [];
  const addedPrints: string[] = [];

  for (const [cardId, name] of names) {
    let rows = printsByNumber.get(cardId) ?? [];
    if (rows.length === 0) {
      const set = guessSetForCarteSemaineId(cardId);
      const printKey = buildPrintKey({
        game: "naruto",
        set,
        number: cardId,
      });
      if (!printKey || printByKey.has(printKey)) continue;
      const print: NarutoPrintRow = {
        printKey,
        setCode: set,
        number: cardId,
        cardType: cardTypeFromCollectorNumber(cardId),
      };
      prints.push(print);
      printByKey.set(printKey, print);
      printsByNumber.set(cardId, [print]);
      rows = [print];
      addedPrints.push(printKey);
    }
    for (const print of rows) {
      const existing = titleByKey.get(print.printKey);
      if (!existing) {
        const title: NarutoTitleRow = {
          printKey: print.printKey,
          lang: "fr",
          fullName: name,
        };
        titles.push(title);
        titleByKey.set(print.printKey, title);
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
