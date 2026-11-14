/**
 * narutocardguide.com/cards-list/ — hub listing + faces CDN `/Cards/…`.
 * Dump HTML staging → install Sync (fusion demo/promo/premium00 + SAMPLE n01).
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
  absoluteNarutoCardGuideUrl,
  narutoCardGuideDisplayName,
  narutoCardGuideIdentity,
  narutoCardGuideListingUrl,
  parseNarutoCardGuideListing,
  type NarutoCardGuideCard,
} from "../parseNarutoCardGuide";
import { narutoCardgamePrintKey } from "../printKey";

const STAGING_FOLDER = "narutocardguide-faces";
const ART_NAME = "art.narutocardguide.webp";
const REFERER = "https://narutocardguide.com/cards-list/";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

function stagingDir(): string {
  return path.join(packStagingDir(NARUTO_CARDGAME_PACK_ID), STAGING_FOLDER);
}

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const res = await httpGet<string>(url, {
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml",
        Referer: REFERER,
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

export async function harvestNarutoCardGuide(opts: {
  force?: boolean;
  offline?: boolean;
} = {}): Promise<{
  staging: string;
  listed: number;
  fetched: number;
}> {
  const dir = stagingDir();
  mkdirSync(dir, { recursive: true });
  const listingPath = path.join(dir, "listing.html");
  let fetched = 0;

  if (!opts.offline && (opts.force || !existsSync(listingPath))) {
    const html = await fetchHtml(narutoCardGuideListingUrl());
    if (html) {
      writeFileSync(listingPath, html, "utf8");
      fetched += 1;
    }
  }

  const listingHtml = existsSync(listingPath)
    ? readFileSync(listingPath, "utf8")
    : "";
  const listed = listingHtml
    ? parseNarutoCardGuideListing(listingHtml).length
    : 0;

  writeFileSync(
    path.join(dir, "meta.json"),
    `${JSON.stringify(
      {
        harvestedAt: new Date().toISOString(),
        listed,
        fetched,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  return { staging: dir, listed, fetched };
}

function loadHarvestedCards(): NarutoCardGuideCard[] {
  const listingPath = path.join(stagingDir(), "listing.html");
  if (!existsSync(listingPath)) return [];
  return parseNarutoCardGuideListing(readFileSync(listingPath, "utf8"));
}

function rarityFor(card: NarutoCardGuideCard, setCode: string): string {
  if (setCode === "premium00") return "Premium";
  if (setCode === "promo") return "Promo";
  if (setCode === "n01" || /^sample-/i.test(card.id)) return "SAMPLE";
  return "SAMPLE";
}

export async function installNarutoCardGuide(
  index: LocalPrintsIndex,
  opts: { downloadFaces?: boolean } = {},
): Promise<{ prints: number; titles: number; faces: number; skipped: number }> {
  const cards = loadHarvestedCards();
  const printRows: LocalPrintWrite[] = [];
  const assets: LocalPrintAssetWrite[] = [];
  let faces = 0;
  let skipped = 0;

  for (const card of cards) {
    const identity = narutoCardGuideIdentity(card);
    if (!identity) {
      skipped += 1;
      continue;
    }
    const printKey = narutoCardgamePrintKey(
      identity.setCode,
      identity.number,
      identity.grouping,
    );
    if (!printKey) {
      skipped += 1;
      continue;
    }

    const diskNumber = identity.grouping
      ? `${identity.number}-${identity.grouping}`
      : identity.number;
    const faceUrl = absoluteNarutoCardGuideUrl(card.facePath);
    const display = narutoCardGuideDisplayName(card);
    const rarity = rarityFor(card, identity.setCode);

    printRows.push({
      printKey,
      setCode: identity.setCode,
      number: identity.number,
      grouping: identity.grouping ?? null,
      cardType: "card",
      sourceUrl: narutoCardGuideListingUrl(),
      titles: [
        { lang: "en", fullName: display, rarity },
        { lang: "fr", fullName: display, rarity },
        { lang: "ja", fullName: display, rarity },
      ],
    });

    if (opts.downloadFaces === false) continue;

    // Faces guide = scans EN. JA uniquement pour n01 (pas encore de face JP) ;
    // demo/promo/premium JA restent sur narutomarket[ja] / Bandai Fest JP.
    const faceLangs =
      identity.setCode === "n01"
        ? (["en", "fr", "ja"] as const)
        : (["en", "fr"] as const);
    for (const lang of faceLangs) {
      const destDir = packCardDir(NARUTO_CARDGAME_PACK_ID, {
        set: identity.setCode,
        lang,
        card: diskNumber,
      });
      const installed = await installCardFace({
        destDir,
        artName: ART_NAME,
        url: faceUrl,
        referer: REFERER,
        minBytes: 4_000,
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
