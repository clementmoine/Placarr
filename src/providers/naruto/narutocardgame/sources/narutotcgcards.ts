/**
 * narutotcgcards.com — hub listing + faces. Dump staging → Sync.
 * Identité partagée avec narutomarket ; faces en `art.narutotcgcards.webp`.
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

import { NARUTO_CARDGAME_PACK_ID } from "../pack";
import {
  absoluteNarutoTcgCardsUrl,
  narutoTcgCardsDetailUrl,
  narutoTcgCardsIdentity,
  narutoTcgCardsListingUrl,
  parseNarutoTcgCardsDetail,
  parseNarutoTcgCardsListingSlugs,
  type NarutoTcgCardsEntry,
} from "../parseNarutoTcgCards";
import { narutoCardgamePrintKey } from "../printKey";

const STAGING_FOLDER = "narutotcgcards-faces";
const ART_NAME = "art.narutotcgcards.webp";
const REFERER = "https://narutotcgcards.com/cards";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

/** Mock IA Gen Con CP-001 — titres OK, pas d’art. */
const SKIP_FACE_SLUGS = new Set(["cp-001-chakra-card-gencon-2026"]);

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

export async function harvestNarutoTcgCards(opts: {
  force?: boolean;
  offline?: boolean;
} = {}): Promise<{
  staging: string;
  listed: number;
  details: number;
  fetched: number;
}> {
  const dir = stagingDir();
  mkdirSync(path.join(dir, "details"), { recursive: true });
  const listingPath = path.join(dir, "listing.html");
  let fetched = 0;

  if (!opts.offline && (opts.force || !existsSync(listingPath))) {
    const html = await fetchHtml(narutoTcgCardsListingUrl());
    if (html) {
      writeFileSync(listingPath, html, "utf8");
      fetched += 1;
    }
  }

  const listingHtml = existsSync(listingPath)
    ? readFileSync(listingPath, "utf8")
    : "";
  const slugs = listingHtml ? parseNarutoTcgCardsListingSlugs(listingHtml) : [];

  let details = 0;
  for (const slug of slugs) {
    const dest = path.join(dir, "details", `${slug}.html`);
    if (!opts.offline && (opts.force || !existsSync(dest))) {
      const html = await fetchHtml(narutoTcgCardsDetailUrl(slug));
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
        listed: slugs.length,
        details,
        fetched,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  return { staging: dir, listed: slugs.length, details, fetched };
}

function loadHarvestedEntries(): NarutoTcgCardsEntry[] {
  const dir = stagingDir();
  const detailsDir = path.join(dir, "details");
  const out: NarutoTcgCardsEntry[] = [];
  if (!existsSync(detailsDir)) return out;
  for (const name of readdirSync(detailsDir)) {
    if (!name.endsWith(".html")) continue;
    const slug = name.replace(/\.html$/, "");
    const entry = parseNarutoTcgCardsDetail(
      readFileSync(path.join(detailsDir, name), "utf8"),
      slug,
    );
    if (entry) out.push(entry);
  }
  return out;
}

export async function installNarutoTcgCards(
  index: LocalPrintsIndex,
  opts: { downloadFaces?: boolean } = {},
): Promise<{ prints: number; titles: number; faces: number; skipped: number }> {
  const entries = loadHarvestedEntries();
  const printRows: LocalPrintWrite[] = [];
  const assets: LocalPrintAssetWrite[] = [];
  let faces = 0;
  let skipped = 0;

  for (const entry of entries) {
    const identity = narutoTcgCardsIdentity(entry.slug);
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
    const faceUrl = absoluteNarutoTcgCardsUrl(entry.facePath);
    const rarity =
      identity.setCode === "preview"
        ? "SAMPLE"
        : identity.setCode === "promo"
          ? "Promo"
          : identity.setCode === "premium00"
            ? "Premium"
            : "SAMPLE";

    printRows.push({
      printKey,
      setCode: identity.setCode,
      number: identity.number,
      grouping: identity.grouping ?? null,
      cardType: "card",
      sourceUrl: absoluteNarutoTcgCardsUrl(entry.pagePath),
      titles: [
        { lang: "en", fullName: entry.name, rarity },
        { lang: "fr", fullName: entry.name, rarity },
      ],
    });

    if (opts.downloadFaces === false) continue;
    if (SKIP_FACE_SLUGS.has(entry.slug.trim().toLowerCase())) {
      skipped += 1;
      continue;
    }

    // preview gallery : même art EN pour FR (CDN welcome n'a pas de dossier FR).
    for (const lang of ["en", "fr"] as const) {
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
