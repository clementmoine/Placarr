/**
 * Naruto CACG FR — "what cards are known to exist", from every source we hold.
 *
 * The catalogue is built from the images we managed to download, so it can only
 * ever list cards we already have. This ledger inverts that: it collects every
 * card number attested by *any* source, so a card the scrape never saw still
 * shows up — with the reason we believe it exists.
 *
 * Sources (`src/providers/narutoccg/curated/sources/`, hand-assembled once from
 * Wayback / PDF / community — not replayable by the scrape CLI):
 * - `carddass-fr-checklist` — the printed S1–S5 checklists (PDF). Authoritative
 *   list + official FR names. No such checklist exists for S6 or promos.
 * - `apache-index`       — carddass.fr autoindex listings (`logs/apache-index.json`,
 *   regenerable via `--only sources`): files that EXISTED on the server,
 *   including ones Wayback never downloaded.
 * - `carddass-html`      — image references parsed from archived site pages.
 * - `manga-news`         — community checklist (`logs/coverage.json`).
 * - `coleka`             — collector database; the only index that covers
 *   Série 06 at all, and the only one listing the six 2008-imprint cards.
 * - `local-index`        — what we actually have on disk.
 *
 *   pnpm naruto:cards -- --only known
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import type { CardsIndexV1 } from "@/effects/cardsIndex";
import { dataRoot } from "@/lib/runtimeData";

import { narutoCuratedSourcesDir } from "./curatedPaths";
import { apacheIndexPath } from "./buildApacheIndex";
import { NARUTO_PACK_ID } from "./indexStore";
import {
  normalizeCardNumber,
  type MangaNewsCardType,
} from "./parseMangaNewsChecklist";
import { mintNarutoPrintKey } from "./collectorIdentity";
import { listNarutoCardDirs } from "./narutoCardDisk";
import { pickPreferredFaceArtFilename } from "./parseCarddassAsset";

export const KNOWN_SOURCES = [
  "carddass-fr-checklist",
  "apache-index",
  "carddass-html",
  "manga-news",
  "coleka",
  "local-index",
] as const;

export type KnownSource = (typeof KNOWN_SOURCES)[number];

export type KnownCardRow = {
  number: string;
  type: MangaNewsCardType;
  sources: KnownSource[];
  /** Official FR name from the printed checklist, when it parsed cleanly. */
  officialName?: string;
  /** Sets the official checklist places this number in (s1…s5). */
  officialSets: string[];
  /** Sets we hold art for. */
  localSets: string[];
  hasArt: boolean;
};

/**
 * Série 06 was announced for 2009, postponed, then cancelled — Carddass moved
 * its effort to Dragon Ball. Its cards were previewed weekly on carddass.fr but
 * never printed, which is why no collector database holds a photo of a single
 * one (Coleka lists 48 and has 0 images), and why the site never produced a S6
 * booster packshot, logo or starter while S1–S5 all have theirs.
 *
 * They are therefore not gaps in the catalogue — they are a product that does
 * not exist — and the pack only tracks physical cards. Counted separately.
 *
 * Membership is read from the data, never from a list of card numbers: the
 * carddass.fr reference path (`images/cartes/6/…`), Coleka's Série 06 branch,
 * or the `s6` set on disk.
 */
const SERIE_06_PATH = /\/cartes\/0?6\//i;
const SERIE_06_SET = "s6";

export type SetInfo = {
  series: number | null;
  /** Bandai named two starters per series, never the series itself. */
  starters: string[];
  /** Coleka's label — a collector convention, not an official title. */
  colekaLabel: string | null;
  released?: boolean;
};

export type KnownCardsReport = {
  generatedAt: string;
  sets: Record<string, SetInfo>;
  counts: Record<KnownSource, number>;
  total: number;
  /** Printed (or otherwise physically attested) card with no image — real gap. */
  missingArt: string[];
  /**
   * Never published on paper — still kept in the ledger (names / numbers /
   * refs). Includes cancelled Série 06 and lone site HTML refs (e.g. `ta090`).
   */
  unreleased: string[];
  /** Subset of `unreleased`: only attested by a `carddass-html` href. */
  unreleasedHtmlOnly: string[];
  /** In the local index but attested by no external source (promos, S6 on disk). */
  unattested: string[];
  /**
   * Local face is a large collector photo (no carddass site render /
   * corrected / reconstructed preferred). OK as fallback — queue for
   * `art.reconstructed.webp`.
   */
  photoFallbackArt: PhotoFallbackArtRow[];
  cards: KnownCardRow[];
};

/** Official site faces cluster ~40–80 KB / ~350×495; photos are far larger. */
export const PHOTO_FALLBACK_MIN_BYTES = 300_000;

export type PhotoFallbackArtRow = {
  printKey: string;
  set: string;
  cardId: string;
  /** Displayed face filename under the card dir. */
  artFile: string;
  bytes: number;
  /** `high` = published set gap; `low` = cancelled S6 photos. */
  priority: "high" | "low";
};

/**
 * Preferred face is plain `art.*` and oversized → collector-photo fallback
 * (not `art.corrected` / `art.reconstructed`).
 */
export function isCollectorPhotoFallbackFace(input: {
  preferredArtFile: string | null;
  bytes: number;
  minBytes?: number;
}): boolean {
  const file = input.preferredArtFile;
  if (!file) return false;
  if (!/^art\.(jpe?g|png|webp|gif)$/i.test(file)) return false;
  return input.bytes >= (input.minBytes ?? PHOTO_FALLBACK_MIN_BYTES);
}

/** Scan card folders for photo-fallback faces still preferred. */
export function collectPhotoFallbackArt(
  cardsRoot: string,
): PhotoFallbackArtRow[] {
  if (!existsSync(cardsRoot)) return [];
  const rows: PhotoFallbackArtRow[] = [];
  for (const hit of listNarutoCardDirs(cardsRoot)) {
    if (hit.lang !== "fr") continue;
    const files = readdirSync(hit.abs);
    const preferred = pickPreferredFaceArtFilename(files, "fr");
    if (!preferred) continue;
    const artPath = path.join(hit.abs, preferred);
    let bytes = 0;
    try {
      bytes = statSync(artPath).size;
    } catch {
      continue;
    }
    if (!isCollectorPhotoFallbackFace({ preferredArtFile: preferred, bytes })) {
      continue;
    }
    const appearance = hit.appearanceSet ?? hit.family;
    rows.push({
      printKey:
        mintNarutoPrintKey(hit.diskId, hit.appearanceSet) ??
        `naruto:${appearance}-${hit.diskId}`,
      set: appearance,
      cardId: hit.diskId,
      artFile: preferred,
      bytes,
      priority: appearance === "s6" ? "low" : "high",
    });
  }
  rows.sort((a, b) => {
    const p = a.priority.localeCompare(b.priority);
    if (p !== 0) return p;
    const s = a.set.localeCompare(b.set, undefined, { numeric: true });
    if (s !== 0) return s;
    return a.cardId.localeCompare(b.cardId, undefined, { numeric: true });
  });
  return rows;
}

/**
 * Sources that imply a physical / checklist card (printed or at least listed
 * as collectible), not a lone `<img>` href on an archived page.
 */
export const PHYSICAL_KNOWN_SOURCES: readonly KnownSource[] = [
  "carddass-fr-checklist",
  "apache-index",
  "manga-news",
  "coleka",
  "local-index",
] as const;

/**
 * Lone `carddass-html` → never printed (same bucket as S6), still tracked.
 * We do not delete the number / ref — only mark it unpublished.
 */
export function isUnpublishedHtmlRef(sources: readonly KnownSource[]): boolean {
  return sources.length > 0 && sources.every((s) => s === "carddass-html");
}

/** @deprecated alias — use {@link isUnpublishedHtmlRef} */
export const isHtmlOnlyPhantom = isUnpublishedHtmlRef;

function packRoot(): string {
  return path.join(dataRoot(), NARUTO_PACK_ID);
}

function sourcesDir(): string {
  return narutoCuratedSourcesDir();
}

function logsDir(): string {
  return path.join(packRoot(), "logs");
}

function readJson<T>(file: string): T | undefined {
  if (!existsSync(file)) return undefined;
  return JSON.parse(readFileSync(file, "utf8")) as T;
}

const FILE_NAME =
  /^(ninja|tactique|technique|ni|ta|te|cl)[\s\-_]?(\d{1,3})(?:-vc)?\.(?:jpe?g|gif|png)$/i;

const PREFIX_ALIAS: Record<string, MangaNewsCardType> = {
  ninja: "ni",
  tactique: "ta",
  technique: "te",
  ni: "ni",
  ta: "ta",
  te: "te",
  cl: "cl",
};

/** `NINJA-232.jpg`, `TE-212-vc.jpg`, `NINJA 219.jpg` → `ni232`. */
export function numberFromFileName(name: string): string | undefined {
  const m = FILE_NAME.exec(name.trim());
  if (!m) return undefined;
  const type = PREFIX_ALIAS[m[1]!.toLowerCase()];
  if (!type) return undefined;
  return normalizeCardNumber(type, m[2]!);
}

type Attested = Map<string, Set<KnownSource>>;

function attest(map: Attested, number: string, source: KnownSource): void {
  const set = map.get(number) ?? new Set<KnownSource>();
  set.add(source);
  map.set(number, set);
}

export function buildNarutoKnownCards(): KnownCardsReport {
  const attested: Attested = new Map();
  const officialName = new Map<string, string>();
  const officialSets = new Map<string, string[]>();
  const localSets = new Map<string, string[]>();

  const official = readJson<{
    sets: Record<string, { ids: string[]; names: Record<string, string> }>;
  }>(path.join(sourcesDir(), "carddass-fr-checklist.json"));
  for (const [set, body] of Object.entries(official?.sets ?? {})) {
    for (const id of body.ids) {
      attest(attested, id, "carddass-fr-checklist");
      const sets = officialSets.get(id) ?? [];
      if (!sets.includes(set)) sets.push(set);
      officialSets.set(id, sets);
    }
    for (const [id, name] of Object.entries(body.names ?? {})) {
      if (!officialName.has(id)) officialName.set(id, name);
    }
  }

  const apache = readJson<{
    directories: Record<string, { files: string[] }>;
  }>(apacheIndexPath());
  for (const dir of Object.values(apache?.directories ?? {})) {
    for (const file of dir.files) {
      const number = numberFromFileName(file);
      if (number) attest(attested, number, "apache-index");
    }
  }

  const htmlRefs = readJson<{ refs: Record<string, string[]> }>(
    path.join(sourcesDir(), "carddass-html-refs.json"),
  );
  for (const number of Object.keys(htmlRefs?.refs ?? {})) {
    attest(attested, number, "carddass-html");
  }

  const coleka = readJson<{ cards: Record<string, { name?: string }> }>(
    path.join(sourcesDir(), "coleka.json"),
  );
  for (const number of Object.keys(coleka?.cards ?? {})) {
    attest(attested, number, "coleka");
  }

  const coverage = readJson<{
    cards: Array<{ number: string; inMangaNews?: boolean }>;
  }>(path.join(logsDir(), "coverage.json"));
  for (const row of coverage?.cards ?? []) {
    if (row.inMangaNews) attest(attested, row.number, "manga-news");
  }

  const indexPath = path.join(packRoot(), "cards-index.json");
  if (!existsSync(indexPath)) {
    throw new Error(`Missing ${indexPath} — run the scrape first`);
  }
  const index = JSON.parse(readFileSync(indexPath, "utf8")) as CardsIndexV1;
  for (const entry of Object.values(index.cards)) {
    const base = String(entry.card).replace(/-cdf$/i, "");
    const m = /^(ni|te|ta|cl|pr)(\d+)$/i.exec(base);
    if (!m) continue;
    const type = m[1]!.toLowerCase();
    // `pr` promos have no checklist prefix — keep them under their own key.
    const number =
      type === "pr"
        ? `pr${String(Number.parseInt(m[2]!, 10)).padStart(3, "0")}`
        : normalizeCardNumber(type as MangaNewsCardType, m[2]!);
    attest(attested, number, "local-index");
    const sets = localSets.get(number) ?? [];
    if (!sets.includes(entry.set)) sets.push(entry.set);
    localSets.set(number, sets);
  }

  const cards: KnownCardRow[] = [...attested.entries()]
    .map(([number, sources]) => {
      const type = (number.slice(0, 2) as MangaNewsCardType) ?? "ni";
      const local = localSets.get(number) ?? [];
      return {
        number,
        type,
        sources: KNOWN_SOURCES.filter((s) => sources.has(s)),
        officialName: officialName.get(number),
        officialSets: officialSets.get(number) ?? [],
        localSets: local,
        hasArt: local.length > 0,
      };
    })
    .sort((a, b) => a.number.localeCompare(b.number));

  const counts = Object.fromEntries(
    KNOWN_SOURCES.map((s) => [
      s,
      cards.filter((c) => c.sources.includes(s)).length,
    ]),
  ) as Record<KnownSource, number>;

  const isSerie06 = (number: string): boolean =>
    // Coleka's source file *is* the Série 06 branch.
    Boolean(coleka?.cards?.[number]) ||
    // carddass.fr filed the previews under images/cartes/6/.
    (htmlRefs?.refs?.[number] ?? []).some((ref) => SERIE_06_PATH.test(ref)) ||
    (localSets.get(number) ?? []).includes(SERIE_06_SET);

  const withoutArt = cards.filter((c) => !c.hasArt);
  const unreleasedHtmlOnly = withoutArt
    .filter((c) => isUnpublishedHtmlRef(c.sources) && !isSerie06(c.number))
    .map((c) => c.number);
  const unreleased = withoutArt
    .filter((c) => isSerie06(c.number) || isUnpublishedHtmlRef(c.sources))
    .map((c) => c.number);
  const missingArt = withoutArt
    .filter((c) => !isSerie06(c.number) && !isUnpublishedHtmlRef(c.sources))
    .map((c) => c.number);

  const setsFile = readJson<{ sets: Record<string, SetInfo> }>(
    path.join(sourcesDir(), "sets.json"),
  );

  return {
    generatedAt: new Date().toISOString(),
    sets: setsFile?.sets ?? {},
    counts,
    total: cards.length,
    missingArt,
    unreleased,
    unreleasedHtmlOnly,
    unattested: cards
      .filter((c) => c.sources.length === 1 && c.sources[0] === "local-index")
      .map((c) => c.number),
    photoFallbackArt: collectPhotoFallbackArt(path.join(packRoot(), "cards")),
    cards,
  };
}

export function formatKnownCardsMarkdown(report: KnownCardsReport): string {
  const lines: string[] = [
    "# Naruto CACG — cartes connues, toutes sources",
    "",
    `Généré : ${report.generatedAt.slice(0, 10)}`,
    "",
    "Une carte est « connue » dès qu'une source l'atteste, même si on n'a",
    "aucune image. Voir `docs/naruto_carddass_fr_recovery.md`.",
    "",
    "## Séries",
    "",
    "Bandai nommait **deux starters par série**, jamais la série elle-même. Les",
    "libellés Coleka reprennent un seul starter — convention de collectionneurs.",
    "",
    "| Set | Starters officiels | Libellé Coleka |",
    "|-----|--------------------|----------------|",
    ...Object.entries(report.sets).map(
      ([code, info]) =>
        `| \`${code}\` | ${info.starters.join(" & ") || "—"} | ${info.colekaLabel ?? "—"}` +
        `${info.released === false ? " _(annulée)_" : ""} |`,
    ),
    "",
    "## Couverture par source",
    "",
    "| Source | Cartes attestées |",
    "|--------|-----------------:|",
  ];
  for (const source of KNOWN_SOURCES) {
    lines.push(`| \`${source}\` | ${report.counts[source]} |`);
  }
  lines.push(
    "",
    `**Total connu : ${report.total}** — rien n'est effacé. Dont` +
      ` **${report.missingArt.length}** imprimée(s) sans image,` +
      ` **${report.unreleased.length}** non publiée(s) papier` +
      ` (${report.unreleasedHtmlOnly.length} ref HTML seule).`,
    "",
    "## Cartes physiques sans image",
    "",
  );
  if (report.missingArt.length === 0) {
    lines.push("_Aucune._", "");
  } else {
    lines.push("| Number | Nom officiel | Attesté par |", "|---|---|---|");
    for (const number of report.missingArt) {
      const row = report.cards.find((c) => c.number === number)!;
      lines.push(
        `| \`${number}\` | ${row.officialName ?? "—"} | ${row.sources.join(", ")} |`,
      );
    }
    lines.push("");
  }
  lines.push(
    "## Non publiées papier (toujours dans le ledger)",
    "",
    "On **conserve** numéros, noms et refs. Pas d'image catalogue tant qu'il n'y",
    "a pas d'exemplaire papier — ce n'est pas une suppression.",
    "",
    "### Série 06 — annoncée, jamais imprimée",
    "",
    "Annoncée pour 2009, repoussée puis abandonnée au profit de Dragon Ball.",
    "Présentées sur carddass.fr, jamais produites.",
    "",
  );
  const s6Only = report.unreleased.filter(
    (n) => !report.unreleasedHtmlOnly.includes(n),
  );
  lines.push(
    s6Only.length
      ? `${s6Only.length} : ` + s6Only.map((n) => `\`${n}\``).join(", ")
      : "_Aucune._",
    "",
    "### Refs HTML seules (ex. `ta090`)",
    "",
    "Attestées uniquement par un chemin `carddass-html` (pas de checklist",
    "officielle, pas d'index Apache, pas de base collectionneurs). Traitées comme",
    "non publiées — le numéro reste dans `cards[]` / ce rapport.",
    "",
    report.unreleasedHtmlOnly.length
      ? report.unreleasedHtmlOnly.map((n) => `\`${n}\``).join(", ")
      : "_Aucune._",
    "",
  );
  lines.push(
    "## En base mais attestées par aucune source externe",
    "",
    "Promos et S6 sur disque : aucune checklist officielle n'existe pour ces",
    "corpus, on ne peut donc pas savoir ce qui manque — on garde quand même.",
    "",
    report.unattested.length
      ? report.unattested.map((n) => `\`${n}\``).join(", ")
      : "_Aucune._",
    "",
  );
  lines.push(
    "## Photos collector en fallback (pas de render carddass)",
    "",
    "Face affichée = plain `art.*` trop lourde (≥ ~300 KB ; site ~40–80 KB /",
    "~350×495). Pas de `art.corrected` / `art.reconstructed` préféré — OK en",
    "fallback catalogue, à préparer en reconstruct (`curated/cards/{family}/{id}/{lang}/`).",
    "",
    "_Exclut_ les cartes déjà servies via `-vc` (`art.corrected`) ou reconstruct.",
    "",
  );
  if (report.photoFallbackArt.length === 0) {
    lines.push("_Aucune._", "");
  } else {
    const high = report.photoFallbackArt.filter((r) => r.priority === "high");
    const low = report.photoFallbackArt.filter((r) => r.priority === "low");
    lines.push(
      `| Priorité | Print | Art | Ko |`,
      `|----------|-------|-----|---:|`,
    );
    for (const row of report.photoFallbackArt) {
      lines.push(
        `| ${row.priority} | \`${row.printKey}\` | \`${row.artFile}\` | ${Math.round(row.bytes / 1024)} |`,
      );
    }
    lines.push(
      "",
      `**${high.length}** priorité haute (sets publiés), **${low.length}** basse (S6 annulée).`,
      "",
    );
  }
  return lines.join("\n");
}

export function runNarutoKnownCardsCli(): KnownCardsReport {
  const report = buildNarutoKnownCards();
  mkdirSync(logsDir(), { recursive: true });
  writeFileSync(
    path.join(logsDir(), "known-cards.json"),
    `${JSON.stringify(report, null, 1)}\n`,
  );
  writeFileSync(
    path.join(logsDir(), "known-cards.md"),
    formatKnownCardsMarkdown(report),
  );

  console.log("── Naruto known cards (all sources)");
  for (const source of KNOWN_SOURCES) {
    console.log(`   ${source.padEnd(20)} ${report.counts[source]}`);
  }
  console.log(`   ${"TOTAL".padEnd(20)} ${report.total}`);
  console.log(`   ${"sans image".padEnd(20)} ${report.missingArt.length}`);
  if (report.missingArt.length) {
    console.log(`   → ${report.missingArt.join(", ")}`);
  }
  console.log(
    `   ${"non publiées".padEnd(20)} ${report.unreleased.length}` +
      ` (S6 + refs HTML ; conservées)`,
  );
  if (report.unreleasedHtmlOnly.length) {
    console.log(
      `   ${"dont HTML seule".padEnd(20)} ${report.unreleasedHtmlOnly.join(", ")}`,
    );
  }
  const photoHigh = report.photoFallbackArt.filter(
    (r) => r.priority === "high",
  );
  console.log(
    `   ${"photo fallback".padEnd(20)} ${report.photoFallbackArt.length}` +
      ` (${photoHigh.length} high)`,
  );
  if (photoHigh.length) {
    console.log(`   → ${photoHigh.map((r) => r.printKey).join(", ")}`);
  }
  return report;
}
