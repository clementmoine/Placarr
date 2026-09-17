/**
 * Moisson + application des tables nao-yoshi.seesaa.net sur la checklist DCD.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { httpGet } from "@/lib/http/httpClient";
import { packStagingDir } from "@/lib/packPaths";

import {
  dataCarddassChecklistPath,
  readDataCarddassChecklist,
  type DataCarddassChecklistCard,
} from "./buildFromLedgers";
import {
  NARUTO_DATA_CARDDASS_PACK_ID,
  narutoDataCarddassCuratedDir,
} from "./pack";
import {
  NAO_YOSHI_SEESAA_ARTICLES,
  NAO_YOSHI_SEESAA_ORIGIN,
  looksLikeMojibakeJa,
  mergeNaoYoshiSeesaaRows,
  parseNaoYoshiSeesaaBytes,
  type NaoYoshiSeesaaRow,
} from "./parse/parseNaoYoshiSeesaa";

const LEDGER_FILE = "nao-yoshi-seesaa.json";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

export type NaoYoshiSeesaaLedger = {
  source: string;
  sourceId: string;
  origin: string;
  harvestedAt: string;
  articles: Array<{
    id: string;
    cabinet: string;
    label: string;
    url: string;
    rows: number;
  }>;
  rows: NaoYoshiSeesaaRow[];
};

export function naoYoshiSeesaaLedgerPath(): string {
  return path.join(narutoDataCarddassCuratedDir(), "sources", LEDGER_FILE);
}

export function readNaoYoshiSeesaaLedger(): NaoYoshiSeesaaLedger | null {
  const p = naoYoshiSeesaaLedgerPath();
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf8")) as NaoYoshiSeesaaLedger;
}

async function fetchArticleBytes(url: string): Promise<Buffer | null> {
  try {
    const res = await httpGet<ArrayBuffer>(url, {
      headers: { "User-Agent": UA, Accept: "text/html" },
      responseType: "arraybuffer",
      timeout: 40_000,
      validateStatus: (status: number) => status === 200,
    });
    if (!res.data || res.data.byteLength < 400) return null;
    return Buffer.from(res.data);
  } catch {
    return null;
  }
}

export async function harvestNaoYoshiSeesaa(opts: {
  force?: boolean;
  stagingDir?: string;
} = {}): Promise<NaoYoshiSeesaaLedger> {
  const staging =
    opts.stagingDir ??
    path.join(packStagingDir(NARUTO_DATA_CARDDASS_PACK_ID), "nao-yoshi-seesaa");
  mkdirSync(staging, { recursive: true });

  const allRows: NaoYoshiSeesaaRow[] = [];
  const articleMeta: NaoYoshiSeesaaLedger["articles"] = [];

  for (const article of NAO_YOSHI_SEESAA_ARTICLES) {
    const url = `${NAO_YOSHI_SEESAA_ORIGIN}${article.path}`;
    const cachePath = path.join(staging, `${article.id}.html`);
    let buf: Buffer | null = null;
    if (!opts.force && existsSync(cachePath)) {
      buf = readFileSync(cachePath);
    }
    if (!buf || buf.byteLength < 400) {
      buf = await fetchArticleBytes(url);
      if (!buf) {
        console.warn(`── nao-yoshi — échec fetch ${article.id}`);
        continue;
      }
      writeFileSync(cachePath, buf);
    }
    const rows = parseNaoYoshiSeesaaBytes(buf, {
      articleId: article.id,
      cabinet: article.cabinet,
    });
    allRows.push(...rows);
    articleMeta.push({
      id: article.id,
      cabinet: article.cabinet,
      label: article.label,
      url,
      rows: rows.length,
    });
    console.log(
      `── nao-yoshi ${article.cabinet} — ${article.id} : ${rows.length} ligne(s)`,
    );
  }

  const merged = mergeNaoYoshiSeesaaRows(allRows);
  const ledger: NaoYoshiSeesaaLedger = {
    source: "nao-yoshi.seesaa.net",
    sourceId: "nao-yoshi-seesaa",
    origin: NAO_YOSHI_SEESAA_ORIGIN,
    harvestedAt: new Date().toISOString(),
    articles: articleMeta,
    rows: [...merged.values()].sort((a, b) =>
      a.printed.localeCompare(b.printed),
    ),
  };
  writeFileSync(
    naoYoshiSeesaaLedgerPath(),
    JSON.stringify(ledger, null, 2) + "\n",
    "utf8",
  );
  return ledger;
}

export type NaoYoshiApplyReport = {
  total: number;
  nameFixed: number;
  raritySet: number;
  unmatched: number;
  unchanged: number;
};

function shouldReplaceName(
  card: DataCarddassChecklistCard,
  next: string,
): boolean {
  const current = (card.nameJa ?? card.name ?? "").trim();
  if (!next.trim()) return false;
  if (!current) return true;
  if (current === card.printed) return true;
  if (looksLikeMojibakeJa(current)) return true;
  return false;
}

/**
 * Overlay Seesaa names + rarities onto the checklist JSON (in place).
 */
export function applyNaoYoshiSeesaaToChecklist(
  opts: {
    ledger?: NaoYoshiSeesaaLedger | null;
    dryRun?: boolean;
  } = {},
): NaoYoshiApplyReport {
  const ledger = opts.ledger ?? readNaoYoshiSeesaaLedger();
  if (!ledger) {
    return {
      total: 0,
      nameFixed: 0,
      raritySet: 0,
      unmatched: 0,
      unchanged: 0,
    };
  }
  const byPrinted = mergeNaoYoshiSeesaaRows(ledger.rows);
  const checklist = readDataCarddassChecklist();
  let nameFixed = 0;
  let raritySet = 0;
  let unmatched = 0;
  let unchanged = 0;

  const nextCards: DataCarddassChecklistCard[] = checklist.cards.map((card) => {
    const hit = byPrinted.get(card.printed.toUpperCase());
    if (!hit) {
      unmatched += 1;
      return card;
    }
    const updated: DataCarddassChecklistCard = { ...card };
    let changed = false;
    if (shouldReplaceName(card, hit.nameJa)) {
      updated.nameJa = hit.nameJa;
      updated.name = hit.nameJa;
      nameFixed += 1;
      changed = true;
    }
    if (hit.rarity) {
      if (updated.rarity !== hit.rarity) {
        updated.rarity = hit.rarity;
        raritySet += 1;
        changed = true;
      }
    }
    if (hit.barcodeData) {
      updated.barcodeData = hit.barcodeData;
    }
    if (!changed) unchanged += 1;
    return updated;
  });

  const report: NaoYoshiApplyReport = {
    total: checklist.cards.length,
    nameFixed,
    raritySet,
    unmatched,
    unchanged,
  };
  if (opts.dryRun) return report;

  const out = {
    ...checklist,
    cards: nextCards,
    naoYoshiAppliedAt: new Date().toISOString(),
    naoYoshiSource: ledger.source,
  };
  writeFileSync(
    dataCarddassChecklistPath(),
    JSON.stringify(out, null, 2) + "\n",
    "utf8",
  );
  return report;
}
