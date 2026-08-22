/**
 * Moisson et pose des photos arcadegamecards — l'édition américaine.
 *
 * Deux temps, comme le reste du pack. Le listing est lu par
 * `parseArcadeListing`, qui exige trois signaux concordants ; ce module ne fait
 * que descendre les octets et les poser.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { httpGet } from "@/lib/http/httpClient";
import { packCardsDir, packStagingDir } from "@/lib/packPaths";
import type { LocalPrintsIndex } from "@/providers/shared/cardCatalogue/localPrintsIndex";
import { fetchTextWithFlareFallback } from "@/lib/http/scrapeFetch";

import { readInkworksChecklist } from "./buildFromLedgers";
import {
  ARCADE_LANG,
  ARCADE_SOURCE_ID,
  arcadeListingUrls,
  parseArcadeListing,
  type ArcadeCard,
} from "./parseArcadeGameCards";
import { ninjaRanksPrintKey } from "./printKey";
import { NARUTO_RANKS_PACK_ID } from "./pack";

const STAGING_FOLDER = "arcadegamecards";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

export function arcadeStagingDir(): string {
  return path.join(packStagingDir(NARUTO_RANKS_PACK_ID), STAGING_FOLDER);
}

/** La checklist Inkworks sert de troisième signal : le nom doit tomber juste. */
export function inkworksNameLookup(): (
  setCode: string,
  number: string,
) => string | null {
  const byRef = new Map<string, string>();
  for (const card of readInkworksChecklist().cards) {
    byRef.set(
      `${card.setCode.trim().toLowerCase()}-${card.number.trim().toLowerCase()}`,
      card.name,
    );
  }
  return (setCode, number) => byRef.get(`${setCode}-${number}`) ?? null;
}

export function arcadeStagingFile(card: ArcadeCard): string {
  return `${card.setCode}-${card.number}.jpg`;
}

export type ArcadeHarvest = {
  pages: number;
  cards: number;
  ok: number;
  skip: number;
  fail: number;
  rejected: { printed: string; name: string; reason: string }[];
};

export async function harvestArcadeGameCards(
  opts: { force?: boolean } = {},
): Promise<ArcadeHarvest> {
  const dir = arcadeStagingDir();
  mkdirSync(dir, { recursive: true });
  const nameOf = inkworksNameLookup();
  const found = new Map<string, ArcadeCard>();
  const rejected: ArcadeHarvest["rejected"] = [];
  let pages = 0;

  for (const [i, url] of arcadeListingUrls().entries()) {
    const cache = path.join(dir, `listing-${i}.html`);
    let html: string | null = null;
    if (!opts.force && existsSync(cache)) {
      const cached = readFileSync(cache, "utf8");
      if (cached.length > 1_000) html = cached;
    }
    if (!html) {
      html = await fetchTextWithFlareFallback(url, {
        headers: { "User-Agent": UA },
      });
      if (html && html.length > 1_000) writeFileSync(cache, html, "utf8");
    }
    if (!html) continue;
    pages += 1;
    const parsed = parseArcadeListing(html, nameOf);
    for (const card of parsed.cards) {
      const key = `${card.setCode}-${card.number}`;
      if (!found.has(key)) found.set(key, card);
    }
    rejected.push(...parsed.rejected);
    await new Promise((r) => setTimeout(r, 500));
  }

  let ok = 0;
  let skip = 0;
  let fail = 0;
  for (const card of found.values()) {
    const dest = path.join(dir, arcadeStagingFile(card));
    if (!opts.force && existsSync(dest)) {
      skip += 1;
      continue;
    }
    try {
      const res = await httpGet<ArrayBuffer>(card.imageUrl, {
        headers: { "User-Agent": UA, Referer: arcadeListingUrls()[0]! },
        responseType: "arraybuffer",
        timeout: 40_000,
        validateStatus: (status: number) => status === 200,
      });
      const data = res.data;
      if (!data || data.byteLength < 2_000) {
        fail += 1;
        continue;
      }
      writeFileSync(dest, Buffer.from(data));
      ok += 1;
    } catch {
      fail += 1;
    }
    await new Promise((r) => setTimeout(r, 250));
  }

  return { pages, cards: found.size, ok, skip, fail, rejected };
}

export type ArcadeInstall = { faces: number; missing: string[] };

export function installArcadeGameCards(
  index: LocalPrintsIndex,
  opts: { stagingDir?: string } = {},
): ArcadeInstall {
  const dir = opts.stagingDir ?? arcadeStagingDir();
  if (!existsSync(dir)) return { faces: 0, missing: [] };
  const nameOf = inkworksNameLookup();
  const missing: string[] = [];
  const assets: {
    printKey: string;
    lang: string;
    art: string;
    sourceUrl: string | null;
  }[] = [];

  for (const [i] of arcadeListingUrls().entries()) {
    const cache = path.join(dir, `listing-${i}.html`);
    if (!existsSync(cache)) continue;
    const { cards } = parseArcadeListing(readFileSync(cache, "utf8"), nameOf);
    for (const card of cards) {
      const src = path.join(dir, arcadeStagingFile(card));
      const printKey = ninjaRanksPrintKey(card.setCode, card.number);
      if (!existsSync(src) || !printKey) {
        missing.push(`${card.setCode}-${card.number}`);
        continue;
      }
      const destDir = path.join(
        packCardsDir(NARUTO_RANKS_PACK_ID),
        card.setCode,
        ARCADE_LANG,
        card.number,
      );
      mkdirSync(destDir, { recursive: true });
      const art = `art.${ARCADE_SOURCE_ID}.jpg`;
      writeFileSync(path.join(destDir, art), readFileSync(src));
      if (!assets.some((a) => a.printKey === printKey)) {
        assets.push({
          printKey,
          lang: ARCADE_LANG,
          art,
          sourceUrl: card.imageUrl,
        });
      }
    }
  }

  if (assets.length) index.writeAssets(assets);
  return { faces: assets.length, missing };
}
