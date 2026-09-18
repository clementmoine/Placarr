/**
 * Moisson et pose des photos arcadegamecards — l'édition américaine.
 *
 * Deux temps, comme le reste du pack. Le listing est lu par
 * `parseArcadeListing`, qui exige trois signaux concordants ; ce module ne fait
 * que descendre les octets et les poser.
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { httpGet } from "@/lib/http/httpClient";
import { packCardsDir, packStagingDir } from "@/lib/packPaths";
import type { LocalPrintsIndex } from "@/providers/shared/cardCatalogue/localPrintsIndex";
import { fetchTextWithFlareFallback } from "@/lib/http/scrapeFetch";

import { readInkworksChecklist } from "./buildFromLedgers";
import {
  ARCADE_LANG,
  ARCADE_SOURCE_ID,
  arcadeBackImageUrl,
  arcadeListingUrls,
  namesAgree,
  parseArcadeListing,
  type ArcadeCard,
  type ArcadeNameCheck,
} from "./parseArcadeGameCards";
import { ninjaRanksPrintKey } from "./printKey";
import { NARUTO_RANKS_PACK_ID, narutoRanksCuratedDir } from "./pack";

const STAGING_FOLDER = "arcadegamecards";
const LEDGER_FILE = "arcadegamecards.json";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

export function arcadeStagingDir(): string {
  return path.join(packStagingDir(NARUTO_RANKS_PACK_ID), STAGING_FOLDER);
}

export function readArcadeGameCardsLedger(): {
  vendorTitleAliases?: {
    setCode: string;
    number: string;
    vendorTitles: string[];
  }[];
} {
  return JSON.parse(
    readFileSync(
      path.join(narutoRanksCuratedDir(), "sources", LEDGER_FILE),
      "utf8",
    ),
  );
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

export function createArcadeNameCheck(): ArcadeNameCheck {
  const nameOf = inkworksNameLookup();
  const aliases = new Map<string, readonly string[]>();
  for (const row of readArcadeGameCardsLedger().vendorTitleAliases ?? []) {
    aliases.set(
      `${row.setCode.trim().toLowerCase()}-${row.number.trim().toLowerCase()}`,
      row.vendorTitles,
    );
  }
  return (setCode, number, vendorName) => {
    const expected = nameOf(setCode, number);
    if (!expected) return false;
    if (namesAgree(vendorName, expected)) return true;
    const key = `${setCode.trim().toLowerCase()}-${number.trim().toLowerCase()}`;
    return (aliases.get(key) ?? []).some((alias) =>
      namesAgree(vendorName, alias),
    );
  };
}

export function arcadeStagingFile(card: ArcadeCard): string {
  return `${card.setCode}-${card.number}.jpg`;
}

export function arcadeStagingBackFile(card: ArcadeCard): string {
  return `${card.setCode}-${card.number}-back.jpg`;
}

export type ArcadeHarvest = {
  pages: number;
  cards: number;
  ok: number;
  skip: number;
  fail: number;
  backOk: number;
  backSkip: number;
  backFail: number;
  rejected: { printed: string; name: string; reason: string }[];
};

export async function harvestArcadeGameCards(
  opts: { force?: boolean } = {},
): Promise<ArcadeHarvest> {
  const dir = arcadeStagingDir();
  mkdirSync(dir, { recursive: true });
  const nameCheck = createArcadeNameCheck();
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
    const parsed = parseArcadeListing(html, nameCheck);
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
  let backOk = 0;
  let backSkip = 0;
  let backFail = 0;
  for (const card of found.values()) {
    const dest = path.join(dir, arcadeStagingFile(card));
    let frontBuf: Buffer | null = null;
    if (!opts.force && existsSync(dest)) {
      skip += 1;
      frontBuf = readFileSync(dest);
    } else {
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
        } else {
          frontBuf = Buffer.from(data);
          writeFileSync(dest, frontBuf);
          ok += 1;
        }
      } catch {
        fail += 1;
      }
    }

    const backDest = path.join(dir, arcadeStagingBackFile(card));
    if (!opts.force && existsSync(backDest)) {
      backSkip += 1;
    } else if (!frontBuf) {
      backFail += 1;
    } else {
      try {
        const res = await httpGet<ArrayBuffer>(
          arcadeBackImageUrl(card.imageUrl),
          {
            headers: { "User-Agent": UA, Referer: arcadeListingUrls()[0]! },
            responseType: "arraybuffer",
            timeout: 40_000,
            validateStatus: (status: number) => status === 200,
          },
        );
        const data = res.data;
        if (!data || data.byteLength < 2_000) {
          backFail += 1;
        } else {
          const backBuf = Buffer.from(data);
          if (backBuf.equals(frontBuf)) {
            backFail += 1;
          } else {
            writeFileSync(backDest, backBuf);
            backOk += 1;
          }
        }
      } catch {
        backFail += 1;
      }
    }
    await new Promise((r) => setTimeout(r, 250));
  }

  return {
    pages,
    cards: found.size,
    ok,
    skip,
    fail,
    backOk,
    backSkip,
    backFail,
    rejected,
  };
}

export type ArcadeInstall = { faces: number; backs: number; missing: string[] };

export function installArcadeGameCards(
  index: LocalPrintsIndex,
  opts: { stagingDir?: string } = {},
): ArcadeInstall {
  const dir = opts.stagingDir ?? arcadeStagingDir();
  if (!existsSync(dir)) return { faces: 0, backs: 0, missing: [] };
  const nameCheck = createArcadeNameCheck();
  const missing: string[] = [];
  const assetsByKey = new Map<
    string,
    {
      printKey: string;
      lang: string;
      art?: string;
      back?: string;
      sourceUrl: string | null;
    }
  >();

  for (const [i] of arcadeListingUrls().entries()) {
    const cache = path.join(dir, `listing-${i}.html`);
    if (!existsSync(cache)) continue;
    const { cards } = parseArcadeListing(
      readFileSync(cache, "utf8"),
      nameCheck,
    );
    for (const card of cards) {
      const src = path.join(dir, arcadeStagingFile(card));
      const backSrc = path.join(dir, arcadeStagingBackFile(card));
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
      copyFileSync(src, path.join(destDir, art));

      let back: string | undefined;
      if (existsSync(backSrc)) {
        back = `back.${ARCADE_SOURCE_ID}.jpg`;
        copyFileSync(backSrc, path.join(destDir, back));
      }

      const assetKey = `${printKey}:${ARCADE_LANG}`;
      const existing = assetsByKey.get(assetKey);
      assetsByKey.set(assetKey, {
        printKey,
        lang: ARCADE_LANG,
        art: existing?.art ?? art,
        back: back ?? existing?.back,
        sourceUrl: card.imageUrl,
      });
    }
  }

  const assets = [...assetsByKey.values()];
  if (assets.length) index.writeAssets(assets);
  return {
    faces: assets.length,
    backs: assets.filter((a) => a.back).length,
    missing,
  };
}
