/**
 * Cross-locale anomaly report for Carddass admin (FR / EN / JA / IT).
 * Counters + top samples — not a full dump.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { CardsIndexV1 } from "@/effects/cardsIndex";
import { dataRoot } from "@/lib/runtimeData";
import { isNarutoJapaneseVolumeSet, NARUTO_PACK_ID } from "../identity";
import { loadNarutoCardsIndexFromSqlite } from "../indexStore";
import { isColekaPlaceholderName } from "./index";
import {
  buildNarutoCompleteness,
  type NarutoCompleteness,
} from "./coverage";

const LOCALES = ["fr", "en", "ja", "it"] as const;
type Locale = (typeof LOCALES)[number];

const TOP_N = 25;

/** FR retail series that are late exceptions; others s7+ are EN-only CCG. */
const FR_LATE_SERIES = new Set(["s6", "s24", "s28", "s11"]);

export type LocaleAnomalyReport = {
  version: 1;
  generatedAt: string;
  completeness: NarutoCompleteness;
  anomalies: {
    colekaPlaceholders: Array<{ printKey: string; lang: string; name: string }>;
    frTitlesOnEnOnlySeries: Array<{ printKey: string; set: string; name: string }>;
    jaTitlesOnEuOnlyPrintKeys: Array<{ printKey: string; name: string }>;
    itTitlesOutsideS1S6: Array<{ printKey: string; set: string; name: string }>;
    imageWithoutTitle: Record<string, number>;
    titleWithoutImage: Record<string, number>;
    samples: {
      imageWithoutTitle: Record<string, string[]>;
      titleWithoutImage: Record<string, string[]>;
    };
  };
};

function setCodeOfPrintKey(printKey: string): string | null {
  const m = /^naruto:([a-z0-9]+)-/i.exec(printKey);
  return m ? m[1]!.toLowerCase() : null;
}

export function buildLocaleAnomalyReport(
  index: CardsIndexV1,
): LocaleAnomalyReport {
  const completeness = buildNarutoCompleteness(index, null);
  const colekaPlaceholders: LocaleAnomalyReport["anomalies"]["colekaPlaceholders"] =
    [];
  const frTitlesOnEnOnlySeries: LocaleAnomalyReport["anomalies"]["frTitlesOnEnOnlySeries"] =
    [];
  const jaTitlesOnEuOnlyPrintKeys: LocaleAnomalyReport["anomalies"]["jaTitlesOnEuOnlyPrintKeys"] =
    [];
  const itTitlesOutsideS1S6: LocaleAnomalyReport["anomalies"]["itTitlesOutsideS1S6"] =
    [];
  const imageWithoutTitle: Record<string, number> = {};
  const titleWithoutImage: Record<string, number> = {};
  const samplesImg: Record<string, string[]> = {};
  const samplesTitle: Record<string, string[]> = {};

  for (const lang of LOCALES) {
    imageWithoutTitle[lang] = 0;
    titleWithoutImage[lang] = 0;
    samplesImg[lang] = [];
    samplesTitle[lang] = [];
  }

  const collectorsWithMaki = new Set<string>();
  for (const [printKey, entry] of Object.entries(index.cards)) {
    if (!isNarutoJapaneseVolumeSet(setCodeOfPrintKey(printKey))) continue;
    collectorsWithMaki.add(entry.card.trim().toLowerCase());
  }

  for (const [printKey, entry] of Object.entries(index.cards)) {
    const set = setCodeOfPrintKey(printKey);
    const collector = entry.card.trim().toLowerCase();
    for (const [rawLang, slot] of Object.entries(entry.langs ?? {})) {
      const lang = rawLang.toLowerCase() as Locale;
      if (!(LOCALES as readonly string[]).includes(lang)) continue;
      const name = slot.name?.trim() ?? "";
      const hasArt = Boolean(slot.art?.trim());
      const hasName = Boolean(name);

      if (hasArt && !hasName) {
        imageWithoutTitle[lang] = (imageWithoutTitle[lang] ?? 0) + 1;
        if ((samplesImg[lang]?.length ?? 0) < TOP_N) {
          samplesImg[lang]!.push(printKey);
        }
      }
      if (!hasArt && hasName) {
        titleWithoutImage[lang] = (titleWithoutImage[lang] ?? 0) + 1;
        if ((samplesTitle[lang]?.length ?? 0) < TOP_N) {
          samplesTitle[lang]!.push(`${printKey} — ${name}`);
        }
      }

      if (hasName && isColekaPlaceholderName(name)) {
        if (colekaPlaceholders.length < TOP_N) {
          colekaPlaceholders.push({ printKey, lang, name });
        }
      }

      if (lang === "fr" && hasName && set) {
        const series = /^s(\d+)$/i.exec(set);
        if (series) {
          const n = Number(series[1]);
          if (n > 5 && !FR_LATE_SERIES.has(set)) {
            if (frTitlesOnEnOnlySeries.length < TOP_N) {
              frTitlesOnEnOnlySeries.push({ printKey, set, name });
            }
          }
        }
      }

      /*
        JA title on an EU sN key with no 巻ノ membership anywhere for that
        collector — possible checklist hole or sibling-fill leak.
      */
      if (
        lang === "ja" &&
        hasName &&
        set &&
        /^s\d+$/i.test(set) &&
        !collectorsWithMaki.has(collector) &&
        jaTitlesOnEuOnlyPrintKeys.length < TOP_N
      ) {
        jaTitlesOnEuOnlyPrintKeys.push({ printKey, name });
      }

      if (lang === "it" && hasName && set) {
        if (set === "promo" || set === "prerelease") continue;
        const series = /^s(\d+)$/i.exec(set);
        if (!series || Number(series[1]) > 6) {
          if (itTitlesOutsideS1S6.length < TOP_N) {
            itTitlesOutsideS1S6.push({ printKey, set, name });
          }
        }
      }
    }
  }

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    completeness,
    anomalies: {
      colekaPlaceholders,
      frTitlesOnEnOnlySeries,
      jaTitlesOnEuOnlyPrintKeys,
      itTitlesOutsideS1S6,
      imageWithoutTitle,
      titleWithoutImage,
      samples: {
        imageWithoutTitle: samplesImg,
        titleWithoutImage: samplesTitle,
      },
    },
  };
}

export function renderLocaleAnomaliesMarkdown(
  report: LocaleAnomalyReport,
): string {
  const lines: string[] = [];
  const c = report.completeness;
  lines.push("# Naruto Carddass — anomalies multi-locales", "");
  lines.push(`Généré : ${report.generatedAt}`, "");
  lines.push("## Complétude (index sqlite)", "");
  lines.push(
    "| Locale | Tirages | Image | Titre | Image sans titre | Titre sans image |",
    "| ------ | ------: | ----: | ----: | ---------------: | ---------------: |",
  );
  for (const lang of LOCALES) {
    const loc = c.locales[lang];
    if (!loc) {
      lines.push(`| ${lang} | 0 | — | — | — | — |`);
      continue;
    }
    lines.push(
      `| ${lang} | ${loc.prints} | ${loc.image.pct} (${loc.image.held}) | ${loc.title.pct} (${loc.title.held}) | ${loc.imageWithoutTitle} | ${loc.titleWithoutImage} |`,
    );
  }
  lines.push("");
  lines.push(
    `JA published numbering : ${c.publishedTotal.held}/${c.publishedTotal.max} (manque ${c.publishedTotal.missing})`,
    "",
  );

  lines.push("## Anomalies actionnables (échantillons)", "");

  lines.push("### Placeholders Coleka", "");
  if (!report.anomalies.colekaPlaceholders.length) {
    lines.push("_Aucun._", "");
  } else {
    for (const row of report.anomalies.colekaPlaceholders) {
      lines.push(`- \`${row.printKey}\` [${row.lang}] « ${row.name} »`);
    }
    lines.push("");
  }

  lines.push("### Titres FR sur séries EN-only (s7+ hors exceptions)", "");
  if (!report.anomalies.frTitlesOnEnOnlySeries.length) {
    lines.push("_Aucun dans le top._", "");
  } else {
    for (const row of report.anomalies.frTitlesOnEnOnlySeries) {
      lines.push(`- \`${row.printKey}\` (${row.set}) « ${row.name} »`);
    }
    lines.push("");
  }

  lines.push("### Titres IT hors S1–S6 / promo", "");
  if (!report.anomalies.itTitlesOutsideS1S6.length) {
    lines.push("_Aucun._", "");
  } else {
    for (const row of report.anomalies.itTitlesOutsideS1S6) {
      lines.push(`- \`${row.printKey}\` (${row.set}) « ${row.name} »`);
    }
    lines.push("");
  }

  lines.push("### Compteurs image ↔ titre", "");
  lines.push(
    "| Locale | Image sans titre | Titre sans image |",
    "| ------ | ---------------: | ---------------: |",
  );
  for (const lang of LOCALES) {
    lines.push(
      `| ${lang} | ${report.anomalies.imageWithoutTitle[lang] ?? 0} | ${report.anomalies.titleWithoutImage[lang] ?? 0} |`,
    );
  }
  lines.push("");

  lines.push("### Échantillon titres sans image (IT — attendu ~80 %)", "");
  for (const row of report.anomalies.samples.titleWithoutImage.it ?? []) {
    lines.push(`- ${row}`);
  }
  lines.push("");

  lines.push("### Notes", "");
  lines.push(
    "- IT remis comme langue catalogue (titres ledger cardgameclub + Coleka S6) ; faces IT disque encore rares (emprunt FR en browse).",
    "- Faces IT sur clés `maki*` restent filtrées (axe 巻ノ = JA only).",
    "- S6 FR = uniquement inserts attestés (`s6-fr-printed.json`) — plus de noms IT/Coleka en colonne FR.",
    "- Preferred FR exclut les séries EN-only (s7+) ; preferred IT = S1–S6.",
    "- Scellés IT toujours hors index produits (contrat séparé).",
    "- Prix : filtre admin « sans prix » par locale préférée (pas de table prix IT dédiée).",
    "- JA published missing (~45) = trous Bandai vs index (souvent promo/ps/hors plage).",
    "",
  );
  return `${lines.join("\n")}\n`;
}

export function writeLocaleAnomalyReport(opts?: {
  packRoot?: string;
}): LocaleAnomalyReport {
  const packRoot =
    opts?.packRoot ?? path.join(dataRoot(), NARUTO_PACK_ID);
  const index = loadNarutoCardsIndexFromSqlite(NARUTO_PACK_ID);
  if (!index) {
    throw new Error(`No Carddass index at ${packRoot}/catalog.sqlite`);
  }
  const report = buildLocaleAnomalyReport(index);
  const logsDir = path.join(packRoot, "logs");
  mkdirSync(logsDir, { recursive: true });
  writeFileSync(
    path.join(logsDir, "locale-anomalies.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  writeFileSync(
    path.join(logsDir, "locale-anomalies.md"),
    renderLocaleAnomaliesMarkdown(report),
  );
  return report;
}
