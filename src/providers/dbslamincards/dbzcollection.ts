/**
 * Moisson dbzcollection.fr — faces h400 + packshots scellés (Lamincards FR).
 *
 * idc=94 / ids=353 (fr2008) et ids=465 (fror). Faces : dump
 * `art.dbzcollection.jpg` ; index = DBC s’il existe, sinon dbzc.
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { httpGet } from "@/lib/http/httpClient";
import { packCardsDir, packStagingDir } from "@/lib/packPaths";
import type { LocalPrintsIndex } from "@/providers/shared/cardCatalogue/localPrintsIndex";
import type { SealedKind } from "@/providers/shared/sealedProducts/kinds";
import { writeLocalSealedProducts } from "@/providers/shared/sealedProducts/localWrite";

import {
  DBS_LAMINCARDS_PACK_ID,
  dbsLamincardsCuratedDir,
} from "./pack";
import { dbcCardFolderName } from "./parseDragonballCenter";
import {
  dbzcAbsoluteUrl,
  dbzcCardInfoUrl,
  dbzcSetListingUrl,
  parseDbzcollectionListing,
  parseDbzcCardInfo,
  type DbzcCard,
  type DbzcPack,
} from "./parseDbzcollection";
import {
  formatLamincardsReference,
  lamincardsPrintKey,
} from "./printKey";

const LEDGER_FILE = "dbzcollection.json";
const STAGING_FOLDER = "dbzcollection";
const SOURCE_ID = "dbzcollection";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
const DELAY_MS = 100;

export type DbzcSetSpec = {
  ids: string;
  setCode: string;
  label: string;
  listingPath: string;
  expectedCards?: number;
  cardsPerBooster?: number;
  note?: string;
};

export type DbzcLedger = {
  source: string;
  sourceId: string;
  lang: string;
  origin: string;
  sets: DbzcSetSpec[];
};

export function dbzcollectionLedgerPath(): string {
  return path.join(dbsLamincardsCuratedDir(), "sources", LEDGER_FILE);
}

export function readDbzcollectionLedger(): DbzcLedger {
  return JSON.parse(
    readFileSync(dbzcollectionLedgerPath(), "utf8"),
  ) as DbzcLedger;
}

export function dbzcollectionStagingDir(): string {
  return path.join(packStagingDir(DBS_LAMINCARDS_PACK_ID), STAGING_FOLDER);
}

function setStagingDir(setCode: string, root?: string): string {
  return path.join(root ?? dbzcollectionStagingDir(), setCode.trim().toLowerCase());
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchText(
  url: string,
  opts: { minLength?: number } = {},
): Promise<string | null> {
  const minLength = opts.minLength ?? 400;
  try {
    const res = await httpGet<string>(url, {
      headers: { "User-Agent": UA, Accept: "text/html" },
      responseType: "text",
      timeout: 40_000,
      validateStatus: (status: number) => status === 200,
    });
    return typeof res.data === "string" && res.data.length >= minLength
      ? res.data
      : null;
  } catch {
    return null;
  }
}

async function downloadImage(url: string, referer: string): Promise<Buffer | null> {
  try {
    const res = await httpGet<ArrayBuffer>(url, {
      headers: { "User-Agent": UA, Referer: referer },
      responseType: "arraybuffer",
      timeout: 40_000,
      validateStatus: (status: number) => status === 200,
    });
    const data = res.data;
    if (!data || data.byteLength < 400) return null;
    return Buffer.from(data);
  } catch {
    return null;
  }
}

function parseSeriesFilter(argv: readonly string[]): Set<string> | null {
  const raw = argv.find((a) => a.startsWith("--series="));
  if (!raw) return null;
  const parts = raw
    .slice("--series=".length)
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return parts.length ? new Set(parts) : null;
}

export function enabledDbzcSets(
  ledger: DbzcLedger,
  argv: readonly string[] = [],
): DbzcSetSpec[] {
  const filter = parseSeriesFilter(argv);
  return ledger.sets.filter((s) => {
    if (!filter) return true;
    return filter.has(s.setCode.trim().toLowerCase());
  });
}

function cardFolder(card: DbzcCard): string {
  return dbcCardFolderName(card.number, card.grouping);
}

function packSlug(setCode: string, label: string): string {
  const base = setCode.trim().toLowerCase();
  const slug = label
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${base}-${slug || "sku"}`;
}

function packKind(label: string): { kind: SealedKind; category: string } {
  const lower = label.trim().toLowerCase();
  if (lower === "booster") return { kind: "booster", category: "booster" };
  if (lower.includes("booster box") || lower === "boosterbox") {
    return { kind: "display", category: "booster-box" };
  }
  if (lower === "box") return { kind: "collector_box", category: "box" };
  if (lower === "album") return { kind: "ephemera", category: "album" };
  return { kind: "coffret", category: "sealed" };
}

export type DbzcHarvest = {
  sets: number;
  cards: number;
  packs: number;
  ok: number;
  skip: number;
  fail: number;
};

async function harvestSet(
  set: DbzcSetSpec,
  lang: string,
  opts: { force?: boolean; stagingRoot?: string },
): Promise<{ cards: number; packs: number; ok: number; skip: number; fail: number }> {
  const staging = setStagingDir(set.setCode, opts.stagingRoot);
  mkdirSync(staging, { recursive: true });
  const listingUrl = dbzcSetListingUrl(set.ids);
  const listingDest = path.join(staging, "listing.html");
  let html: string | null = null;
  if (!opts.force && existsSync(listingDest)) {
    html = readFileSync(listingDest, "utf8");
  }
  if (!html || html.length < 400) {
    html = await fetchText(listingUrl);
    if (!html) return { cards: 0, packs: 0, ok: 0, skip: 0, fail: 1 };
    writeFileSync(listingDest, html, "utf8");
    await sleep(DELAY_MS);
  }

  const parsed = parseDbzcollectionListing(html);
  writeFileSync(
    path.join(staging, "cards.json"),
    JSON.stringify(
      {
        setCode: set.setCode,
        ids: set.ids,
        lang,
        listingUrl,
        cards: parsed.cards.map((c) => ({
          number: c.number,
          grouping: c.grouping,
          cardId: c.cardId,
          rarity: c.rarityLabel,
        })),
        packs: parsed.packs,
        harvestedAt: new Date().toISOString(),
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );

  let ok = 0;
  let skip = 0;
  let fail = 0;

  for (const card of parsed.cards) {
    const folder = cardFolder(card);
    const dest = path.join(staging, `${folder}.jpg`);
    const manifestDest = path.join(staging, `${folder}.json`);
    let existing: Record<string, unknown> | null = null;
    if (existsSync(manifestDest)) {
      try {
        existing = JSON.parse(readFileSync(manifestDest, "utf8")) as Record<
          string,
          unknown
        >;
      } catch {
        existing = null;
      }
    }
    const hasFace = existsSync(dest);
    const hasName =
      typeof existing?.characterName === "string" &&
      Boolean((existing.characterName as string).trim());

    if (!opts.force && hasFace && hasName) {
      skip += 1;
      continue;
    }

    if (opts.force || !hasFace) {
      const buf = await downloadImage(
        dbzcAbsoluteUrl(card.facePath),
        listingUrl,
      );
      if (!buf) {
        fail += 1;
        continue;
      }
      writeFileSync(dest, buf);
      await sleep(DELAY_MS);
    }

    let characterName =
      typeof existing?.characterName === "string"
        ? (existing.characterName as string).trim()
        : "";
    if (opts.force || !characterName) {
      const infoHtml = await fetchText(dbzcCardInfoUrl(card.cardId), {
        minLength: 80,
      });
      await sleep(DELAY_MS);
      characterName = infoHtml
        ? (parseDbzcCardInfo(infoHtml).name ?? "")
        : "";
    }

    const title = characterName
      ? characterName
      : formatLamincardsReference(
          set.setCode,
          card.printed,
          card.rarityLabel,
        );

    writeFileSync(
      path.join(staging, `${folder}.json`),
      JSON.stringify(
        {
          setCode: set.setCode,
          lang,
          ...card,
          faceUrl: dbzcAbsoluteUrl(card.facePath),
          characterName: characterName || null,
          title,
        },
        null,
        2,
      ) + "\n",
      "utf8",
    );
    ok += 1;
  }
  const packsDir = path.join(staging, "packs");
  mkdirSync(packsDir, { recursive: true });
  for (const pack of parsed.packs) {
    const slug = packSlug(set.setCode, pack.label);
    const dest = path.join(packsDir, `${slug}.jpg`);
    if (!opts.force && existsSync(dest)) {
      skip += 1;
      continue;
    }
    const buf = await downloadImage(dbzcAbsoluteUrl(pack.facePath), listingUrl);
    if (!buf) {
      fail += 1;
      continue;
    }
    writeFileSync(dest, buf);
    writeFileSync(
      path.join(packsDir, `${slug}.json`),
      JSON.stringify(
        {
          setCode: set.setCode,
          lang,
          slug,
          ...pack,
          faceUrl: dbzcAbsoluteUrl(pack.facePath),
          listingUrl,
        },
        null,
        2,
      ) + "\n",
      "utf8",
    );
    ok += 1;
    await sleep(DELAY_MS);
  }

  return {
    cards: parsed.cards.length,
    packs: parsed.packs.length,
    ok,
    skip,
    fail,
  };
}

export async function harvestDbzcollection(
  opts: {
    force?: boolean;
    stagingDir?: string;
    argv?: readonly string[];
  } = {},
): Promise<DbzcHarvest> {
  const ledger = readDbzcollectionLedger();
  const sets = enabledDbzcSets(ledger, opts.argv ?? []);
  const stagingRoot = opts.stagingDir ?? dbzcollectionStagingDir();
  mkdirSync(stagingRoot, { recursive: true });

  let cards = 0;
  let packs = 0;
  let ok = 0;
  let skip = 0;
  let fail = 0;

  for (const set of sets) {
    console.log(`── dbzc ${set.setCode} — ${set.label}`);
    const report = await harvestSet(set, ledger.lang, {
      force: opts.force,
      stagingRoot,
    });
    cards += report.cards;
    packs += report.packs;
    ok += report.ok;
    skip += report.skip;
    fail += report.fail;
    console.log(
      `── dbzc ${set.setCode} — ${report.cards} carte(s), ${report.packs} SKU : ${report.ok} DL, ${report.skip} déjà là, ${report.fail} manqué${report.fail === 1 ? "" : "s"}`,
    );
  }

  return { sets: sets.length, cards, packs, ok, skip, fail };
}

type FaceManifest = DbzcCard & {
  setCode: string;
  lang: string;
  faceUrl: string;
  title: string;
  characterName?: string | null;
};

function readFaceManifests(staging: string): FaceManifest[] {
  if (!existsSync(staging)) return [];
  const out: FaceManifest[] = [];
  for (const name of readdirSync(staging)) {
    if (!name.endsWith(".json") || name === "cards.json") continue;
    try {
      out.push(
        JSON.parse(readFileSync(path.join(staging, name), "utf8")) as FaceManifest,
      );
    } catch {
      /* skip */
    }
  }
  return out;
}

export type DbzcFaceInstall = {
  prints: number;
  titles: number;
  faces: number;
  dumps: number;
  missing: string[];
};

/** Pose / complète les tirages FR depuis le staging dbzc. */
export function installDbzcollectionFaces(
  index: LocalPrintsIndex,
  opts: { stagingDir?: string; argv?: readonly string[] } = {},
): DbzcFaceInstall {
  const ledger = readDbzcollectionLedger();
  const sets = enabledDbzcSets(ledger, opts.argv ?? []);
  const stagingRoot = opts.stagingDir ?? dbzcollectionStagingDir();
  const lang = ledger.lang.trim().toLowerCase() || "fr";
  let prints = 0;
  let titles = 0;
  let faces = 0;
  let dumps = 0;
  const missing: string[] = [];
  const assets: {
    printKey: string;
    lang: string;
    art: string;
    sourceUrl: string;
  }[] = [];

  for (const set of sets) {
    const staging = setStagingDir(set.setCode, stagingRoot);
    const manifests = readFaceManifests(staging);
    const printRows = [];

    for (const row of manifests) {
      const printKey = lamincardsPrintKey(
        row.setCode,
        row.number,
        row.grouping,
      );
      if (!printKey) {
        missing.push(`${row.setCode}:${row.number}`);
        continue;
      }
      const folder = cardFolder(row);
      const src = path.join(staging, `${folder}.jpg`);
      if (!existsSync(src)) {
        missing.push(`${row.setCode}:${folder}`);
        continue;
      }

      printRows.push({
        printKey,
        setCode: row.setCode.trim().toLowerCase(),
        number: row.number,
        cardType: row.setCode.trim().toLowerCase(),
        grouping: row.grouping ?? null,
        sourceUrl: row.faceUrl,
        titles: [
          {
            lang,
            fullName:
              (row.characterName?.trim() ||
                row.title?.trim() ||
                formatLamincardsReference(
                  row.setCode,
                  row.printed,
                  row.rarityLabel,
                )),
            rarity: row.rarityLabel ?? null,
          },
        ],
      });

      const destDir = path.join(
        packCardsDir(DBS_LAMINCARDS_PACK_ID),
        row.setCode.trim().toLowerCase(),
        lang,
        folder,
      );
      mkdirSync(destDir, { recursive: true });
      const artName = `art.${SOURCE_ID}.jpg`;
      copyFileSync(src, path.join(destDir, artName));
      dumps += 1;

      const hasDbc = existsSync(path.join(destDir, "art.dbc.jpg"));
      if (!hasDbc) {
        assets.push({
          printKey,
          lang,
          art: artName,
          sourceUrl: row.faceUrl,
        });
        faces += 1;
      }
    }

    if (printRows.length) {
      const written = index.writePrints(printRows);
      prints += written.prints;
      titles += written.titles;
    }
  }

  if (assets.length) index.writeAssets(assets);
  return { prints, titles, faces, dumps, missing };
}

type PackManifest = DbzcPack & {
  setCode: string;
  lang: string;
  slug: string;
  faceUrl: string;
  listingUrl: string;
};

export function ingestDbzcollectionSealedProducts(
  opts: { stagingDir?: string; argv?: readonly string[] } = {},
): { written: number; skipped: number } {
  const ledger = readDbzcollectionLedger();
  const sets = enabledDbzcSets(ledger, opts.argv ?? []);
  const stagingRoot = opts.stagingDir ?? dbzcollectionStagingDir();
  const products: Parameters<typeof writeLocalSealedProducts>[0]["products"] =
    [];

  for (const set of sets) {
    const packsDir = path.join(setStagingDir(set.setCode, stagingRoot), "packs");
    if (!existsSync(packsDir)) continue;
    for (const name of readdirSync(packsDir)) {
      if (!name.endsWith(".json")) continue;
      let row: PackManifest;
      try {
        row = JSON.parse(
          readFileSync(path.join(packsDir, name), "utf8"),
        ) as PackManifest;
      } catch {
        continue;
      }
      const artPath = path.join(packsDir, `${row.slug}.jpg`);
      if (!existsSync(artPath)) continue;
      const { kind, category } = packKind(row.label);
      products.push({
        slug: row.slug,
        kind,
        category,
        name: `${set.label} — ${row.label}`,
        source: SOURCE_ID,
        setCode: set.setCode,
        lang: ledger.lang,
        releaseDate: set.setCode === "fr2008" ? "2008-11-01" : "2009-11-19",
        declaredCardCount: null,
        cardsPerPack:
          kind === "booster" ? (set.cardsPerBooster ?? null) : null,
        path: row.listingUrl || dbzcSetListingUrl(set.ids),
        artPath,
      });
    }
  }

  if (!products.length) return { written: 0, skipped: 0 };
  return writeLocalSealedProducts({
    packId: DBS_LAMINCARDS_PACK_ID,
    source: SOURCE_ID,
    products,
  });
}
