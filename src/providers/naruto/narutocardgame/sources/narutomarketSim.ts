/**
 * narutomarket.com/{locale}/play#sim — `NM_SIM_CARDS` (démo Gen Con).
 * Noms localisés (JA kanji) + faces CDN uploads — après tcghub pour
 * écraser les og:image mal nommés (ex. Orochimaru → K-001.webp).
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { packCardDir, packStagingDir } from "@/lib/packPaths";
import { httpGet } from "@/lib/http/httpClient";
import { installCardFace } from "@/providers/shared/cardCatalogue/faceInstall";
import type {
  LocalPrintAssetWrite,
  LocalPrintsIndex,
  LocalPrintWrite,
} from "@/providers/shared/cardCatalogue/localPrintsIndex";

import { NARUTO_CARDGAME_PACK_ID } from "../pack";
import {
  absoluteNarutoMarketSimUrl,
  narutoMarketSimFaceUrl,
  narutoMarketSimIdentity,
  narutoMarketSimPlayUrl,
  parseNarutoMarketSimCards,
  type NarutoMarketSimCard,
} from "../parseNarutoMarketSim";
import { narutoCardgamePrintKey } from "../printKey";

const STAGING_FOLDER = "narutomarket-sim";
const ART_NAME = "art.narutomarket.webp";
const LOCALES = ["fr", "en", "ja"] as const;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

function stagingRoot(): string {
  return path.join(packStagingDir(NARUTO_CARDGAME_PACK_ID), STAGING_FOLDER);
}

function stagingLocaleDir(locale: string): string {
  return path.join(stagingRoot(), locale.trim().toLowerCase() || "fr");
}

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const res = await httpGet<string>(url, {
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml",
        Referer: "https://narutomarket.com/",
      },
      responseType: "text",
      timeout: 40_000,
      validateStatus: (s) => s === 200,
    });
    return typeof res.data === "string" ? res.data : null;
  } catch {
    return null;
  }
}

export async function harvestNarutoMarketSim(opts: {
  force?: boolean;
  offline?: boolean;
  locales?: readonly string[];
} = {}): Promise<{
  staging: string;
  locales: Record<string, { listed: number; fetched: number }>;
}> {
  const locales = opts.locales?.length ? opts.locales : LOCALES;
  const root = stagingRoot();
  mkdirSync(root, { recursive: true });
  const summary: Record<string, { listed: number; fetched: number }> = {};

  for (const locale of locales) {
    const dir = stagingLocaleDir(locale);
    mkdirSync(dir, { recursive: true });
    const playPath = path.join(dir, "play.html");
    let fetched = 0;

    if (!opts.offline && (opts.force || !existsSync(playPath))) {
      const html = await fetchHtml(narutoMarketSimPlayUrl(locale));
      if (html) {
        writeFileSync(playPath, html, "utf8");
        fetched += 1;
      }
    }

    const html = existsSync(playPath) ? readFileSync(playPath, "utf8") : "";
    const listed = html ? parseNarutoMarketSimCards(html).length : 0;
    summary[locale] = { listed, fetched };
    writeFileSync(
      path.join(dir, "meta.json"),
      `${JSON.stringify(
        {
          harvestedAt: new Date().toISOString(),
          locale,
          listed,
          fetched,
          url: narutoMarketSimPlayUrl(locale),
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
  }

  return { staging: root, locales: summary };
}

function loadLocaleCards(locale: string): NarutoMarketSimCard[] {
  const playPath = path.join(stagingLocaleDir(locale), "play.html");
  if (!existsSync(playPath)) return [];
  return parseNarutoMarketSimCards(readFileSync(playPath, "utf8"));
}

export async function installNarutoMarketSim(
  index: LocalPrintsIndex,
  opts: { downloadFaces?: boolean } = {},
): Promise<{ prints: number; titles: number; faces: number; skipped: number }> {
  const byCode = new Map<
    string,
    { card: NarutoMarketSimCard; titles: { lang: string; name: string }[] }
  >();

  for (const locale of LOCALES) {
    for (const card of loadLocaleCards(locale)) {
      const cur = byCode.get(card.code);
      if (!cur) {
        byCode.set(card.code, {
          card,
          titles: [{ lang: locale, name: card.name }],
        });
      } else {
        cur.titles.push({ lang: locale, name: card.name });
        // Prefer non-empty FR/EN pagePath; keep first imagePath (same CDN).
        if (!cur.card.pagePath && card.pagePath) cur.card.pagePath = card.pagePath;
      }
    }
  }

  const printRows: LocalPrintWrite[] = [];
  const assets: LocalPrintAssetWrite[] = [];
  let faces = 0;
  let skipped = 0;

  for (const { card, titles } of byCode.values()) {
    const identity = narutoMarketSimIdentity(card.code);
    if (!identity) {
      skipped += 1;
      continue;
    }
    const printKey = narutoCardgamePrintKey(identity.setCode, identity.number);
    if (!printKey) {
      skipped += 1;
      continue;
    }

    const faceUrl = narutoMarketSimFaceUrl(card.imagePath);
    const sourceUrl = card.pagePath
      ? absoluteNarutoMarketSimUrl(card.pagePath)
      : narutoMarketSimPlayUrl("fr");

    printRows.push({
      printKey,
      setCode: identity.setCode,
      number: identity.number,
      cardType: "card",
      sourceUrl,
      titles: titles.map((t) => ({
        lang: t.lang,
        fullName: t.name,
        rarity: "SAMPLE",
      })),
    });

    if (opts.downloadFaces === false || !faceUrl) continue;

    // Faces sim = scans EN (même URL en /ja/play). Ne pas écraser le JA :
    // faces JA = Bandai `/jp/` (gallery) + narutomarket[ja] + Fest JP.
    for (const lang of ["en", "fr"] as const) {
      const destDir = packCardDir(NARUTO_CARDGAME_PACK_ID, {
        set: identity.setCode,
        lang,
        card: identity.number,
      });
      const installed = await installCardFace({
        destDir,
        artName: ART_NAME,
        url: faceUrl,
        referer: narutoMarketSimPlayUrl(lang),
        minBytes: 8_000,
      });
      if (!installed) continue;
      faces += installed.downloaded ? 1 : 0;
      assets.push({
        printKey,
        lang,
        art: installed.art,
        sourceUrl: faceUrl,
      });
    }
  }

  let prints = 0;
  let titles = 0;
  if (printRows.length) {
    const w = index.writePrints(printRows);
    prints = w.prints;
    titles = w.titles;
  }
  if (assets.length) index.writeAssets(assets);
  return { prints, titles, faces, skipped };
}
