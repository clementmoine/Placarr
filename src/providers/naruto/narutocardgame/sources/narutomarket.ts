/**
 * narutomarket.com — checklist + faces des cartes révélées (démo Gen Con,
 * promos Chakra, Premium vol.00…). Dump HTML staging → install Sync.
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
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

import {
  NARUTO_CARDGAME_PACK_ID,
  narutoCardgameCuratedDir,
} from "../pack";
import {
  absoluteNarutoMarketUrl,
  narutoMarketDetailUrl,
  narutoMarketFaceUrl,
  narutoMarketIdentity,
  narutoMarketListingUrl,
  parseNarutoMarketDataCards,
  parseNarutoMarketListingSlugs,
  type NarutoMarketCard,
} from "../parseNarutoMarket";
import { narutoCardgamePrintKey } from "../printKey";

const STAGING_FOLDER = "narutomarket-faces";
const ART_NAME = "art.narutomarket.webp";
const REFERER = "https://narutomarket.com/fr/cards";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

type FaceOverride = {
  /** Remplace l’URL market (face officielle). */
  url?: string;
  artName?: string;
  referer?: string;
  webpQuality?: number;
  /** Ne pas installer de face (mock IA / placeholder). Titres OK. */
  skipFace?: boolean;
  note?: string;
};

type FaceOverridesLedger = {
  faces: Record<string, FaceOverride>;
};

function stagingRoot(): string {
  return path.join(packStagingDir(NARUTO_CARDGAME_PACK_ID), STAGING_FOLDER);
}

/**
 * FR reste à la racine du staging (dumps déjà là). Autres locales → sous-dossier
 * (`ja/listing.html`, `ja/details/…`).
 */
function stagingDirForLocale(locale: string): string {
  const root = stagingRoot();
  const code = locale.trim().toLowerCase() || "fr";
  return code === "fr" ? root : path.join(root, code);
}

function loadFaceOverrides(): FaceOverridesLedger {
  const file = path.join(
    narutoCardgameCuratedDir(),
    "sources",
    "narutomarket-face-overrides.json",
  );
  if (!existsSync(file)) return { faces: {} };
  return JSON.parse(readFileSync(file, "utf8")) as FaceOverridesLedger;
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

export async function harvestNarutoMarketCards(opts: {
  force?: boolean;
  offline?: boolean;
  locale?: string;
} = {}): Promise<{
  staging: string;
  listed: number;
  details: number;
  fetched: number;
  locale: string;
}> {
  const locale = (opts.locale ?? "fr").trim().toLowerCase() || "fr";
  const dir = stagingDirForLocale(locale);
  mkdirSync(path.join(dir, "details"), { recursive: true });
  const listingPath = path.join(dir, "listing.html");
  let fetched = 0;
  const referer = narutoMarketListingUrl(locale);

  if (!opts.offline && (opts.force || !existsSync(listingPath))) {
    const html = await fetchHtml(narutoMarketListingUrl(locale));
    if (html) {
      writeFileSync(listingPath, html, "utf8");
      fetched += 1;
    }
  }

  const listingHtml = existsSync(listingPath)
    ? readFileSync(listingPath, "utf8")
    : "";
  const slugs = listingHtml ? parseNarutoMarketListingSlugs(listingHtml) : [];

  let details = 0;
  for (const slug of slugs) {
    const dest = path.join(dir, "details", `${slug}.html`);
    if (!opts.offline && (opts.force || !existsSync(dest))) {
      const html = await fetchHtml(narutoMarketDetailUrl(slug, locale));
      if (html) {
        writeFileSync(dest, html, "utf8");
        fetched += 1;
      }
    }
    if (existsSync(dest)) details += 1;
  }

  writeFileSync(
    path.join(dir, "meta.json"),
    `${JSON.stringify(
      {
        harvestedAt: new Date().toISOString(),
        locale,
        referer,
        listed: slugs.length,
        details,
        fetched,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  return { staging: dir, listed: slugs.length, details, fetched, locale };
}

function loadHarvestedCards(locale = "fr"): NarutoMarketCard[] {
  const dir = stagingDirForLocale(locale);
  const detailsDir = path.join(dir, "details");
  const out: NarutoMarketCard[] = [];
  const seen = new Set<string>();

  if (existsSync(detailsDir)) {
    for (const name of readdirSync(detailsDir)) {
      if (!name.endsWith(".html")) continue;
      const html = readFileSync(path.join(detailsDir, name), "utf8");
      const cards = parseNarutoMarketDataCards(html);
      const card = cards[0];
      if (!card || seen.has(card.slug)) continue;
      seen.add(card.slug);
      out.push(card);
    }
  }

  if (out.length) return out;

  const listingPath = path.join(dir, "listing.html");
  if (!existsSync(listingPath)) return [];
  return parseNarutoMarketDataCards(readFileSync(listingPath, "utf8"));
}

function rarityFor(card: NarutoMarketCard): string {
  if (/promo/i.test(card.edition) || /yankees/i.test(card.edition)) {
    return "Promo";
  }
  if (/premium/i.test(card.edition)) return "Premium";
  if (card.state.toLowerCase().includes("exemple") || /gen con/i.test(card.edition)) {
    return "SAMPLE";
  }
  return card.type || "Unknown";
}

export async function installNarutoMarketCards(
  index: LocalPrintsIndex,
  opts: {
    downloadFaces?: boolean;
    /** Staging locale (`fr` root, `ja` sous-dossier). */
    locale?: string;
    /** Langues de titres à écrire depuis les noms de cette locale. */
    titleLangs?: readonly string[];
    /** Dossiers face à peupler. */
    faceLangs?: readonly string[];
  } = {},
): Promise<{
  prints: number;
  titles: number;
  faces: number;
  skippedArtwork: number;
  skippedFaces: number;
  locale: string;
}> {
  const locale = (opts.locale ?? "fr").trim().toLowerCase() || "fr";
  const titleLangs =
    opts.titleLangs ??
    (locale === "ja" ? (["ja"] as const) : (["fr", "en"] as const));
  const faceLangs =
    opts.faceLangs ??
    (locale === "ja" ? (["ja"] as const) : (["en", "fr"] as const));
  const cards = loadHarvestedCards(locale);
  const overrides = loadFaceOverrides();
  const printRows: LocalPrintWrite[] = [];
  const assets: LocalPrintAssetWrite[] = [];
  let faces = 0;
  let skippedArtwork = 0;
  let skippedFaces = 0;
  const referer = narutoMarketListingUrl(locale);

  for (const card of cards) {
    const identity = narutoMarketIdentity(card);
    if (!identity) {
      if (card.artwork) skippedArtwork += 1;
      continue;
    }
    const printKey = narutoCardgamePrintKey(
      identity.setCode,
      identity.number,
      identity.grouping,
    );
    if (!printKey) continue;

    const diskNumber = identity.grouping
      ? `${identity.number}-${identity.grouping}`
      : identity.number;

    const override = overrides.faces[card.slug];
    const faceUrl =
      override?.skipFace
        ? ""
        : override?.url
          ? override.url
          : card.imagePath
            ? narutoMarketFaceUrl(card.imagePath)
            : "";
    const artName = override?.artName ?? ART_NAME;

    printRows.push({
      printKey,
      setCode: identity.setCode,
      number: identity.number,
      grouping: identity.grouping ?? null,
      cardType: "card",
      category: card.type || card.kind || null,
      sourceUrl: absoluteNarutoMarketUrl(card.pagePath),
      titles: titleLangs.map((lang) => ({
        lang,
        fullName: card.name,
        rarity: rarityFor(card),
      })),
    });

    if (override?.skipFace) {
      skippedFaces += 1;
      continue;
    }
    if (opts.downloadFaces === false || !faceUrl) continue;

    for (const lang of faceLangs) {
      const destDir = packCardDir(NARUTO_CARDGAME_PACK_ID, {
        set: identity.setCode,
        lang,
        card: diskNumber,
      });
      const installed = await installCardFace({
        destDir,
        artName,
        url: faceUrl,
        referer: override?.referer ?? referer,
        minBytes: 8_000,
        webpQuality: override?.webpQuality ?? 90,
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
  return { prints, titles, faces, skippedArtwork, skippedFaces, locale };
}
