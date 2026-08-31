/**
 * Faces Mythos depuis les URLs Shopify de la checklist LorenZone.
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { httpGet } from "@/lib/http/httpClient";
import { packCardsDir, packStagingDir } from "@/lib/packPaths";
import type { LocalPrintsIndex } from "@/providers/shared/cardCatalogue/localPrintsIndex";

import {
  MYTHOS_TITLE_LANG,
  readMythosChecklist,
  type MythosChecklistCard,
} from "./buildFromLedgers";
import { NARUTO_MYTHOS_PACK_ID } from "./pack";
import { NARUTO_MYTHOS_KS1_SET_CODE, mythosPrintKey } from "./printKey";

const STAGING_FOLDER = "lorenzone-faces";
const SOURCE_ID = "lorenzone";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

export function mythosFacesStagingDir(): string {
  return path.join(packStagingDir(NARUTO_MYTHOS_PACK_ID), STAGING_FOLDER);
}

function stagingName(card: MythosChecklistCard): string {
  const g = card.grouping?.trim().toLowerCase();
  return g ? `${card.number}-${g}.webp` : `${card.number}.webp`;
}

function diskCard(card: MythosChecklistCard): string {
  const g = card.grouping?.trim().toLowerCase();
  const n = card.number.trim().toLowerCase();
  return g ? `${n}-${g}` : n;
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

export type MythosFaceHarvest = {
  cards: number;
  ok: number;
  skip: number;
  fail: number;
};

export async function harvestMythosFaces(
  opts: { force?: boolean; stagingDir?: string } = {},
): Promise<MythosFaceHarvest> {
  const ledger = readMythosChecklist();
  const staging = opts.stagingDir ?? mythosFacesStagingDir();
  mkdirSync(staging, { recursive: true });

  let ok = 0;
  let skip = 0;
  let fail = 0;
  for (const card of ledger.cards) {
    const url = card.faceUrl?.trim();
    if (!url) {
      fail += 1;
      continue;
    }
    const dest = path.join(staging, stagingName(card));
    if (!opts.force && existsSync(dest)) {
      skip += 1;
      continue;
    }
    const buf = await downloadImage(url, ledger.url);
    if (!buf) {
      fail += 1;
    } else {
      writeFileSync(dest, buf);
      ok += 1;
    }
    await new Promise((r) => setTimeout(r, 40));
  }

  return { cards: ledger.cards.length, ok, skip, fail };
}

export type MythosFaceInstall = { faces: number; missing: string[] };

export function installMythosFaces(
  index: LocalPrintsIndex,
  opts: { stagingDir?: string } = {},
): MythosFaceInstall {
  const ledger = readMythosChecklist();
  const staging = opts.stagingDir ?? mythosFacesStagingDir();
  const setCode =
    ledger.set?.code?.trim().toLowerCase() || NARUTO_MYTHOS_KS1_SET_CODE;
  const lang = MYTHOS_TITLE_LANG;
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
      missing: ledger.cards
        .filter((c) => c.faceUrl)
        .map((c) => c.printed),
    };
  }

  for (const card of ledger.cards) {
    if (!card.faceUrl) continue;
    const src = path.join(staging, stagingName(card));
    if (!existsSync(src)) {
      missing.push(card.printed);
      continue;
    }
    const grouping = card.grouping?.trim().toLowerCase() || null;
    const printKey = mythosPrintKey(setCode, card.number, grouping);
    if (!printKey) {
      missing.push(card.printed);
      continue;
    }
    const destDir = path.join(
      packCardsDir(NARUTO_MYTHOS_PACK_ID),
      setCode,
      lang,
      diskCard(card),
    );
    mkdirSync(destDir, { recursive: true });
    const art = `art.${SOURCE_ID}.webp`;
    copyFileSync(src, path.join(destDir, art));
    assets.push({
      printKey,
      lang,
      art,
      sourceUrl: card.faceUrl,
    });
  }

  if (assets.length) index.writeAssets(assets);
  return { faces: assets.length, missing };
}
