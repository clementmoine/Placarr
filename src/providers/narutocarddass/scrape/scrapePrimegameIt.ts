/**
 * Primegame.it Italian singles — expansion rubrics + `/ajax/get_singles`.
 *
 * Stock was **0** on every Naruto rubric when probed 2026-09-02. The scraper
 * still writes staging so a later sync picks up tcg trend thumbs when listings
 * return. No store crawl — one POST per expansion page, same contract as the
 * site's own `aggiorna()` JS.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { httpGet } from "@/lib/http/httpClient";
import { dataRoot } from "@/lib/runtimeData";

import { upsertNarutoAppearances } from "../migrateCardLayout";
import { narutoCardAbsDir } from "../narutoCardDisk";
import {
  existingNarutoArtForSource,
  extFromMagic,
  saveNarutoFace,
} from "../narutoFaceBytes";
import { NARUTO_PACK_ID } from "../packs";
import type { NarutoPrintRow, NarutoTitleRow } from "../indexStore";
import {
  mergePrimegameItIntoIndex,
  parsePrimegameExpansions,
  parsePrimegameSinglesAjax,
  parsePrimegameSinglesResultCount,
  tcgTrendFaceUrl,
  type PrimegameItCard,
  type PrimegameItExpansion,
} from "../parse/parsePrimegameIt";

export const NARUTO_STAGING_PRIMEGAME_IT = path.join("staging", "primegame-it");
export const PRIMEGAME_IT_LANG = "it";
export const PRIMEGAME_IT_FACE_SOURCE = "primegame" as const;
export const PRIMEGAME_IT_HUB = "https://www.primegame.it/Singole/Naruto";
export const PRIMEGAME_IT_AJAX = "https://www.primegame.it/ajax/get_singles";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
const DEFAULT_DELAY_MS = 350;
const MIN_FACE_BYTES = 4_000;
const RECORDS_PER_PAGE = 48;

const sleep = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

function packRoot(dataDir?: string): string {
  return path.join(dataDir ?? dataRoot(), NARUTO_PACK_ID);
}

export function primegameItLedgerPath(packDir?: string): string {
  return path.join(
    packDir ?? packRoot(),
    NARUTO_STAGING_PRIMEGAME_IT,
    "cards.json",
  );
}

export function primegameItExpansionsPath(packDir?: string): string {
  return path.join(
    packDir ?? packRoot(),
    NARUTO_STAGING_PRIMEGAME_IT,
    "expansions.json",
  );
}

export function loadPrimegameItLedger(packDir?: string): PrimegameItCard[] {
  const file = primegameItLedgerPath(packDir);
  if (!existsSync(file)) return [];
  try {
    const raw = JSON.parse(readFileSync(file, "utf8")) as { cards?: unknown };
    if (!Array.isArray(raw.cards)) return [];
    return raw.cards.filter((row): row is PrimegameItCard => {
      if (!row || typeof row !== "object") return false;
      const card = row as PrimegameItCard;
      return (
        typeof card.number === "string" &&
        typeof card.name === "string" &&
        typeof card.setCode === "string" &&
        typeof card.printedRef === "string" &&
        typeof card.productId === "number"
      );
    });
  } catch {
    return [];
  }
}

export function mergePrimegameItLedgerIntoIndex(input: {
  prints: NarutoPrintRow[];
  titles: NarutoTitleRow[];
  packDir?: string;
}) {
  return mergePrimegameItIntoIndex({
    prints: input.prints,
    titles: input.titles,
    cards: loadPrimegameItLedger(input.packDir),
  });
}

export type ScrapePrimegameItOptions = {
  force?: boolean;
  delayMs?: number;
  limit?: number;
  root?: string;
  /** Download tcg trend thumbs when rows exist. */
  faces?: boolean;
};

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const res = await httpGet<string>(url, {
      headers: { "User-Agent": UA, Accept: "text/html" },
      responseType: "text",
      timeout: 45_000,
      validateStatus: (status) => status === 200,
    });
    const html =
      typeof res.data === "string" ? res.data : String(res.data ?? "");
    return html.length > 500 ? html : null;
  } catch {
    return null;
  }
}

async function fetchSinglesPage(
  expansion: PrimegameItExpansion,
  page: number,
): Promise<string | null> {
  const body = new URLSearchParams({
    pagina: String(page),
    categoria: "Naruto",
    tipologia: "",
    stato: "",
    lingua: "",
    prezzi: "0",
    numrecpagina: String(RECORDS_PER_PAGE),
    ordine: "",
    modo: "grid",
    testo: "",
    sottocat: `${expansion.expansionId};`,
    categoriapag: "Naruto",
    singole: "true",
    rarita: "",
  });
  try {
    const res = await httpGet<string>(PRIMEGAME_IT_AJAX, {
      method: "POST",
      headers: {
        "User-Agent": UA,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "text/html",
      },
      data: body.toString(),
      responseType: "text",
      timeout: 30_000,
      validateStatus: (status) => status === 200,
    });
    const html =
      typeof res.data === "string" ? res.data : String(res.data ?? "");
    return html.length > 100 ? html : null;
  } catch {
    return null;
  }
}

async function downloadFace(url: string): Promise<Buffer | null> {
  try {
    const res = await httpGet<ArrayBuffer>(url, {
      headers: { "User-Agent": UA, Accept: "image/*,*/*;q=0.8" },
      responseType: "arraybuffer",
      timeout: 20_000,
      validateStatus: (status) => status === 200,
    });
    const buf = Buffer.from(res.data as ArrayBuffer);
    if (extFromMagic(buf) === ".bin") return null;
    return buf.byteLength >= MIN_FACE_BYTES ? buf : null;
  } catch {
    return null;
  }
}

async function crawlExpansion(
  expansion: PrimegameItExpansion,
  delayMs: number,
): Promise<PrimegameItCard[]> {
  const byNumber = new Map<string, PrimegameItCard>();
  let page = 1;
  let total = 0;
  while (page <= 20) {
    const html = await fetchSinglesPage(expansion, page);
    if (!html) break;
    if (page === 1) total = parsePrimegameSinglesResultCount(html);
    for (const row of parsePrimegameSinglesAjax(html, expansion)) {
      if (!byNumber.has(row.number)) byNumber.set(row.number, row);
    }
    if (page * RECORDS_PER_PAGE >= total || total === 0) break;
    page += 1;
    await sleep(delayMs);
  }
  return [...byNumber.values()];
}

export async function scrapePrimegameIt(
  opts: ScrapePrimegameItOptions = {},
): Promise<{
  expansions: number;
  listed: number;
  downloaded: number;
  skipped: number;
  failed: number;
}> {
  const rootDir = packRoot(opts.root);
  const staging = path.join(rootDir, NARUTO_STAGING_PRIMEGAME_IT);
  mkdirSync(staging, { recursive: true });
  const delay = opts.delayMs ?? DEFAULT_DELAY_MS;
  const force = opts.force === true;
  const cardsPath = primegameItLedgerPath(rootDir);
  const expansionsPath = primegameItExpansionsPath(rootDir);

  if (!force && existsSync(cardsPath) && existsSync(expansionsPath)) {
    const existing = loadPrimegameItLedger(rootDir);
    console.log(
      `── Primegame IT : ${existing.length} cartes en staging (skip — --force pour refetch)`,
    );
    return {
      expansions: JSON.parse(readFileSync(expansionsPath, "utf8")).expansions
        ?.length ?? 0,
      listed: existing.length,
      downloaded: 0,
      skipped: existing.length,
      failed: 0,
    };
  }

  console.log("── Primegame IT → staging/primegame-it (Singole/Naruto + ajax)");
  const hub = await fetchHtml(PRIMEGAME_IT_HUB);
  if (!hub) {
    console.warn("── Primegame IT : hub inaccessible");
    return { expansions: 0, listed: 0, downloaded: 0, skipped: 0, failed: 0 };
  }
  const expansions = parsePrimegameExpansions(hub);
  writeFileSync(
    expansionsPath,
    `${JSON.stringify(
      {
        source: PRIMEGAME_IT_HUB,
        observed: new Date().toISOString(),
        expansions,
      },
      null,
      2,
    )}\n`,
  );

  const byNumber = new Map<string, PrimegameItCard>();
  for (const expansion of expansions) {
    if (!expansion.setCode || expansion.setCode === "s7" || expansion.setCode === "s8") {
      console.log(
        `   Primegame ${expansion.slug} (${expansion.expansionId}) → skip titres (set ${expansion.setCode ?? "?"} hors catalogue)`,
      );
      continue;
    }
    const rows = await crawlExpansion(expansion, delay);
    for (const row of rows) byNumber.set(row.number, row);
    console.log(
      `   Primegame ${expansion.setCode} (${expansion.expansionId}) → ${rows.length} en stock`,
    );
    await sleep(delay);
  }

  let cards = [...byNumber.values()].sort((a, b) =>
    a.number.localeCompare(b.number),
  );
  if (opts.limit && opts.limit > 0) cards = cards.slice(0, opts.limit);

  writeFileSync(
    cardsPath,
    `${JSON.stringify(
      {
        source: PRIMEGAME_IT_AJAX,
        lang: PRIMEGAME_IT_LANG,
        generatedAt: new Date().toISOString(),
        ingest: "titles",
        cards,
      },
      null,
      2,
    )}\n`,
  );
  console.log(`── Primegame IT : ${cards.length} cartes, ${expansions.length} rubriques`);

  if (opts.faces !== true || cards.length === 0) {
    return {
      expansions: expansions.length,
      listed: cards.length,
      downloaded: 0,
      skipped: 0,
      failed: 0,
    };
  }

  const cardsDir = path.join(rootDir, "cards");
  let downloaded = 0;
  let skipped = 0;
  let failed = 0;
  const appearances: { diskId: string; lang: string; appearanceSet: string }[] =
    [];

  for (const card of cards) {
    const cardDir = narutoCardAbsDir(cardsDir, card.number, PRIMEGAME_IT_LANG);
    if (!cardDir) {
      failed += 1;
      continue;
    }
    appearances.push({
      diskId: card.number,
      lang: PRIMEGAME_IT_LANG,
      appearanceSet: card.setCode,
    });
    if (
      !force &&
      existingNarutoArtForSource(cardDir, PRIMEGAME_IT_FACE_SOURCE)
    ) {
      skipped += 1;
      continue;
    }
    const url = card.thumbUrl ?? tcgTrendFaceUrl(card.productId);
    const buf = await downloadFace(url);
    if (!buf) {
      failed += 1;
      continue;
    }
    const saved = await saveNarutoFace({
      cardDir,
      buf,
      source: PRIMEGAME_IT_FACE_SOURCE,
      lang: PRIMEGAME_IT_LANG,
      force,
    });
    if (saved === "skip") skipped += 1;
    else downloaded += 1;
    await sleep(delay);
  }
  upsertNarutoAppearances(rootDir, appearances);
  return {
    expansions: expansions.length,
    listed: cards.length,
    downloaded,
    skipped,
    failed,
  };
}
