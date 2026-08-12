/**
 * Live-first audit: every stem in `cards.json` must be reachable from TCGdex
 * (or classified as non-catalogue). TCGdex-only sets without Live data are OK.
 *
 * Optional `--malie` cross-checks Malie.io TCGL export stems (SV+ME era today)
 * against our aliases + dump.
 *
 *   tsx scripts/pokemon/audit_tcgdex_map.ts
 *   tsx scripts/pokemon/audit_tcgdex_map.ts -- --fetch-sets
 *   tsx scripts/pokemon/audit_tcgdex_map.ts -- --fetch-sets --malie
 *   tsx scripts/pokemon/audit_tcgdex_map.ts -- --fetch-sets --write-reprint-meta
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  liveSetCandidatesFromTcgdexSet,
  liveSetIdFromTcgdexSet,
  mechanicalReprintFallbackStems,
} from "../../src/effects/pokemon/liveSetId";
import { liveCardsIndexAvailable } from "../../src/effects/pokemon/liveCardsIndex";
import {
  LIVE_SET_NON_CATALOGUE,
  liveSetToTcgdexSets,
  TCGDEX_TO_LIVE_SETS,
} from "../../src/effects/pokemon/setAliases";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CARDS_PATH = path.join(ROOT, "data/pokemon/cards.json");
const REPORT_PATH = path.join(
  ROOT,
  "data/pokemon/logs/tcgdex-live-set-map.json",
);
const REPRINT_META_PATH = path.join(
  ROOT,
  "data/pokemon/reprintMeta.json",
);

const MALIE_INDEX_URL =
  "https://cdn.malie.io/file/malie-io/tcgl/export/index.json";

/**
 * Malie `abbr` we expect for stems we alias explicitly (community cross-check).
 * Stems absent from Malie's current SV+ME-only export are skipped at runtime.
 */
const MALIE_ABBR_EXPECT: Readonly<Record<string, string>> = {
  "rsv10-5": "WHT",
  "zsv10-5": "BLK",
  mebsp: "MEP",
  svbsp: "PR-SV",
  "sv3-5": "MEW",
  "sv4-5": "PAF",
  "sv6-5": "SFA",
  "sv8-5": "PRE",
  sv1: "SVI",
  sv2: "PAL",
  sv3: "OBF",
};

/** Mechanical / seed TCGdex ids when --fetch-sets is off. */
const SEED_TCGDEX_SETS = [
  ...Object.keys(TCGDEX_TO_LIVE_SETS),
  "base1",
  "bw10",
  "me1",
  "sv01",
  "sv02",
  "sv03",
  "sv03.5",
  "sv04",
  "sv08",
  "swsh1",
  "swsh7",
  "swsh8",
  "swsh10",
  "swsh10.5",
  "swsh12",
  "xy2",
];

type CardsFile = Record<string, unknown>;

type MalieSetInfo = {
  path?: string;
  name?: string;
  num?: number;
  hash?: string;
  abbr?: string;
};

type MalieIndex = Record<string, Record<string, MalieSetInfo>>;

function loadLiveSets(cards: CardsFile): Map<string, number> {
  const sets = new Map<string, number>();
  for (const id of Object.keys(cards)) {
    const set = id.split("_")[0];
    if (!set) continue;
    sets.set(set, (sets.get(set) ?? 0) + 1);
  }
  return sets;
}

function parseArgs(argv: string[]) {
  let fetchSets = false;
  let malie = false;
  let writeReprintMeta = false;
  let sets: string[] | null = null;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--") continue;
    if (arg === "--fetch-sets") fetchSets = true;
    if (arg === "--malie") malie = true;
    if (arg === "--write-reprint-meta") writeReprintMeta = true;
    if (arg === "--sets" && argv[i + 1]) {
      sets = argv[++i]!.split(",").map((s) => s.trim()).filter(Boolean);
    }
  }
  return { fetchSets, malie, writeReprintMeta, sets };
}

function isDigitalOnlySet(setId: string): boolean {
  return /^(a|b)\d+[a-z]?$/i.test(setId);
}

async function fetchTcgdexSetIds(lang: "fr" | "en"): Promise<string[]> {
  const url = `https://api.tcgdex.net/v2/${lang}/sets`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`TCGdex ${lang} sets HTTP ${res.status}`);
  const body = (await res.json()) as Array<{ id?: string }>;
  return body
    .map((row) => row.id?.trim().toLowerCase())
    .filter((id): id is string => Boolean(id));
}

async function fetchMalieIndex(): Promise<MalieIndex> {
  const res = await fetch(MALIE_INDEX_URL, {
    headers: { "user-agent": "placarr-foil-audit/1.0" },
  });
  if (!res.ok) throw new Error(`Malie index HTTP ${res.status}`);
  return (await res.json()) as MalieIndex;
}

function stripHtml(name: string | undefined): string {
  return (name ?? "").replace(/<\/?i>/g, "").trim();
}

function auditMalie(opts: {
  malie: MalieIndex;
  liveBundles: Map<string, number>;
  forwardByLive: Map<string, string[]>;
}) {
  const en = opts.malie["en-US"] ?? {};
  const stems = Object.keys(en).sort();

  const inDump: string[] = [];
  const missingDump: string[] = [];
  const reachable: string[] = [];
  const unreachable: string[] = [];
  const abbrOk: string[] = [];
  const abbrMismatch: Array<{ stem: string; expected: string; got: string }> =
    [];

  for (const stem of stems) {
    const info = en[stem]!;
    if (opts.liveBundles.has(stem)) inDump.push(stem);
    else missingDump.push(stem);

    const tcgdex = opts.forwardByLive.get(stem) ?? [];
    if (tcgdex.length > 0 || LIVE_SET_NON_CATALOGUE.has(stem)) {
      reachable.push(stem);
    } else {
      unreachable.push(stem);
    }

    const expected = MALIE_ABBR_EXPECT[stem];
    if (expected) {
      const got = (info.abbr ?? "").trim();
      if (got === expected) abbrOk.push(stem);
      else abbrMismatch.push({ stem, expected, got });
    }
  }

  return {
    source: MALIE_INDEX_URL,
    lang: "en-US",
    stemCount: stems.length,
    inDumpCount: inDump.length,
    missingDumpCount: missingDump.length,
    missingDump,
    reachableCount: reachable.length,
    unreachableCount: unreachable.length,
    unreachable,
    /** Malie stems present in our dump but not reachable via TCGdex — wasted. */
    unreachableInDump: unreachable.filter((s) => opts.liveBundles.has(s)),
    abbrOkCount: abbrOk.length,
    abbrMismatch,
    sample: Object.fromEntries(
      stems.slice(0, 8).map((stem) => [
        stem,
        {
          abbr: en[stem]?.abbr ?? null,
          name: stripHtml(en[stem]?.name),
          num: en[stem]?.num ?? null,
          inDump: opts.liveBundles.has(stem),
          catalogueIds: opts.forwardByLive.get(stem) ?? [],
        },
      ]),
    ),
  };
}

async function fetchTcgdexSetDetail(
  lang: "fr" | "en",
  id: string,
): Promise<{ id: string; cardTotal: number } | null> {
  const url = `https://api.tcgdex.net/v2/${lang}/sets/${encodeURIComponent(id)}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const body = (await res.json()) as {
    id?: string;
    cardCount?: { total?: number; official?: number };
  };
  const total = body.cardCount?.total ?? body.cardCount?.official ?? 0;
  if (!body.id || total <= 0) return null;
  return { id: body.id, cardTotal: total };
}

/**
 * Discover TCGdex `*sv` vault splits whose parent Live stem is in the dump but
 * the dedicated vault stem is not — write offsets from parent cardCount.total.
 */
async function writeReprintMetaFile(opts: {
  tcgdexIds: string[];
  liveBundles: Map<string, number>;
}): Promise<number> {
  const byTcgdexSet: Record<
    string,
    {
      parentTcgdex: string;
      parentLive: string;
      svOffset: number;
      parentCardTotal: number;
      vaultCardTotal: number;
    }
  > = {};

  for (const tid of opts.tcgdexIds) {
    const fallbacks = mechanicalReprintFallbackStems(tid);
    if (fallbacks.length === 0) continue;
    const parentLive = fallbacks[0]!;
    if (!opts.liveBundles.has(parentLive)) continue;
    const primary = liveSetIdFromTcgdexSet(tid);
    if (primary && opts.liveBundles.has(primary)) continue;

    const parentTcgdex = tid.slice(0, -2);
    const [parentDetail, vaultDetail] = await Promise.all([
      fetchTcgdexSetDetail("fr", parentTcgdex),
      fetchTcgdexSetDetail("fr", tid),
    ]);
    if (!parentDetail || !vaultDetail) continue;

    byTcgdexSet[tid] = {
      parentTcgdex,
      parentLive,
      svOffset: parentDetail.cardTotal,
      parentCardTotal: parentDetail.cardTotal,
      vaultCardTotal: vaultDetail.cardTotal,
    };
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    source: "tcgdex-fr+live-dump",
    byTcgdexSet,
  };
  writeFileSync(REPRINT_META_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return Object.keys(byTcgdexSet).length;
}

async function main() {
  const {
    fetchSets,
    malie: wantMalie,
    writeReprintMeta,
    sets: setsArg,
  } = parseArgs(process.argv.slice(2));
  if (writeReprintMeta && !fetchSets && !setsArg) {
    throw new Error("--write-reprint-meta requires --fetch-sets (or --sets)");
  }
  const cards = JSON.parse(readFileSync(CARDS_PATH, "utf8")) as CardsFile;
  const liveBundles = loadLiveSets(cards);
  const liveStems = [...liveBundles.keys()].sort();
  const reverse = liveSetToTcgdexSets();

  const tcgdexFr = setsArg
    ? setsArg
    : fetchSets
      ? await fetchTcgdexSetIds("fr")
      : SEED_TCGDEX_SETS;
  const tcgdexEn = fetchSets ? await fetchTcgdexSetIds("en") : [];
  const tcgdexAll = [...new Set([...tcgdexFr, ...tcgdexEn])];

  /** Live stem → TCGdex ids that resolve to it (aliases + normalizer). */
  const forwardByLive = new Map<string, string[]>();
  for (const tid of tcgdexAll) {
    for (const live of liveSetCandidatesFromTcgdexSet(tid)) {
      const list = forwardByLive.get(live) ?? [];
      list.push(tid);
      forwardByLive.set(live, list);
    }
  }

  type LiveStatus =
    | { status: "mapped"; catalogueIds: string[]; bundles: number }
    | { status: "non-catalogue"; bundles: number }
    | {
        status: "unmapped";
        bundles: number;
        hint: string;
      };

  const liveReport: Record<string, LiveStatus> = {};
  let mapped = 0;
  let nonCatalogue = 0;
  let unmapped = 0;

  for (const stem of liveStems) {
    const bundles = liveBundles.get(stem) ?? 0;
    if (LIVE_SET_NON_CATALOGUE.has(stem)) {
      nonCatalogue += 1;
      liveReport[stem] = { status: "non-catalogue", bundles };
      continue;
    }
    // APK `*alt` digital tables (including future stems not yet listed).
    if (stem.endsWith("alt")) {
      nonCatalogue += 1;
      liveReport[stem] = { status: "non-catalogue", bundles };
      continue;
    }
    const fromAlias = reverse.get(stem) ?? [];
    const fromForward = forwardByLive.get(stem) ?? [];
    const catalogueIds = [...new Set([...fromAlias, ...fromForward])].sort();
    if (catalogueIds.length > 0) {
      mapped += 1;
      liveReport[stem] = { status: "mapped", catalogueIds, bundles };
    } else {
      unmapped += 1;
      liveReport[stem] = {
        status: "unmapped",
        bundles,
        hint:
          stem.endsWith("a")
            ? "Likely JP Character Rare — join via catalog.sqlite name (foil:pokemon:index-cards)"
            : stem.endsWith("r")
              ? "Radiant/reprint slice — check EN TCGdex or parent set RC ids"
              : "No TCGdex set id resolves here yet — add alias or confirm absent",
      };
    }
  }

  // TCGdex paper sets with no Live dump (OK)
  const tcgdexWithoutLive: string[] = [];
  for (const tid of tcgdexFr) {
    if (isDigitalOnlySet(tid)) continue;
    const lives = liveSetCandidatesFromTcgdexSet(tid);
    const anyHit = lives.some((live) => liveBundles.has(live));
    if (!anyHit) tcgdexWithoutLive.push(tid);
  }

  const malieReport = wantMalie
    ? auditMalie({
        malie: await fetchMalieIndex(),
        liveBundles,
        forwardByLive,
      })
    : null;

  let reprintMetaCount: number | null = null;
  if (writeReprintMeta) {
    reprintMetaCount = await writeReprintMetaFile({
      tcgdexIds: tcgdexFr,
      liveBundles,
    });
  }

  const report = {
    finishedAt: new Date().toISOString(),
    policy:
      "Live dump must be exploitable via TCGdex. Missing Live for a TCGdex set is OK.",
    cardsPath: "data/pokemon/cards.json",
    liveCardsSqlite: liveCardsIndexAvailable(),
    liveSetCount: liveStems.length,
    liveMapped: mapped,
    liveNonCatalogue: nonCatalogue,
    liveUnmapped: unmapped,
    liveCoverage:
      liveStems.length === 0
        ? 0
        : Number(((mapped + nonCatalogue) / liveStems.length).toFixed(4)),
    aliasCount: Object.keys(TCGDEX_TO_LIVE_SETS).length,
    tcgdexFrCount: tcgdexFr.length,
    tcgdexEnCount: tcgdexEn.length,
    tcgdexWithoutLiveCount: tcgdexWithoutLive.length,
    live: liveReport,
    tcgdexWithoutLive: tcgdexWithoutLive.sort(),
    malie: malieReport,
    reprintMetaCount,
    note: [
      fetchSets
        ? "TCGdex FR+EN set lists fetched"
        : setsArg
          ? "Custom --sets"
          : "Seed + alias list only — pass --fetch-sets for full catalogues",
      wantMalie ? "Malie TCGL export cross-checked" : null,
      writeReprintMeta
        ? `reprintMeta.json written (${reprintMetaCount} *sv fallbacks)`
        : null,
      liveCardsIndexAvailable()
        ? "catalog.sqlite present (name join for resolveEffect)"
        : "catalog.sqlite missing — run pnpm foil:pokemon:index-cards",
    ]
      .filter(Boolean)
      .join("; "),
  };

  mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(
    `Live dump coverage: ${mapped + nonCatalogue}/${liveStems.length} (${(
      report.liveCoverage * 100
    ).toFixed(1)}%) — mapped=${mapped}, non-catalogue=${nonCatalogue}, UNMAPPED=${unmapped}`,
  );
  if (unmapped > 0) {
    console.log("Unmapped Live stems (wasted until aliased):");
    for (const [stem, row] of Object.entries(liveReport)) {
      if (row.status !== "unmapped") continue;
      console.log(`  ${stem} (${row.bundles} bundles) — ${row.hint}`);
    }
  }
  console.log(
    `TCGdex FR paper without Live dump (OK): ${tcgdexWithoutLive.length}`,
  );

  if (malieReport) {
    console.log(
      `Malie en-US: ${malieReport.stemCount} stems, inDump=${malieReport.inDumpCount}, reachable=${malieReport.reachableCount}, abbrOk=${malieReport.abbrOkCount}`,
    );
    if (malieReport.unreachableInDump.length > 0) {
      console.log(
        `  Malie stems in dump but unreachable from TCGdex: ${malieReport.unreachableInDump.join(", ")}`,
      );
    }
    if (malieReport.abbrMismatch.length > 0) {
      console.log("  Malie abbr mismatches:");
      for (const row of malieReport.abbrMismatch) {
        console.log(
          `    ${row.stem}: expected ${row.expected}, got ${row.got || "(empty)"}`,
        );
      }
    }
    if (malieReport.missingDump.length > 0) {
      console.log(
        `  Malie stems absent from local cards.json (OK if not scraped yet): ${malieReport.missingDump.join(", ")}`,
      );
    }
  }

  if (writeReprintMeta) {
    console.log(
      `Reprint meta: ${reprintMetaCount} *sv fallback(s) → ${path.relative(ROOT, REPRINT_META_PATH)}`,
    );
  }

  console.log(`Report: ${path.relative(ROOT, REPORT_PATH)}`);

  let exit = 0;
  if (unmapped > 0) exit = 2;
  if (
    malieReport &&
    (malieReport.unreachableInDump.length > 0 ||
      malieReport.abbrMismatch.length > 0)
  ) {
    exit = exit || 2;
  }
  if (exit) process.exitCode = exit;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
