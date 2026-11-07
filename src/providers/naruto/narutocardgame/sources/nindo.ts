/**
 * nindodb.com — listing + fiches (titres FR/EN, faces, ledger metadata).
 * Remap K-039→N-009 via identity ; prune le printKey fantôme après install.
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
  NARUTO_CARDGAME_MISREAD_KAKASHI_PRINT_KEY,
} from "../canonicalCollector";
import { NARUTO_CARDGAME_PACK_ID } from "../pack";
import { narutoCardgamePrintKey } from "../printKey";
import {
  absoluteNarutoNindoUrl,
  narutoNindoDetailUrl,
  narutoNindoIdentity,
  narutoNindoListingUrl,
  parseNarutoNindoDetail,
  parseNarutoNindoListingSlugs,
  type NarutoNindoCard,
} from "../parseNarutoNindo";
import { narutoCardgameSyncedSourcePath } from "../syncedSources";

const STAGING_FOLDER = "nindodb";
const ART_NAME = "art.nindodb.webp";
const LOCALES = ["fr", "en"] as const;
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
        Referer: "https://nindodb.com/",
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

export async function harvestNarutoNindo(opts: {
  force?: boolean;
  offline?: boolean;
  locales?: readonly string[];
  limit?: number;
} = {}): Promise<{
  staging: string;
  locales: Record<string, { listed: number; details: number; fetched: number }>;
}> {
  const locales = opts.locales?.length ? opts.locales : LOCALES;
  const root = stagingRoot();
  mkdirSync(root, { recursive: true });
  const summary: Record<
    string,
    { listed: number; details: number; fetched: number }
  > = {};

  for (const locale of locales) {
    const dir = stagingLocaleDir(locale);
    const detailsDir = path.join(dir, "details");
    mkdirSync(detailsDir, { recursive: true });
    const listingPath = path.join(dir, "listing.html");
    let fetched = 0;

    if (!opts.offline && (opts.force || !existsSync(listingPath))) {
      const html = await fetchHtml(narutoNindoListingUrl(locale));
      if (html) {
        writeFileSync(listingPath, html, "utf8");
        fetched += 1;
      }
    }

    const listingHtml = existsSync(listingPath)
      ? readFileSync(listingPath, "utf8")
      : "";
    let slugs = listingHtml ? parseNarutoNindoListingSlugs(listingHtml) : [];
    if (opts.limit != null && opts.limit >= 0) {
      slugs = slugs.slice(0, opts.limit);
    }

    let details = 0;
    for (const slug of slugs) {
      const dest = path.join(detailsDir, `${slug}.html`);
      if (!opts.offline && (opts.force || !existsSync(dest))) {
        const html = await fetchHtml(narutoNindoDetailUrl(slug, locale));
        if (html) {
          writeFileSync(dest, html, "utf8");
          fetched += 1;
        }
      }
      if (existsSync(dest)) details += 1;
    }

    summary[locale] = { listed: slugs.length, details, fetched };
    writeFileSync(
      path.join(dir, "meta.json"),
      `${JSON.stringify(
        {
          harvestedAt: new Date().toISOString(),
          locale,
          listed: slugs.length,
          details,
          fetched,
          url: narutoNindoListingUrl(locale),
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
  }

  return { staging: root, locales: summary };
}

function loadLocaleCards(locale: string): NarutoNindoCard[] {
  const dir = stagingLocaleDir(locale);
  const detailsDir = path.join(dir, "details");
  if (!existsSync(detailsDir)) return [];
  const out: NarutoNindoCard[] = [];
  for (const name of readdirSync(detailsDir)) {
    if (!name.endsWith(".html")) continue;
    const slug = name.replace(/\.html$/i, "");
    const card = parseNarutoNindoDetail(
      readFileSync(path.join(detailsDir, name), "utf8"),
      slug,
      locale,
    );
    if (card) out.push(card);
  }
  return out;
}

function rarityFor(card: NarutoNindoCard, setCode: string): string {
  const r = card.rarity.trim();
  if (r) return r;
  if (setCode === "premium00") return "Premium";
  if (setCode === "promo") return "Promo";
  return "SAMPLE";
}

/** Drop `demo-k039` fantôme après remap vers `demo-n009`. */
export function pruneMisreadKakashiK039(index: LocalPrintsIndex): number {
  const keep = new Set<string>();
  for (const lang of ["en", "fr", "ja"]) {
    for (const row of index.listRowsForLanguage(lang)) {
      if (row.printKey !== NARUTO_CARDGAME_MISREAD_KAKASHI_PRINT_KEY) {
        keep.add(row.printKey);
      }
    }
  }
  if (keep.size === 0) return 0;
  return index.prunePrintsExcept(keep).removed;
}

export async function installNarutoNindo(
  index: LocalPrintsIndex,
  opts: { downloadFaces?: boolean } = {},
): Promise<{
  prints: number;
  titles: number;
  faces: number;
  skipped: number;
  pruned: number;
  ledgerPath: string;
}> {
  const byKey = new Map<
    string,
    {
      card: NarutoNindoCard;
      identity: NonNullable<ReturnType<typeof narutoNindoIdentity>>;
      titles: { lang: string; name: string; rarity: string }[];
    }
  >();
  const ledgerCards: Array<
    NarutoNindoCard & {
      printKey: string;
      setCode: string;
      number: string;
      grouping?: string | null;
    }
  > = [];

  for (const locale of LOCALES) {
    for (const card of loadLocaleCards(locale)) {
      const identity = narutoNindoIdentity(card);
      if (!identity) continue;
      const printKey = narutoCardgamePrintKey(
        identity.setCode,
        identity.number,
        identity.grouping,
      );
      if (!printKey) continue;

      const rarity = rarityFor(card, identity.setCode);
      const cur = byKey.get(printKey);
      if (!cur) {
        byKey.set(printKey, {
          card,
          identity,
          titles: [{ lang: locale, name: card.name, rarity }],
        });
      } else {
        cur.titles.push({ lang: locale, name: card.name, rarity });
        if (!cur.card.faceUrl && card.faceUrl) cur.card = card;
      }

      if (locale === "en" || !ledgerCards.some((c) => c.printKey === printKey)) {
        ledgerCards.push({
          ...card,
          printKey,
          setCode: identity.setCode,
          number: identity.number,
          grouping: identity.grouping ?? null,
        });
      }
    }
  }

  const printRows: LocalPrintWrite[] = [];
  const assets: LocalPrintAssetWrite[] = [];
  let faces = 0;
  let skipped = 0;

  for (const [printKey, { card, identity, titles }] of byKey) {
    const diskNumber = identity.grouping
      ? `${identity.number}-${identity.grouping}`
      : identity.number;

    printRows.push({
      printKey,
      setCode: identity.setCode,
      number: identity.number,
      grouping: identity.grouping ?? null,
      cardType: "card",
      category: card.type || null,
      sourceUrl: absoluteNarutoNindoUrl(card.pagePath),
      titles: titles.map((t) => ({
        lang: t.lang,
        fullName: t.name,
        rarity: t.rarity,
      })),
    });

    if (opts.downloadFaces === false || !card.faceUrl) {
      if (!card.faceUrl) skipped += 1;
      continue;
    }

    for (const lang of ["en", "fr"] as const) {
      const destDir = packCardDir(NARUTO_CARDGAME_PACK_ID, {
        set: identity.setCode,
        lang,
        card: diskNumber,
      });
      const installed = await installCardFace({
        destDir,
        artName: ART_NAME,
        url: card.faceUrl,
        referer: narutoNindoListingUrl(lang),
        minBytes: 4_000,
      });
      if (!installed) continue;
      faces += installed.downloaded ? 1 : 0;
      assets.push({
        printKey,
        lang,
        art: installed.art,
        sourceUrl: card.faceUrl,
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

  const pruned = pruneMisreadKakashiK039(index);

  const ledgerPath = narutoCardgameSyncedSourcePath("nindodb-cards.json");
  mkdirSync(path.dirname(ledgerPath), { recursive: true });
  writeFileSync(
    ledgerPath,
    `${JSON.stringify(
      {
        sourceId: "nindodb",
        harvestedAt: new Date().toISOString(),
        url: narutoNindoListingUrl("fr"),
        cards: ledgerCards.length,
        rows: ledgerCards,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  return { prints, titles, faces, skipped, pruned, ledgerPath };
}
