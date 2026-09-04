/**
 * Faces Mythos depuis les URLs Shopify de la checklist LorenZone.
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import sharp from "sharp";

import { httpGet } from "@/lib/http/httpClient";
import { packCardsDir, packStagingDir } from "@/lib/packPaths";
import type { LocalPrintsIndex } from "@/providers/shared/cardCatalogue/localPrintsIndex";

import {
  MYTHOS_TITLE_LANG,
  readAllMythosChecklists,
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

/** Prefixed by set — bare `0001.webp` must never satisfy SS2. */
function stagingStem(setCode: string, card: MythosChecklistCard): string {
  const set = setCode.trim().toLowerCase() || NARUTO_MYTHOS_KS1_SET_CODE;
  const g = card.grouping?.trim().toLowerCase();
  const n = card.number.trim().toLowerCase();
  return g ? `${set}-${n}-${g}` : `${set}-${n}`;
}

function stagingName(setCode: string, card: MythosChecklistCard): string {
  return `${stagingStem(setCode, card)}.bin`;
}

function diskCard(card: MythosChecklistCard): string {
  const g = card.grouping?.trim().toLowerCase();
  const n = card.number.trim().toLowerCase();
  return g ? `${n}-${g}` : n;
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
      validateStatus: (status: number) => status === 200,
    });
    const data = res.data;
    if (!data || data.byteLength < 500) return null;
    return Buffer.from(data);
  } catch {
    return null;
  }
}

/** Shopify often serves PNG/JPEG; always persist real WebP under `.webp`. */
export async function mythosFaceToWebp(buf: Buffer): Promise<Buffer> {
  return sharp(buf).rotate().webp({ quality: 90 }).toBuffer();
}

function isRealWebp(buf: Buffer): boolean {
  return (
    buf.length >= 12 &&
    buf.toString("ascii", 0, 4) === "RIFF" &&
    buf.toString("ascii", 8, 12) === "WEBP"
  );
}

function resolveStagingFile(
  staging: string,
  setCode: string,
  card: MythosChecklistCard,
): string | null {
  const set = setCode.trim().toLowerCase() || NARUTO_MYTHOS_KS1_SET_CODE;
  const preferred = path.join(staging, stagingName(set, card));
  if (existsSync(preferred)) return preferred;
  const setWebp = path.join(staging, `${stagingStem(set, card)}.webp`);
  if (existsSync(setWebp)) return setWebp;
  // Pre-set-prefix KS1 only.
  if (set === NARUTO_MYTHOS_KS1_SET_CODE) {
    const g = card.grouping?.trim().toLowerCase();
    const n = card.number.trim().toLowerCase();
    const bare = g ? `${n}-${g}` : n;
    for (const name of [`${bare}.bin`, `${bare}.webp`]) {
      const p = path.join(staging, name);
      if (existsSync(p)) return p;
    }
  }
  return null;
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
  const ledgers = readAllMythosChecklists();
  const staging = opts.stagingDir ?? mythosFacesStagingDir();
  mkdirSync(staging, { recursive: true });

  let cards = 0;
  let ok = 0;
  let skip = 0;
  let fail = 0;
  for (const ledger of ledgers) {
    const setCode =
      ledger.set?.code?.trim().toLowerCase() || NARUTO_MYTHOS_KS1_SET_CODE;
    for (const card of ledger.cards) {
      cards += 1;
      const url = card.faceUrl?.trim();
      if (!url) {
        skip += 1;
        continue;
      }
      const dest = path.join(staging, stagingName(setCode, card));
      if (
        !opts.force &&
        (existsSync(dest) || resolveStagingFile(staging, setCode, card))
      ) {
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
  }

  return { cards, ok, skip, fail };
}

export type MythosFaceInstall = { faces: number; missing: string[] };

export async function installMythosFaces(
  index: LocalPrintsIndex,
  opts: { stagingDir?: string } = {},
): Promise<MythosFaceInstall> {
  const ledgers = readAllMythosChecklists();
  const staging = opts.stagingDir ?? mythosFacesStagingDir();
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
      missing: ledgers.flatMap((l) =>
        l.cards.filter((c) => c.faceUrl).map((c) => c.printed),
      ),
    };
  }

  for (const ledger of ledgers) {
    const setCode =
      ledger.set?.code?.trim().toLowerCase() || NARUTO_MYTHOS_KS1_SET_CODE;
    const lang =
      setCode === NARUTO_MYTHOS_KS1_SET_CODE ? MYTHOS_TITLE_LANG : "en";
    for (const card of ledger.cards) {
      if (!card.faceUrl) continue;
      const from = resolveStagingFile(staging, setCode, card);
      if (!from) {
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
      const dest = path.join(destDir, art);
      try {
        const raw = readFileSync(from);
        writeFileSync(
          dest,
          isRealWebp(raw) ? raw : await mythosFaceToWebp(raw),
        );
      } catch {
        missing.push(card.printed);
        continue;
      }
      assets.push({
        printKey,
        lang,
        art,
        sourceUrl: card.faceUrl,
      });
    }
  }

  if (assets.length) index.writeAssets(assets);
  return { faces: assets.length, missing };
}

/** One-shot: re-encode on-disk `art.*.webp` that are still PNG/JPEG bytes. */
export async function reencodeMythosDiskFaces(opts: {
  cardsRoot?: string;
} = {}): Promise<{ converted: number; skipped: number; failed: number }> {
  const root = opts.cardsRoot ?? packCardsDir(NARUTO_MYTHOS_PACK_ID);
  let converted = 0;
  let skipped = 0;
  let failed = 0;
  const files: string[] = [];

  const walk = (dir: string) => {
    if (!existsSync(dir)) return;
    for (const name of readdirSync(dir)) {
      const p = path.join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/^art\..+\.webp$/i.test(name)) files.push(p);
    }
  };
  walk(root);

  for (const file of files) {
    try {
      const raw = readFileSync(file);
      if (isRealWebp(raw)) {
        skipped += 1;
        continue;
      }
      writeFileSync(file, await mythosFaceToWebp(raw));
      converted += 1;
    } catch {
      failed += 1;
    }
  }
  return { converted, skipped, failed };
}
