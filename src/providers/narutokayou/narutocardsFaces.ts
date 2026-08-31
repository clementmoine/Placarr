/**
 * Kayou faces — narutocards.ca, capsulecorpgear.com, alertehit/narutodex.
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
} from "node:fs";
import path from "node:path";

import { httpGet } from "@/lib/http/httpClient";
import { writeLosslessWebpFile } from "@/lib/media/losslessWebp";
import { packCardsDir, packStagingDir } from "@/lib/packPaths";
import type { LocalPrintsIndex } from "@/providers/shared/cardCatalogue/localPrintsIndex";

import {
  KAYOU_TITLE_LANG,
  readKayouChecklist,
  type KayouChecklistCard,
} from "./buildFromLedgers";
import { canonicalizeKayouNumber } from "./kayouIdNormalize";
import type { KayouChecklistSet } from "./kayouLedgerTypes";
import { NARUTO_KAYOU_PACK_ID } from "./pack";
import { kayouPrintKey } from "./printKey";

const STAGING_FOLDER = "kayou-faces";
const DEFAULT_SOURCE_ID = "narutocards";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

export function kayouFacesStagingDir(): string {
  return path.join(packStagingDir(NARUTO_KAYOU_PACK_ID), STAGING_FOLDER);
}

function stagingName(set: KayouChecklistSet, card: KayouChecklistCard): string {
  const number = canonicalizeKayouNumber(card.number);
  return `${set.code}-${number}.webp`;
}

/** CDN URLs to try — narutocards.ca first, then CCG, then hitmarket. */
export function kayouFaceUrlCandidates(card: KayouChecklistCard): string[] {
  const out: string[] = [];
  const add = (url: string) => {
    const u = url.trim();
    if (u && !out.includes(u)) out.push(u);
  };
  const rank = (url: string): number => {
    if (url.includes("kayouofficial.com")) return 0;
    if (url.includes("narutocards.ca")) return 1;
    if (url.includes("capsulecorpgear.com")) return 2;
    if (url.includes("hitmarket.fr")) return 3;
    return 4;
  };
  if (card.faceUrl?.trim()) add(card.faceUrl);
  for (const alt of card.faceUrlAlternates ?? []) add(alt);
  out.sort((a, b) => rank(a) - rank(b));
  for (const url of [...out]) {
    if (/\.webp$/i.test(url)) add(url.replace(/\.webp$/i, ".jpg"));
  }
  return out;
}

function refererForUrl(url: string, fallback: string): string {
  try {
    return new URL(url).origin + "/";
  } catch {
    return fallback;
  }
}

function artSourceId(card: KayouChecklistCard, chosenUrl: string | null): string {
  const tagged = card.faceSource?.trim();
  if (tagged) return tagged;
  if (chosenUrl?.includes("kayouofficial.com")) return "kayouofficial";
  if (chosenUrl?.includes("capsulecorpgear.com")) return "capsulecorpgear";
  if (chosenUrl?.includes("hitmarket.fr")) return "alertehit";
  return DEFAULT_SOURCE_ID;
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
    if (!data || data.byteLength < 500) return null;
    return Buffer.from(data);
  } catch {
    return null;
  }
}

/**
 * CapsuleCorp `-H-` filenames mark landscape panels, but the JPEGs are often
 * portrait pivots. Do **not** rewrite pixels here — skin-tone heuristics pick
 * the wrong ±90° (wedding MRs). Prefer kayouofficial native landscape fronts,
 * else keep the portrait scan and let `landscapePrint` + CSS quarter-turn.
 */
export async function uprightKayouHorizontalScan(
  buf: Buffer,
  _sourceUrl: string,
): Promise<Buffer> {
  return buf;
}

export type KayouFaceHarvest = {
  cards: number;
  ok: number;
  skip: number;
  fail: number;
};

export async function harvestKayouFaces(
  opts: { force?: boolean; stagingDir?: string; delayMs?: number } = {},
): Promise<KayouFaceHarvest> {
  const ledger = readKayouChecklist();
  const staging = opts.stagingDir ?? kayouFacesStagingDir();
  mkdirSync(staging, { recursive: true });

  let ok = 0;
  let skip = 0;
  let fail = 0;
  let cards = 0;
  for (const set of ledger.sets) {
    for (const card of set.cards) {
      cards += 1;
      const dest = path.join(staging, stagingName(set, card));
      if (!opts.force && existsSync(dest)) {
        skip += 1;
        continue;
      }
      let buf: Buffer | null = null;
      let chosenUrl: string | null = null;
      const candidates = kayouFaceUrlCandidates(card);
      for (const url of candidates) {
        buf = await downloadImage(url, refererForUrl(url, set.url));
        if (buf) {
          chosenUrl = url;
          break;
        }
      }
      if (!buf) {
        fail += 1;
      } else {
        const upright = await uprightKayouHorizontalScan(buf, chosenUrl ?? "");
        await writeLosslessWebpFile(upright, dest);
        ok += 1;
      }
      if (opts.delayMs !== 0) {
        await new Promise((r) => setTimeout(r, opts.delayMs ?? 25));
      }
    }
  }

  return { cards, ok, skip, fail };
}

export type KayouFaceInstall = { faces: number; missing: string[] };

export function installKayouFaces(
  index: LocalPrintsIndex,
  opts: { stagingDir?: string } = {},
): KayouFaceInstall {
  const ledger = readKayouChecklist();
  const staging = opts.stagingDir ?? kayouFacesStagingDir();
  const lang = KAYOU_TITLE_LANG;
  const missing: string[] = [];
  const assets: {
    printKey: string;
    lang: string;
    art: string;
    sourceUrl: string;
  }[] = [];

  if (!existsSync(staging)) {
    return {
      faces: 0,
      missing: ledger.sets.flatMap((s) =>
        s.cards.map((c) => `${s.slug}:${c.printed}`),
      ),
    };
  }

  for (const set of ledger.sets) {
    const setCode = set.code.trim().toLowerCase();
    for (const card of set.cards) {
      const src = path.join(staging, stagingName(set, card));
      if (!existsSync(src)) {
        missing.push(`${set.slug}:${card.printed}`);
        continue;
      }
      const number = canonicalizeKayouNumber(card.number.trim().toLowerCase());
      const printKey = kayouPrintKey(setCode, number);
      if (!printKey) {
        missing.push(`${set.slug}:${card.printed}`);
        continue;
      }
      const destDir = path.join(
        packCardsDir(NARUTO_KAYOU_PACK_ID),
        setCode,
        lang,
        number,
      );
      mkdirSync(destDir, { recursive: true });
      const candidates = kayouFaceUrlCandidates(card);
      const sourceUrl = candidates[0] ?? set.url;
      const art = `art.${artSourceId(card, sourceUrl)}.webp`;
      copyFileSync(src, path.join(destDir, art));
      assets.push({
        printKey,
        lang,
        art,
        sourceUrl,
      });
    }
  }

  if (assets.length) index.writeAssets(assets);
  return { faces: assets.length, missing };
}
