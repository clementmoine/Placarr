/**
 * Disney Leclerc 2025 — faces eBay (complément Coleka).
 *
 * Mapping : MSKU `menuItemMap` (« NNN | Nom ») → variationId.
 * Image : Browse `getItem` `v1|{legacyItemId}|{variationId}` (TOS-compliant).
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import sharp from "sharp";

import { packCardsDir, packStagingDir } from "@/lib/packPaths";
import { downloadCardFaceBytes } from "@/providers/shared/cardCatalogue/faceInstall";
import type { LocalPrintsIndex } from "@/providers/shared/cardCatalogue/localPrintsIndex";
import {
  ebayBrowseItemId,
  fetchEbayBrowseItem,
} from "@/providers/commerce/ebay/browseItem";
import { bestEbayCoverUrl } from "@/providers/commerce/ebay/ebayConfig";

import { leclercCuratedDir } from "./curatedPaths";
import { leclercOpForSetCode } from "./pack";
import {
  foldLeclercFixeezKey,
  resolveLeclercFixeezNumber,
} from "./parseColekaLeclerc";
import { leclercPrintKey } from "./printKey";

export const EBAY_LECLERC_DISNEY25_SOURCE_ID = "ebay";
export const EBAY_LECLERC_DISNEY25_LANG = "fr";

/**
 * Studio eBay 1600×1600 : marges grises latérales ~égales.
 * Crop fixe cartes (pas Fixeez) — L/R 255, H/B 0.
 */
export const EBAY_DISNEY25_CARD_CROP = {
  left: 255,
  right: 255,
  top: 0,
  bottom: 0,
} as const;

const STAGING_FOLDER = "ebay-faces";

/** Cartes 001–108 (pas `fNN` Fixeez). */
export function isEbayDisney25CardNumber(number: string): boolean {
  return /^\d{3}$/.test(number.trim());
}

/**
 * Crop fixe du fond studio gris (gauche/droite). No-op si l'image est trop
 * étroite pour retirer les deux bandes.
 *
 * Re-encode JPEG minimal : q100 + 4:4:4 (pas mozjpeg) pour ne pas décaler
 * la colorimétrie comme un q92/4:2:0.
 */
export async function cropEbayDisney25CardSides(
  buffer: Buffer,
  crop: {
    left: number;
    right: number;
    top: number;
    bottom: number;
  } = EBAY_DISNEY25_CARD_CROP,
): Promise<Buffer> {
  const meta = await sharp(buffer).rotate().metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (!width || !height) return buffer;
  const left = Math.max(0, crop.left);
  const right = Math.max(0, crop.right);
  const top = Math.max(0, crop.top);
  const bottom = Math.max(0, crop.bottom);
  const outW = width - left - right;
  const outH = height - top - bottom;
  if (outW < 32 || outH < 32) return buffer;
  return sharp(buffer)
    .rotate()
    .extract({ left, top, width: outW, height: outH })
    .jpeg({
      quality: 100,
      chromaSubsampling: "4:4:4",
      mozjpeg: false,
      optimizeCoding: false,
    })
    .toBuffer();
}

export type EbayDisney25Variation = {
  number: string;
  name: string;
  variationId: string;
  imageUrl?: string;
};

export type EbayDisney25FacesLedger = {
  source: string;
  sourceId: string;
  lang: string;
  setCode: string;
  legacyItemId: string;
  marketplaceId: string;
  listingUrl: string;
  note?: string;
  variations: EbayDisney25Variation[];
};

/** « 001 | Lilo | 1 » or « 104 | Riley ». */
export function parseEbayDisney25VariationLabel(
  raw: string,
): { number: string; name: string } | null {
  const text = raw.replace(/\s+/g, " ").trim();
  const m = text.match(/^(\d{3})\s*\|\s*(.+?)(?:\s*\|\s*\d+)?$/);
  if (!m) return null;
  const number = m[1]!;
  const name = m[2]!.trim();
  if (!name) return null;
  const n = Number(number);
  if (!Number.isFinite(n) || n < 1 || n > 200) return null;
  return { number, name };
}

/**
 * Fixeez MSKU labels are bare names (« Main de Mickey », « Stitch (ananas) »).
 * Resolve via checklist fold lookup → `fNN`.
 */
export function parseEbayDisney25FixeezLabel(
  raw: string,
  fixeezLookup: ReadonlyMap<string, string>,
): { number: string; name: string } | null {
  const text = raw.replace(/\s+/g, " ").trim();
  if (!text || /^sélectionner$/i.test(text)) return null;
  const cleaned = text.replace(/\s*\(en rupture de stock\)\s*$/i, "").trim();
  const card = parseEbayDisney25VariationLabel(cleaned);
  if (card) return card;
  const number = resolveLeclercFixeezNumber(
    cleaned.startsWith("Fixeez") ? cleaned : `Fixeez ${cleaned}`,
    "",
    "",
    fixeezLookup,
  );
  if (!number) {
    // direct fold of bare name (eBay omits « Fixeez » prefix)
    const key = foldLeclercFixeezKey(cleaned);
    const hit = key ? fixeezLookup.get(key) : null;
    if (!hit) return null;
    return { number: hit, name: cleaned };
  }
  return { number, name: cleaned };
}

/**
 * Build variation rows from eBay page `menuItemMap` values
 * (`valueName` / `displayName` + `matchingVariationIds`).
 */
export function ebayDisney25VariationsFromMenuItemMap(
  menuItemMap: Record<
    string,
    {
      valueName?: string;
      displayName?: string;
      matchingVariationIds?: number[] | string[];
    }
  >,
  opts: { fixeezLookup?: ReadonlyMap<string, string> } = {},
): EbayDisney25Variation[] {
  const byNumber = new Map<string, EbayDisney25Variation>();
  for (const row of Object.values(menuItemMap)) {
    const label = String(row.displayName || row.valueName || "").trim();
    const parsed = opts.fixeezLookup
      ? parseEbayDisney25FixeezLabel(label, opts.fixeezLookup)
      : parseEbayDisney25VariationLabel(label);
    const vids = row.matchingVariationIds ?? [];
    const variationId = vids[0] != null ? String(vids[0]) : "";
    if (!parsed || !variationId) continue;
    if (!byNumber.has(parsed.number)) {
      byNumber.set(parsed.number, {
        number: parsed.number,
        name: parsed.name,
        variationId,
      });
    }
  }
  return [...byNumber.values()].sort((a, b) =>
    a.number.localeCompare(b.number),
  );
}

export function ebayDisney25FacesLedgerPath(): string {
  return path.join(leclercCuratedDir(), "sources", "ebay-disney25-faces.json");
}

/** Fixeez-only MSKU (`236423984089`) — separate from the 108 cards listing. */
export function ebayDisney25FixeezFacesLedgerPath(): string {
  return path.join(
    leclercCuratedDir(),
    "sources",
    "ebay-disney25-fixeez-faces.json",
  );
}

export function readEbayDisney25FacesLedger(): EbayDisney25FacesLedger {
  return JSON.parse(
    readFileSync(ebayDisney25FacesLedgerPath(), "utf8"),
  ) as EbayDisney25FacesLedger;
}

export function readEbayDisney25FixeezFacesLedger(): EbayDisney25FacesLedger | null {
  const p = ebayDisney25FixeezFacesLedgerPath();
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf8")) as EbayDisney25FacesLedger;
}

/** Cards + Fixeez ledgers (when present). */
export function readEbayDisney25AllLedgers(): EbayDisney25FacesLedger[] {
  const out: EbayDisney25FacesLedger[] = [readEbayDisney25FacesLedger()];
  const fixeez = readEbayDisney25FixeezFacesLedger();
  if (fixeez?.variations?.length) out.push(fixeez);
  return out;
}

export function writeEbayDisney25FacesLedger(
  ledger: EbayDisney25FacesLedger,
): void {
  writeFileSync(
    ebayDisney25FacesLedgerPath(),
    `${JSON.stringify(ledger, null, 2)}\n`,
  );
}

export function writeEbayDisney25FixeezFacesLedger(
  ledger: EbayDisney25FacesLedger,
): void {
  writeFileSync(
    ebayDisney25FixeezFacesLedgerPath(),
    `${JSON.stringify(ledger, null, 2)}\n`,
  );
}

export function ebayDisney25FacesStagingDir(packId: string): string {
  return path.join(packStagingDir(packId), STAGING_FOLDER);
}

function stagingFile(number: string, imageUrl: string): string {
  const ext = path.extname(new URL(imageUrl).pathname).toLowerCase() || ".jpg";
  return `${number}${ext}`;
}

async function downloadImage(url: string): Promise<Buffer | null> {
  return downloadCardFaceBytes(url, {
    referer: "https://www.ebay.fr/",
    minBytes: 2_000,
    timeoutMs: 40_000,
  });
}

export type EbayDisney25Harvest = {
  cards: number;
  ok: number;
  skip: number;
  fail: number;
};

/**
 * Resolve Browse image URLs for each variation, download into staging,
 * refresh ledger `imageUrl` fields. Runs every Disney25 eBay ledger
 * (108 cartes + Fixeez).
 */
export async function harvestEbayDisney25Faces(
  opts: { force?: boolean; stagingDir?: string; packId?: string } = {},
): Promise<EbayDisney25Harvest | null> {
  const op = leclercOpForSetCode("disney25");
  if (!op) return null;
  const packId = opts.packId ?? op.packId;
  const staging = opts.stagingDir ?? ebayDisney25FacesStagingDir(packId);
  mkdirSync(staging, { recursive: true });

  const ledgers = readEbayDisney25AllLedgers();
  let cards = 0;
  let ok = 0;
  let skip = 0;
  let fail = 0;

  for (const ledger of ledgers) {
    if (!ledger.variations.length) continue;
    cards += ledger.variations.length;
    const updated: EbayDisney25Variation[] = [];

    for (const row of ledger.variations) {
      const itemId = ebayBrowseItemId(ledger.legacyItemId, row.variationId);
      let imageUrl = row.imageUrl?.trim() || "";
      if (!imageUrl || opts.force) {
        const item = await fetchEbayBrowseItem(itemId, {
          marketplaceId: ledger.marketplaceId,
        });
        imageUrl = bestEbayCoverUrl(item?.imageUrls?.[0]) || imageUrl || "";
        await new Promise((r) => setTimeout(r, 120));
      }
      if (!imageUrl) {
        fail += 1;
        updated.push(row);
        continue;
      }
      const dest = path.join(staging, stagingFile(row.number, imageUrl));
      if (!opts.force && existsSync(dest)) {
        skip += 1;
        updated.push({ ...row, imageUrl });
        continue;
      }
      const buf = await downloadImage(imageUrl);
      if (!buf) {
        fail += 1;
        updated.push({ ...row, imageUrl });
        continue;
      }
      writeFileSync(dest, buf);
      ok += 1;
      updated.push({ ...row, imageUrl });
    }

    if (ledger.variations.every((row) => row.number.startsWith("f"))) {
      writeEbayDisney25FixeezFacesLedger({ ...ledger, variations: updated });
    } else {
      writeEbayDisney25FacesLedger({ ...ledger, variations: updated });
    }
  }

  return { cards, ok, skip, fail };
}

export type EbayDisney25Install = {
  faces: number;
  missing: string[];
};

/**
 * Pose les faces staging → `art.ebay.jpg`.
 * Cartes : crop fixe L/R 255 (fond studio). Fixeez : copie telle quelle.
 */
export async function installEbayDisney25Faces(
  index: LocalPrintsIndex,
  opts: { stagingDir?: string; packId?: string } = {},
): Promise<EbayDisney25Install> {
  const op = leclercOpForSetCode("disney25");
  if (!op) return { faces: 0, missing: [] };
  const packId = opts.packId ?? op.packId;
  const staging = opts.stagingDir ?? ebayDisney25FacesStagingDir(packId);

  const missing: string[] = [];
  const assets: {
    printKey: string;
    lang: string;
    art: string;
    sourceUrl: string;
  }[] = [];

  for (const ledger of readEbayDisney25AllLedgers()) {
    const lang = ledger.lang || EBAY_LECLERC_DISNEY25_LANG;
    const sourceId = ledger.sourceId || EBAY_LECLERC_DISNEY25_SOURCE_ID;
    for (const row of ledger.variations) {
      const imageUrl = row.imageUrl?.trim();
      if (!imageUrl) {
        missing.push(row.number);
        continue;
      }
      const src = path.join(staging, stagingFile(row.number, imageUrl));
      const printKey = leclercPrintKey("disney25", row.number);
      if (!printKey || !existsSync(src)) {
        missing.push(row.number);
        continue;
      }
      const ext = path.extname(src).toLowerCase() || ".jpg";
      const art = `art.${sourceId}${ext}`;
      const destDir = path.join(
        packCardsDir(packId),
        "disney25",
        lang,
        row.number,
      );
      mkdirSync(destDir, { recursive: true });
      const dest = path.join(destDir, art);
      if (isEbayDisney25CardNumber(row.number)) {
        const cropped = await cropEbayDisney25CardSides(readFileSync(src));
        writeFileSync(dest, cropped);
      } else {
        copyFileSync(src, dest);
      }
      assets.push({
        printKey,
        lang,
        art,
        sourceUrl: `${ledger.listingUrl}?var=${row.variationId}` || imageUrl,
      });
    }
  }

  if (assets.length) index.writeAssets(assets);
  return { faces: assets.length, missing };
}
