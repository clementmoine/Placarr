/**
 * Moisson Dragon Ball Center — listings + fiches objet → art.dbc.jpg.
 *
 * Pas de mur bot (contrairement à Coleka). JPEG collectionneur ~549×768 avec
 * EXIF série. Le verso carte est souvent le 2ᵉ chemin `visor(...)`.
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { httpGet } from "@/lib/http/httpClient";
import { packCardsDir, packStagingDir } from "@/lib/packPaths";
import type { LocalPrintsIndex } from "@/providers/shared/cardCatalogue/localPrintsIndex";

import {
  DBS_LAMINCARDS_PACK_ID,
  dbsLamincardsCuratedDir,
} from "./pack";
import {
  DBC_ORIGIN,
  dbcAbsoluteUrl,
  dbcCardFolderName,
  parseDbcListingCards,
  parseDbcObjectFaces,
  type DbcListingCard,
  type DbcSeriesSpec,
} from "./parseDragonballCenter";
import {
  formatLamincardsReference,
  lamincardsPrintKey,
} from "./printKey";

const LEDGER_FILE = "dragonball-center.json";
const STAGING_FOLDER = "dbc-faces";
const SOURCE_ID = "dbc";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
const DELAY_MS = 200;

export type DbcFacesLedger = {
  source: string;
  url: string;
  sourceId: string;
  origin: string;
  series: DbcSeriesSpec[];
};

export type DbcCardManifest = {
  setCode: string;
  lang: string;
  printed: string;
  number: string;
  grouping: string | null;
  rarityLabel: string | null;
  objetoId: string;
  pageUrl: string;
  frontUrl: string | null;
  backUrl: string | null;
  title: string;
};

export function dbcFacesLedgerPath(): string {
  return path.join(dbsLamincardsCuratedDir(), "sources", LEDGER_FILE);
}

export function readDbcFacesLedger(): DbcFacesLedger {
  return JSON.parse(readFileSync(dbcFacesLedgerPath(), "utf8")) as DbcFacesLedger;
}

export function dbcFacesStagingDir(): string {
  return path.join(packStagingDir(DBS_LAMINCARDS_PACK_ID), STAGING_FOLDER);
}

function seriesStagingDir(setCode: string, stagingRoot?: string): string {
  return path.join(stagingRoot ?? dbcFacesStagingDir(), setCode.trim().toLowerCase());
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchText(url: string): Promise<string | null> {
  try {
    const res = await httpGet<string>(url, {
      headers: { "User-Agent": UA, Accept: "text/html" },
      responseType: "text",
      timeout: 40_000,
      validateStatus: (status: number) => status === 200,
    });
    const data = res.data;
    return typeof data === "string" && data.length > 200 ? data : null;
  } catch {
    return null;
  }
}

async function downloadImage(url: string): Promise<Buffer | null> {
  try {
    const res = await httpGet<ArrayBuffer>(url, {
      headers: { "User-Agent": UA, Referer: DBC_ORIGIN + "/" },
      responseType: "arraybuffer",
      timeout: 40_000,
      validateStatus: (status: number) => status === 200,
    });
    const data = res.data;
    if (!data || data.byteLength < 500) return null;
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

export function enabledDbcSeries(
  ledger: DbcFacesLedger,
  argv: readonly string[] = [],
): DbcSeriesSpec[] {
  const filter = parseSeriesFilter(argv);
  return ledger.series.filter((s) => {
    if (filter) return filter.has(s.setCode.trim().toLowerCase());
    return s.enabled !== false;
  });
}

export type DbcHarvest = {
  series: number;
  cards: number;
  ok: number;
  skip: number;
  fail: number;
};

async function harvestSeries(
  series: DbcSeriesSpec,
  opts: { force?: boolean; stagingRoot?: string },
): Promise<{ cards: number; ok: number; skip: number; fail: number }> {
  const staging = seriesStagingDir(series.setCode, opts.stagingRoot);
  mkdirSync(staging, { recursive: true });
  const listingUrl = dbcAbsoluteUrl(series.listingPath);
  const listingDest = path.join(staging, "listing.html");
  let listingHtml: string | null = null;
  if (!opts.force && existsSync(listingDest)) {
    listingHtml = readFileSync(listingDest, "utf8");
  }
  if (!listingHtml || listingHtml.length < 400) {
    listingHtml = await fetchText(listingUrl);
    if (!listingHtml) {
      return { cards: 0, ok: 0, skip: 0, fail: 1 };
    }
    writeFileSync(listingDest, listingHtml, "utf8");
    await sleep(DELAY_MS);
  }

  const cards = parseDbcListingCards(listingHtml);
  let ok = 0;
  let skip = 0;
  let fail = 0;

  for (const card of cards) {
    const result = await harvestOneCard(series, card, staging, Boolean(opts.force));
    if (result === "ok") ok += 1;
    else if (result === "skip") skip += 1;
    else fail += 1;
  }

  writeFileSync(
    path.join(staging, "cards.json"),
    JSON.stringify(
      {
        setCode: series.setCode,
        lang: series.lang,
        listingUrl,
        cards: cards.map((c) =>
          c.grouping ? `${c.number}-${c.grouping}` : c.number,
        ),
        harvestedAt: new Date().toISOString(),
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );

  return { cards: cards.length, ok, skip, fail };
}

async function harvestOneCard(
  series: DbcSeriesSpec,
  card: DbcListingCard,
  staging: string,
  force: boolean,
): Promise<"ok" | "skip" | "fail"> {
  const folder = dbcCardFolderName(card.number, card.grouping);
  const artDest = path.join(staging, `${folder}.front.jpg`);
  const manifestDest = path.join(staging, `${folder}.json`);
  if (!force && existsSync(artDest) && existsSync(manifestDest)) {
    return "skip";
  }

  const pageUrl = dbcAbsoluteUrl(card.pagePath);
  let frontPath = card.frontPath;
  let backPath = card.backPath;

  // Listing sans visor (ou soft-wall) → fiche objet en secours.
  if (!frontPath) {
    const pageDest = path.join(staging, `${folder}.html`);
    let html: string | null = null;
    if (!force && existsSync(pageDest)) {
      html = readFileSync(pageDest, "utf8");
    }
    if (!html || html.length < 400) {
      html = await fetchText(pageUrl);
      if (!html) return "fail";
      writeFileSync(pageDest, html, "utf8");
      await sleep(DELAY_MS);
    }
    const faces = parseDbcObjectFaces(html);
    if (!faces.frontPath) {
      if (existsSync(pageDest)) unlinkSync(pageDest);
      return "fail";
    }
    frontPath = faces.frontPath;
    backPath = faces.backPath;
  }

  const frontUrl = dbcAbsoluteUrl(frontPath);
  const backUrl = backPath ? dbcAbsoluteUrl(backPath) : null;

  if (force || !existsSync(artDest)) {
    const buf = await downloadImage(frontUrl);
    if (!buf) return "fail";
    writeFileSync(artDest, buf);
    await sleep(DELAY_MS);
  }

  if (backUrl) {
    const backDest = path.join(staging, `${folder}.back.jpg`);
    if (force || !existsSync(backDest)) {
      const buf = await downloadImage(backUrl);
      if (buf) {
        writeFileSync(backDest, buf);
        await sleep(DELAY_MS);
      }
    }
  }

  const manifest: DbcCardManifest = {
    setCode: series.setCode,
    lang: series.lang,
    printed: card.printed,
    number: card.number,
    grouping: card.grouping,
    rarityLabel: card.rarityLabel,
    objetoId: card.objetoId,
    pageUrl,
    frontUrl,
    backUrl,
    title: formatLamincardsReference(
      series.setCode,
      card.printed,
      card.rarityLabel,
    ),
  };
  writeFileSync(manifestDest, JSON.stringify(manifest, null, 2) + "\n", "utf8");
  return "ok";
}

export async function harvestDbcFaces(
  opts: {
    force?: boolean;
    stagingDir?: string;
    argv?: readonly string[];
  } = {},
): Promise<DbcHarvest> {
  const ledger = readDbcFacesLedger();
  const seriesList = enabledDbcSeries(ledger, opts.argv ?? []);
  const stagingRoot = opts.stagingDir ?? dbcFacesStagingDir();
  mkdirSync(stagingRoot, { recursive: true });

  let cards = 0;
  let ok = 0;
  let skip = 0;
  let fail = 0;

  for (const series of seriesList) {
    console.log(`── DBC ${series.setCode} — ${series.label}`);
    const report = await harvestSeries(series, {
      force: opts.force,
      stagingRoot,
    });
    cards += report.cards;
    ok += report.ok;
    skip += report.skip;
    fail += report.fail;
    console.log(
      `── DBC ${series.setCode} — ${report.cards} fiche(s) : ${report.ok} DL, ${report.skip} déjà là, ${report.fail} manqué${report.fail === 1 ? "" : "s"}`,
    );
  }

  return { series: seriesList.length, cards, ok, skip, fail };
}

function readManifests(staging: string): DbcCardManifest[] {
  if (!existsSync(staging)) return [];
  const out: DbcCardManifest[] = [];
  for (const name of readdirSync(staging)) {
    if (!name.endsWith(".json") || name === "cards.json") continue;
    try {
      out.push(
        JSON.parse(readFileSync(path.join(staging, name), "utf8")) as DbcCardManifest,
      );
    } catch {
      /* skip */
    }
  }
  return out.sort(
    (a, b) => Number.parseInt(a.printed, 10) - Number.parseInt(b.printed, 10),
  );
}

export type DbcSeedReport = {
  prints: number;
  titles: number;
  faces: number;
  missing: string[];
};

/** Pose tirages + faces depuis le staging DBC. */
export function installDbcFaces(
  index: LocalPrintsIndex,
  opts: { stagingDir?: string; argv?: readonly string[] } = {},
): DbcSeedReport {
  const ledger = readDbcFacesLedger();
  const seriesList = enabledDbcSeries(ledger, opts.argv ?? []);
  const stagingRoot = opts.stagingDir ?? dbcFacesStagingDir();
  let prints = 0;
  let titles = 0;
  let faces = 0;
  const missing: string[] = [];
  const assets: {
    printKey: string;
    lang: string;
    art: string;
    back?: string;
    sourceUrl: string;
  }[] = [];

  for (const series of seriesList) {
    const staging = seriesStagingDir(series.setCode, stagingRoot);
    const manifests = readManifests(staging);
    const printRows = [];

    for (const row of manifests) {
      const printKey = lamincardsPrintKey(
        row.setCode,
        row.number,
        row.grouping ?? null,
      );
      if (!printKey) {
        missing.push(`${row.setCode}:${row.number}`);
        continue;
      }
      const lang = (row.lang || series.lang).trim().toLowerCase();
      const folder = dbcCardFolderName(row.number, row.grouping ?? null);
      printRows.push({
        printKey,
        setCode: row.setCode.trim().toLowerCase(),
        number: row.number,
        cardType: row.setCode.trim().toLowerCase(),
        grouping: row.grouping ?? null,
        sourceUrl: row.pageUrl,
        titles: [
          {
            lang,
            fullName:
              row.title ||
              formatLamincardsReference(
                row.setCode,
                row.printed,
                row.rarityLabel ?? null,
              ),
            rarity: row.rarityLabel ?? null,
          },
        ],
      });

      const artSrc = path.join(staging, `${folder}.front.jpg`);
      if (!existsSync(artSrc)) {
        missing.push(`${row.setCode}:${folder}`);
        continue;
      }
      const destDir = path.join(
        packCardsDir(DBS_LAMINCARDS_PACK_ID),
        row.setCode.trim().toLowerCase(),
        lang,
        folder,
      );
      mkdirSync(destDir, { recursive: true });
      const art = `art.${SOURCE_ID}.jpg`;
      copyFileSync(artSrc, path.join(destDir, art));
      const backSrc = path.join(staging, `${folder}.back.jpg`);
      let back: string | undefined;
      if (existsSync(backSrc)) {
        back = `back.${SOURCE_ID}.jpg`;
        copyFileSync(backSrc, path.join(destDir, back));
      }
      assets.push({
        printKey,
        lang,
        art,
        ...(back ? { back } : {}),
        sourceUrl: row.frontUrl ?? row.pageUrl,
      });
      faces += 1;
    }

    if (printRows.length) {
      const written = index.writePrints(printRows);
      prints += written.prints;
      titles += written.titles;
    }
  }

  if (assets.length) index.writeAssets(assets);
  return { prints, titles, faces, missing };
}
