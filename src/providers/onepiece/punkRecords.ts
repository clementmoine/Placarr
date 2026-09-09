/**
 * Catalogue OPTCG depuis punk-records (sortie vegapull, multi-langues).
 *
 * Télécharge `cards_by_id.json` FR/EN depuis GitHub → staging, pose les
 * tirages (`onepiece:op01-001`) et les faces Bandai (`art.bandai.webp`).
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { httpGet } from "@/lib/http/httpClient";
import { toLosslessWebp } from "@/lib/media/losslessWebp";
import { packCardsDir, packStagingDir } from "@/lib/packPaths";
import type {
  LocalPrintAssetWrite,
  LocalPrintsIndex,
  LocalPrintWrite,
} from "@/providers/shared/cardCatalogue/localPrintsIndex";
import { cardDiskIdFromPrintKey } from "@/lib/packAssetUrls";

import { ONEPIECE_PACK_ID } from "./pack";
import {
  formatOnepieceReference,
  onepiecePrintIdentity,
  onepiecePrintKey,
} from "./printIdentity";

const STAGING_FOLDER = "punk-records";
const SOURCE_ID = "bandai";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

/** Locales punk-records → lang Placarr. */
export const PUNK_RECORDS_LOCALES = [
  { punk: "french", lang: "fr" },
  { punk: "english", lang: "en" },
] as const;

export type PunkRecordsCard = {
  cardId: string;
  name: string;
  rarity: string | null;
  imgUrl: string | null;
  category: string | null;
};

export type PunkRecordsLocaleIndex = {
  lang: string;
  cards: PunkRecordsCard[];
};

function punkRecordsRawUrl(punkLocale: string): string {
  return `https://raw.githubusercontent.com/buhbbl/punk-records/main/${punkLocale}/index/cards_by_id.json`;
}

export function onepiecePunkStagingDir(): string {
  return path.join(packStagingDir(ONEPIECE_PACK_ID), STAGING_FOLDER);
}

function decodeHtmlName(raw: string): string {
  return raw
    .replace(/&nbsp;/gi, " ")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Parse `cards_by_id.json` — clés = id Bandai (`OP01-001_p1`).
 */
export function parsePunkRecordsCardsById(
  json: unknown,
): PunkRecordsCard[] {
  if (!json || typeof json !== "object" || Array.isArray(json)) return [];
  const out: PunkRecordsCard[] = [];
  for (const [cardId, row] of Object.entries(
    json as Record<string, unknown>,
  )) {
    if (!row || typeof row !== "object") continue;
    const rec = row as Record<string, unknown>;
    const id =
      typeof rec.card_id === "string" && rec.card_id.trim()
        ? rec.card_id.trim()
        : cardId.trim();
    if (!id || !onepiecePrintKey(id)) continue;
    const nameRaw =
      typeof rec.name === "string"
        ? rec.name
        : typeof rec.card_id === "string"
          ? rec.card_id
          : id;
    const name = decodeHtmlName(nameRaw);
    if (!name) continue;
    out.push({
      cardId: id,
      name,
      rarity: typeof rec.rarity === "string" ? rec.rarity.trim() || null : null,
      imgUrl: typeof rec.img_url === "string" ? rec.img_url.trim() || null : null,
      category:
        typeof rec.category === "string" ? rec.category.trim() || null : null,
    });
  }
  return out.sort((a, b) => a.cardId.localeCompare(b.cardId));
}

export function buildOnepiecePrintWrites(
  locales: readonly PunkRecordsLocaleIndex[],
): LocalPrintWrite[] {
  const byKey = new Map<
    string,
    {
      printKey: string;
      setCode: string;
      number: string;
      grouping: string | null;
      category: string | null;
      sourceUrl: string | null;
      titles: Map<string, { fullName: string; rarity: string | null }>;
    }
  >();

  for (const locale of locales) {
    for (const card of locale.cards) {
      const identity = onepiecePrintIdentity(card.cardId);
      const printKey = onepiecePrintKey(card.cardId);
      if (!identity || !printKey) continue;
      let row = byKey.get(printKey);
      if (!row) {
        row = {
          printKey,
          setCode: identity.set,
          number: identity.number,
          grouping: identity.grouping ?? null,
          category: card.category,
          sourceUrl: card.imgUrl,
          titles: new Map(),
        };
        byKey.set(printKey, row);
      }
      if (!row.category && card.category) row.category = card.category;
      if (!row.sourceUrl && card.imgUrl) row.sourceUrl = card.imgUrl;
      if (!row.titles.has(locale.lang)) {
        row.titles.set(locale.lang, {
          fullName: card.name,
          rarity: card.rarity,
        });
      }
    }
  }

  return [...byKey.values()]
    .map((row) => ({
      printKey: row.printKey,
      setCode: row.setCode,
      number: row.number,
      cardType: row.setCode,
      grouping: row.grouping,
      category: row.category,
      sourceUrl: row.sourceUrl,
      titles: [...row.titles.entries()].map(([lang, t]) => ({
        lang,
        fullName: t.fullName,
        rarity: t.rarity,
      })),
    }))
    .sort((a, b) => a.printKey.localeCompare(b.printKey));
}

async function downloadJson(url: string): Promise<unknown | null> {
  try {
    const res = await httpGet<unknown>(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      timeout: 120_000,
      validateStatus: (s: number) => s === 200,
    });
    return res.data ?? null;
  } catch {
    return null;
  }
}

async function downloadImage(
  url: string,
  referer: string,
): Promise<Buffer | null> {
  try {
    const res = await httpGet<ArrayBuffer>(url, {
      headers: { "User-Agent": UA, Referer: referer },
      responseType: "arraybuffer",
      timeout: 40_000,
      validateStatus: (s: number) => s === 200,
    });
    const data = res.data;
    if (!data || data.byteLength < 500) return null;
    return Buffer.from(data);
  } catch {
    return null;
  }
}

export type PunkRecordsHarvest = {
  locales: number;
  cards: number;
  ok: number;
  skip: number;
  fail: number;
};

/**
 * Revalidate punk-records indexes (LorcanaJSON / Pokémon CDN style).
 *
 * Always GETs upstream. Writes only when the payload moved (or `--force`).
 * Skipping forever on a local staging file froze OPTCG on the first harvest.
 */
export async function harvestPunkRecords(
  opts: { force?: boolean; stagingDir?: string } = {},
): Promise<PunkRecordsHarvest> {
  const staging = opts.stagingDir ?? onepiecePunkStagingDir();
  mkdirSync(staging, { recursive: true });
  let ok = 0;
  let skip = 0;
  let fail = 0;
  let cards = 0;

  for (const { punk, lang } of PUNK_RECORDS_LOCALES) {
    const dest = path.join(staging, `${lang}.cards_by_id.json`);
    const data = await downloadJson(punkRecordsRawUrl(punk));
    if (!data || typeof data !== "object") {
      fail += 1;
      if (existsSync(dest)) {
        try {
          cards += Object.keys(JSON.parse(readFileSync(dest, "utf8"))).length;
        } catch {
          /* ignore */
        }
      }
      continue;
    }
    const next = `${JSON.stringify(data)}\n`;
    const count = Object.keys(data as object).length;
    const prior =
      !opts.force && existsSync(dest) ? readFileSync(dest, "utf8") : null;
    if (prior === next) {
      skip += 1;
      cards += count;
      continue;
    }
    writeFileSync(dest, next, "utf8");
    ok += 1;
    cards += count;
    console.log(`   punk-records ${lang} — ${count} cartes`);
  }

  return {
    locales: PUNK_RECORDS_LOCALES.length,
    cards,
    ok,
    skip,
    fail,
  };
}

export function loadPunkRecordsLocales(
  stagingDir = onepiecePunkStagingDir(),
): PunkRecordsLocaleIndex[] {
  const out: PunkRecordsLocaleIndex[] = [];
  for (const { lang } of PUNK_RECORDS_LOCALES) {
    const file = path.join(stagingDir, `${lang}.cards_by_id.json`);
    if (!existsSync(file)) continue;
    const cards = parsePunkRecordsCardsById(
      JSON.parse(readFileSync(file, "utf8")),
    );
    out.push({ lang, cards });
  }
  return out;
}

export function seedOnepieceFromPunkRecords(
  index: LocalPrintsIndex,
  opts: { stagingDir?: string } = {},
): { prints: number; titles: number } {
  const locales = loadPunkRecordsLocales(
    opts.stagingDir ?? onepiecePunkStagingDir(),
  );
  const writes = buildOnepiecePrintWrites(locales);
  if (writes.length) index.writePrints(writes);
  return {
    prints: writes.length,
    titles: writes.reduce((n, w) => n + w.titles.length, 0),
  };
}

export type OnepieceFacesInstall = {
  faces: number;
  skip: number;
  fail: number;
};

/**
 * Pose `art.bandai.webp` sous `cards/{set}/{lang}/{number[-grouping]}/`.
 * Préfère l'URL de la locale ; sinon emprunte une autre langue du ledger.
 */
export async function installOnepieceBandaiFaces(
  index: LocalPrintsIndex,
  opts: { force?: boolean; stagingDir?: string; delayMs?: number } = {},
): Promise<OnepieceFacesInstall> {
  const locales = loadPunkRecordsLocales(
    opts.stagingDir ?? onepiecePunkStagingDir(),
  );
  const byKeyLang = new Map<string, PunkRecordsCard>();
  for (const locale of locales) {
    for (const card of locale.cards) {
      const printKey = onepiecePrintKey(card.cardId);
      if (!printKey || !card.imgUrl) continue;
      byKeyLang.set(`${printKey}:${locale.lang}`, card);
    }
  }

  const writes = buildOnepiecePrintWrites(locales);
  let faces = 0;
  let skip = 0;
  let fail = 0;
  let processed = 0;
  const assets: LocalPrintAssetWrite[] = [];
  const delayMs = opts.delayMs ?? 40;
  const total = writes.reduce((n, row) => n + row.titles.length, 0);
  console.log(`   faces — ${total} slot${total === 1 ? "" : "s"} (tirages × langues)`);

  const maybeProgress = () => {
    if (processed === total || processed % 250 === 0) {
      console.log(
        `   faces ${processed}/${total} — ok=${faces} skip=${skip} fail=${fail}`,
      );
    }
  };

  for (const row of writes) {
    for (const title of row.titles) {
      processed += 1;
      const disk = cardDiskIdFromPrintKey(row.printKey, title.lang);
      if (!disk) {
        fail += 1;
        maybeProgress();
        continue;
      }
      const destDir = path.join(
        packCardsDir(ONEPIECE_PACK_ID),
        disk.set,
        disk.lang,
        disk.card,
      );
      mkdirSync(destDir, { recursive: true });
      const art = `art.${SOURCE_ID}.webp`;
      const dest = path.join(destDir, art);
      if (!opts.force && existsSync(dest)) {
        skip += 1;
        assets.push({
          printKey: row.printKey,
          lang: title.lang,
          art,
          sourceUrl:
            byKeyLang.get(`${row.printKey}:${title.lang}`)?.imgUrl ??
            row.sourceUrl,
        });
        maybeProgress();
        continue;
      }

      const preferred =
        byKeyLang.get(`${row.printKey}:${title.lang}`) ??
        [...byKeyLang.entries()].find(([k]) =>
          k.startsWith(`${row.printKey}:`),
        )?.[1];
      const imgUrl = preferred?.imgUrl ?? row.sourceUrl;
      if (!imgUrl) {
        fail += 1;
        maybeProgress();
        continue;
      }
      const referer = imgUrl.includes("fr.onepiece")
        ? "https://fr.onepiece-cardgame.com/cardlist/"
        : "https://en.onepiece-cardgame.com/cardlist/";
      const buf = await downloadImage(imgUrl, referer);
      if (!buf) {
        fail += 1;
        maybeProgress();
        continue;
      }
      // Bandai sert du PNG (EN) ou du WebP (FR) — on normalise en lossless WebP.
      try {
        writeFileSync(dest, await toLosslessWebp(buf));
      } catch {
        fail += 1;
        maybeProgress();
        continue;
      }
      faces += 1;
      assets.push({
        printKey: row.printKey,
        lang: title.lang,
        art,
        sourceUrl: imgUrl,
      });
      maybeProgress();
      if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  if (assets.length) index.writeAssets(assets);
  return { faces, skip, fail };
}

export { formatOnepieceReference };
