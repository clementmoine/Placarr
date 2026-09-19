/**
 * Kayou faces — official gallery enrich + narutocards / CCG / alertehit harvest.
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
  canonicalizeKayouNumber,
  kayouOfficialIdToCcNumber,
  type KayouChecklist,
  type KayouChecklistCard,
  type KayouChecklistSet,
} from "../identity";
import { KAYOU_TITLE_LANG, NARUTO_KAYOU_PACK_ID } from "../pack";
import { kayouPrintKey } from "../printKey";
import type { KayouOfficialCatalog } from "./crawl";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";


// ─── kayouOfficialFaces ───

function preferOfficialFace(
  card: KayouChecklistCard,
  frontImage: string,
): KayouChecklistCard {
  const url = frontImage.trim();
  if (!url) return card;
  if (card.faceUrl === url) return card;
  const alts = new Set(card.faceUrlAlternates ?? []);
  if (card.faceUrl?.trim()) alts.add(card.faceUrl.trim());
  alts.delete(url);
  return {
    ...card,
    faceUrl: url,
    faceSource: "kayouofficial",
    ...(alts.size ? { faceUrlAlternates: [...alts] } : {}),
  };
}

/** Attach official `frontImage` URLs onto matching `cc.*` checklist rows. */
export function enrichChecklistWithOfficialFaces(
  checklist: KayouChecklist,
  catalog: KayouOfficialCatalog | null = null,
): KayouChecklist {
  if (!catalog?.series?.length) return checklist;

  const byNumber = new Map<string, string>();
  for (const series of catalog.series) {
    for (const card of series.cards) {
      const number = kayouOfficialIdToCcNumber(card.idCode);
      const front = card.frontImage?.trim();
      if (!number || !front) continue;
      // Prefer landscape official scans when several idCodes collide.
      const prev = byNumber.get(number);
      const land =
        typeof card.frontWidth === "number" &&
        typeof card.frontHeight === "number" &&
        card.frontWidth > card.frontHeight;
      if (!prev || land) byNumber.set(number, front);
      // XR L5 front = same illustration as PL5 parallel (Capsule watermark dump).
      const pl5 = number.match(/^(cc\.xr\.\d+)l5$/);
      if (pl5) byNumber.set(`${pl5[1]}pl5`, front);
    }
  }
  if (!byNumber.size) return checklist;

  return {
    ...checklist,
    sets: checklist.sets.map((set) => ({
      ...set,
      cards: set.cards.map((card) => {
        const number = canonicalizeKayouNumber(card.number);
        const front = byNumber.get(number);
        return front ? preferOfficialFace(card, front) : card;
      }),
    })),
  };
}

// ─── narutocardsFaces ───

const STAGING_FOLDER = "kayou-faces";
const DEFAULT_SOURCE_ID = "narutocards";
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
    if (url.includes("narutopia.fr")) return 1;
    if (url.includes("wixstatic.com")) return 2;
    if (url.includes("narutodb.com")) return 3;
    if (url.includes("narutocards.ca")) return 4;
    if (url.includes("capsulecorpgear.com")) return 5;
    if (url.includes("hitmarket.fr")) return 6;
    return 7;
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
  if (chosenUrl?.includes("narutopia.fr")) return "narutopia";
  if (chosenUrl?.includes("wixstatic.com")) return "wixstatic";
  if (chosenUrl?.includes("narutodb.com")) return "narutodb";
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
  opts: {
    checklist: KayouChecklist;
    force?: boolean;
    stagingDir?: string;
    delayMs?: number;
    onProgress?: (message: string) => void;
  },
): Promise<KayouFaceHarvest> {
  const ledger = opts.checklist;
  const staging = opts.stagingDir ?? kayouFacesStagingDir();
  mkdirSync(staging, { recursive: true });

  let ok = 0;
  let skip = 0;
  let fail = 0;
  let cards = 0;
  const total = ledger.sets.reduce((n, s) => n + s.cards.length, 0);
  opts.onProgress?.(`faces staging — ${total} carte(s) checklist…`);
  for (const set of ledger.sets) {
    for (const card of set.cards) {
      cards += 1;
      const dest = path.join(staging, stagingName(set, card));
      if (!opts.force && existsSync(dest)) {
        skip += 1;
        if (cards % 500 === 0 || cards === total) {
          opts.onProgress?.(
            `faces staging — ${cards}/${total} (${ok} new, ${skip} skip, ${fail} miss)`,
          );
        }
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
      if (cards % 50 === 0 || cards === total) {
        opts.onProgress?.(
          `faces staging — ${cards}/${total} (${ok} new, ${skip} skip, ${fail} miss)`,
        );
      }
    }
  }

  return { cards, ok, skip, fail };
}

export type KayouFaceInstall = { faces: number; missing: string[] };

export function installKayouFaces(
  index: LocalPrintsIndex,
  opts: { checklist: KayouChecklist; stagingDir?: string; lang?: string },
): KayouFaceInstall {
  const ledger = opts.checklist;
  const staging = opts.stagingDir ?? kayouFacesStagingDir();
  const lang = (opts.lang ?? KAYOU_TITLE_LANG).toLowerCase();
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
