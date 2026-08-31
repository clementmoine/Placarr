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
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { CardsIndexV1 } from "@/effects/cardsIndex";
import { dataRoot } from "@/lib/runtimeData";

import universe from "./curated/sources/cardcheckbox-jp.json";
import { NARUTO_PACK_ID } from "./packs";

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
