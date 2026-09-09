/**
 * Harvest + install faces officielles CICABOOM (`art.official.webp`).
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import sharp from "sharp";

import { httpGet } from "@/lib/http/httpClient";
import { packCardsDir, packStagingDir } from "@/lib/packPaths";
import type { LocalPrintsIndex } from "@/providers/shared/cardCatalogue/localPrintsIndex";

import { mythosOfficialChecklistPath } from "./buildFromLedgers";
import { NARUTO_MYTHOS_PACK_ID } from "./pack";
import {
  mergeOfficialMythosLangRows,
  parseOfficialMythosApiPayload,
  type MythosOfficialPrint,
} from "./parseOfficialCards";
import { mythosPrintKey } from "./printKey";

const API = "https://cards.narutotcgmythos.com/api/cards";
const STAGING_FOLDER = "official-faces";
const SOURCE_ID = "official";
const LANGS = ["fr", "en", "it", "es"] as const;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

export function mythosOfficialFacesStagingDir(): string {
  return path.join(packStagingDir(NARUTO_MYTHOS_PACK_ID), STAGING_FOLDER);
}

function diskCard(print: MythosOfficialPrint): string {
  const g = print.grouping?.trim().toLowerCase();
  return g ? `${print.number}-${g}` : print.number;
}

function stagingName(print: MythosOfficialPrint): string {
  return `${print.setCode}-${diskCard(print)}.bin`;
}

function titleLangForSet(setCode: string): string {
  return setCode === "ss2" ? "en" : "fr";
}

async function toWebp(buf: Buffer): Promise<Buffer> {
  return sharp(buf).rotate().webp({ quality: 90 }).toBuffer();
}

export async function fetchOfficialMythosPrints(): Promise<
  MythosOfficialPrint[]
> {
  const byLang: Record<
    string,
    ReturnType<typeof parseOfficialMythosApiPayload>
  > = {};
  for (const lang of LANGS) {
    try {
      const res = await httpGet<unknown>(`${API}?lang=${lang}`, {
        headers: { "User-Agent": UA, Accept: "application/json" },
        timeout: 60_000,
        validateStatus: (s: number) => s === 200,
      });
      byLang[lang] = parseOfficialMythosApiPayload(res.data);
    } catch {
      byLang[lang] = [];
    }
  }
  return mergeOfficialMythosLangRows(byLang, "fr");
}

export function writeOfficialMythosChecklist(
  prints: readonly MythosOfficialPrint[],
): string {
  const bySet = new Map<string, MythosOfficialPrint[]>();
  for (const p of prints) {
    const list = bySet.get(p.setCode) ?? [];
    list.push(p);
    bySet.set(p.setCode, list);
  }
  const payload = {
    source: "cards.narutotcgmythos.com — gallery API officielle CICABOOM",
    url: "https://www.narutotcgmythos.com/fr/galerie",
    api: `${API}?lang=fr`,
    observed: new Date().toISOString().slice(0, 10),
    ingest: "art.official.webp — faces CDN cards.narutotcgmythos.com/storage",
    cards: prints.length,
    sets: [...bySet.entries()].map(([code, rows]) => ({
      code,
      label: rows[0]?.setLabel || code,
      cards: rows.map((c) => ({
        printed: c.printed,
        number: c.number,
        grouping: c.grouping,
        name: c.name,
        rarity: c.rarity,
        faceUrl: c.faceUrl,
        sku: c.sku,
        edition: c.edition || null,
      })),
    })),
  };
  const dest = mythosOfficialChecklistPath();
  mkdirSync(path.dirname(dest), { recursive: true });
  writeFileSync(dest, `${JSON.stringify(payload, null, 2)}\n`);
  return dest;
}

export function readOfficialMythosChecklist(): MythosOfficialPrint[] {
  const p = mythosOfficialChecklistPath();
  if (!existsSync(p)) return [];
  const raw = JSON.parse(readFileSync(p, "utf8")) as {
    sets?: {
      code: string;
      label?: string;
      cards: {
        printed: string;
        number: string;
        grouping: string | null;
        name: string;
        rarity: string | null;
        faceUrl?: string | null;
        sku?: string;
        edition?: string | null;
      }[];
    }[];
  };
  const out: MythosOfficialPrint[] = [];
  for (const set of raw.sets ?? []) {
    for (const c of set.cards) {
      out.push({
        sku: c.sku ?? `${set.code}-${c.number}`,
        uid: null,
        setCode: set.code,
        number: c.number,
        grouping: c.grouping,
        printed: c.printed,
        name: c.name,
        rarity: c.rarity,
        faceUrl: c.faceUrl ?? null,
        edition: c.edition ?? "",
        setLabel: set.label ?? set.code,
        order: null,
      });
    }
  }
  return out;
}

async function downloadImage(url: string): Promise<Buffer | null> {
  try {
    const res = await httpGet<ArrayBuffer>(url, {
      headers: {
        "User-Agent": UA,
        Referer: "https://www.narutotcgmythos.com/",
      },
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

export type OfficialFaceHarvest = {
  cards: number;
  ok: number;
  skip: number;
  fail: number;
  checklistPath: string;
};

export async function harvestOfficialMythosFaces(
  opts: {
    force?: boolean;
    stagingDir?: string;
    prints?: MythosOfficialPrint[];
  } = {},
): Promise<OfficialFaceHarvest> {
  const prints = opts.prints ?? (await fetchOfficialMythosPrints());
  const checklistPath = writeOfficialMythosChecklist(prints);
  const staging = opts.stagingDir ?? mythosOfficialFacesStagingDir();
  mkdirSync(staging, { recursive: true });

  let ok = 0;
  let skip = 0;
  let fail = 0;
  for (const print of prints) {
    const dest = path.join(staging, stagingName(print));
    if (!print.faceUrl) {
      skip += 1;
      continue;
    }
    if (!opts.force && existsSync(dest)) {
      skip += 1;
      continue;
    }
    const buf = await downloadImage(print.faceUrl);
    if (!buf) {
      fail += 1;
    } else {
      mkdirSync(path.dirname(dest), { recursive: true });
      writeFileSync(dest, buf);
      ok += 1;
    }
    await new Promise((r) => setTimeout(r, 25));
  }
  return { cards: prints.length, ok, skip, fail, checklistPath };
}

export type OfficialFaceInstall = { faces: number; missing: string[] };

export async function installOfficialMythosFaces(
  index: LocalPrintsIndex,
  opts: { stagingDir?: string; prints?: MythosOfficialPrint[] } = {},
): Promise<OfficialFaceInstall> {
  const prints = opts.prints ?? readOfficialMythosChecklist();
  const staging = opts.stagingDir ?? mythosOfficialFacesStagingDir();
  const missing: string[] = [];
  const assets: {
    printKey: string;
    lang: string;
    art: string;
    sourceUrl: string;
  }[] = [];

  for (const print of prints) {
    const from = path.join(staging, stagingName(print));
    if (!existsSync(from)) {
      missing.push(`${print.setCode}:${print.printed}`);
      continue;
    }
    const printKey = mythosPrintKey(
      print.setCode,
      print.number,
      print.grouping,
    );
    if (!printKey) {
      missing.push(`${print.setCode}:${print.printed}`);
      continue;
    }
    const lang = titleLangForSet(print.setCode);
    const destDir = path.join(
      packCardsDir(NARUTO_MYTHOS_PACK_ID),
      print.setCode,
      lang,
      diskCard(print),
    );
    mkdirSync(destDir, { recursive: true });
    const art = `art.${SOURCE_ID}.webp`;
    const dest = path.join(destDir, art);
    const raw = readFileSync(from);
    const webp =
      raw.length >= 12 &&
      raw.toString("ascii", 0, 4) === "RIFF" &&
      raw.toString("ascii", 8, 12) === "WEBP"
        ? raw
        : await toWebp(raw);
    writeFileSync(dest, webp);
    assets.push({
      printKey,
      lang,
      art,
      sourceUrl: print.faceUrl ?? API,
    });
  }

  if (assets.length) index.writeAssets(assets);
  return { faces: assets.length, missing };
}
