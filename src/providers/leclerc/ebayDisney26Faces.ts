/**
 * Disney Leclerc 2026 — eBay faces (Coleka listing still null).
 *
 * Crop L/R milder than Disney25 (scans 1200×1600, pas 1600×1600) — ledger under
 * `data/leclerc/sources/ebay-disney26-faces.json`.
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { packCardDir, packStagingDir } from "@/lib/packPaths";
import { httpGet, type JsonObject } from "@/lib/http/httpClient";
import { softRetryNull } from "@/lib/http/softRetry";
import { downloadCardFaceBytes } from "@/providers/shared/cardCatalogue/faceInstall";
import type { LocalPrintsIndex } from "@/providers/shared/cardCatalogue/localPrintsIndex";
import {
  ebayBrowseItemId,
  fetchEbayBrowseItem,
} from "@/providers/commerce/ebay/browseItem";
import {
  bestEbayCoverUrl,
  EBAY_REQUEST_TIMEOUT_MS,
  getEbayEnv,
} from "@/providers/commerce/ebay/ebayConfig";
import { getEbayBrowseAccessToken } from "@/providers/commerce/ebay/oauth";

import { leclercSourcePath } from "./curatedPaths";
import {
  cropEbayDisney25CardSides,
  isEbayDisney25CardNumber,
  type EbayDisney25FacesLedger,
  type EbayDisney25Harvest,
  type EbayDisney25Install,
  type EbayDisney25Variation,
} from "./ebayDisney25Faces";
import { leclercOpForSetCode } from "./pack";
import { leclercPrintKey } from "./printKey";

export const EBAY_LECLERC_DISNEY26_SOURCE_ID = "ebay";
export const EBAY_LECLERC_DISNEY26_LANG = "fr";
/** Live MSKU (seller *misslili*) — album 001–108. Prior id 287708748843 expired. */
export const EBAY_DISNEY26_LEGACY_ITEM_ID = "237160946134";
/** Live MSKU — Fixeez f01–f24. */
export const EBAY_DISNEY26_FIXEEZ_LEGACY_ITEM_ID = "237152960926";

/**
 * Crop studio eBay Disney26 (1200×1600). Disney25 L/R 255 coupait le cadre
 * rayé (~690 px) — ici ~80 px suffisent pour le fond sans mordre la carte.
 */
export const EBAY_DISNEY26_CARD_CROP = {
  left: 80,
  right: 70,
  top: 0,
  bottom: 0,
} as const;

const STAGING_FOLDER = "ebay-faces";
const SET = "disney26";

export function ebayDisney26FacesLedgerPath(): string {
  return leclercSourcePath("ebay-disney26-faces.json");
}

export function ebayDisney26FixeezFacesLedgerPath(): string {
  return leclercSourcePath("ebay-disney26-fixeez-faces.json");
}

export function readEbayDisney26FacesLedger(): EbayDisney25FacesLedger | null {
  const p = ebayDisney26FacesLedgerPath();
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf8")) as EbayDisney25FacesLedger;
}

export function readEbayDisney26FixeezFacesLedger(): EbayDisney25FacesLedger | null {
  const p = ebayDisney26FixeezFacesLedgerPath();
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf8")) as EbayDisney25FacesLedger;
}

export function readEbayDisney26AllLedgers(): EbayDisney25FacesLedger[] {
  const out: EbayDisney25FacesLedger[] = [];
  const cards = readEbayDisney26FacesLedger();
  if (cards?.variations?.length) out.push(cards);
  const fixeez = readEbayDisney26FixeezFacesLedger();
  if (fixeez?.variations?.length) out.push(fixeez);
  return out;
}

export function writeEbayDisney26FacesLedger(
  ledger: EbayDisney25FacesLedger,
): void {
  writeFileSync(
    ebayDisney26FacesLedgerPath(),
    `${JSON.stringify(ledger, null, 2)}\n`,
  );
}

export function ebayDisney26FacesStagingDir(packId: string): string {
  return path.join(packStagingDir(packId), STAGING_FOLDER);
}

function stagingFile(number: string, imageUrl: string): string {
  const ext = path.extname(new URL(imageUrl).pathname).toLowerCase() || ".jpg";
  return `${number}${ext}`;
}

type EbayGroupItem = {
  itemId?: string;
  image?: { imageUrl?: string };
  localizedAspects?: Array<{ name?: string; value?: string }>;
};

function aspectValue(
  aspects: EbayGroupItem["localizedAspects"],
  nameRe: RegExp,
): string | null {
  for (const row of aspects ?? []) {
    if (nameRe.test(row.name ?? "")) {
      const v = row.value?.trim();
      if (v) return v;
    }
  }
  return null;
}

/** Album « 58 » → `058`; Fixeez « 2 - Buzz » → `f02`. */
export function parseEbayDisney26GroupNumber(
  raw: string,
  kind: "album" | "fixeez",
): { number: string; name: string } | null {
  const text = raw.replace(/\s+/g, " ").trim();
  if (kind === "fixeez") {
    const m = text.match(/^(\d{1,2})\s*[-–—:|.]?\s*(.*)$/);
    if (!m) return null;
    const n = Number(m[1]);
    if (!Number.isFinite(n) || n < 1 || n > 24) return null;
    return {
      number: `f${String(n).padStart(2, "0")}`,
      name: (m[2] ?? "").trim(),
    };
  }
  const m = text.match(/^(\d{1,3})\b/);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n < 1 || n > 108) return null;
  return { number: String(n).padStart(3, "0"), name: "" };
}

async function fetchEbayItemGroupItems(
  itemGroupId: string,
): Promise<EbayGroupItem[]> {
  const credentials = getEbayEnv();
  if (!credentials) return [];
  const token = await getEbayBrowseAccessToken(credentials);
  if (!token) return [];
  const items = await softRetryNull(async () => {
    const res = await httpGet<JsonObject>(
      `https://api.ebay.com/buy/browse/v1/item/get_items_by_item_group?item_group_id=${encodeURIComponent(itemGroupId)}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "X-EBAY-C-MARKETPLACE-ID": "EBAY_FR",
          Accept: "application/json",
        },
        timeout: EBAY_REQUEST_TIMEOUT_MS,
        noDedup: true,
        validateStatus: () => true,
      },
    );
    if (res.status >= 500) {
      throw new Error(`eBay item group ${itemGroupId} → HTTP ${res.status}`);
    }
    if (res.status !== 200 || !res.data || typeof res.data !== "object") {
      return [];
    }
    const rows = (res.data as { items?: EbayGroupItem[] }).items;
    return Array.isArray(rows) ? rows : [];
  }, 3, 500);
  return items ?? [];
}

function variationsFromItemGroup(
  items: EbayGroupItem[],
  kind: "album" | "fixeez",
): EbayDisney25Variation[] {
  const out: EbayDisney25Variation[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const itemId = String(item.itemId ?? "").trim();
    const varMatch = itemId.match(/\|(\d+)$/);
    if (!varMatch) continue;
    const aspect =
      kind === "fixeez"
        ? aspectValue(item.localizedAspects, /^numéro$/i)
        : aspectValue(item.localizedAspects, /numéro\s+de\s+cartes/i) ??
          aspectValue(item.localizedAspects, /^numéro$/i);
    if (!aspect) continue;
    const parsed = parseEbayDisney26GroupNumber(aspect, kind);
    if (!parsed || seen.has(parsed.number)) continue;
    seen.add(parsed.number);
    const imageUrl = bestEbayCoverUrl(item.image?.imageUrl) || undefined;
    out.push({
      number: parsed.number,
      name: parsed.name,
      variationId: varMatch[1]!,
      ...(imageUrl ? { imageUrl } : {}),
    });
  }
  return out.sort((a, b) => a.number.localeCompare(b.number, "en"));
}

/**
 * Bootstrap album + Fixeez ledgers from live eBay item groups.
 * Safe no-op when Browse returns nothing (credentials / rate / expired MSKU).
 */
export async function bootstrapEbayDisney26FacesLedger(opts: {
  legacyItemId?: string;
  fixeezLegacyItemId?: string;
  force?: boolean;
} = {}): Promise<EbayDisney25FacesLedger | null> {
  const existing = readEbayDisney26FacesLedger();
  const existingFixeez = readEbayDisney26FixeezFacesLedger();
  if (
    existing?.variations?.length &&
    existingFixeez?.variations?.length &&
    !opts.force
  ) {
    return existing;
  }

  const albumId = opts.legacyItemId ?? EBAY_DISNEY26_LEGACY_ITEM_ID;
  const fixeezId =
    opts.fixeezLegacyItemId ?? EBAY_DISNEY26_FIXEEZ_LEGACY_ITEM_ID;

  let albumLedger = existing;
  if (!albumLedger?.variations?.length || opts.force) {
    const variations = variationsFromItemGroup(
      await fetchEbayItemGroupItems(albumId),
      "album",
    );
    if (variations.length) {
      albumLedger = {
        source: "eBay Browse get_items_by_item_group — Disney Leclerc 2026 album",
        sourceId: EBAY_LECLERC_DISNEY26_SOURCE_ID,
        lang: EBAY_LECLERC_DISNEY26_LANG,
        setCode: SET,
        legacyItemId: albumId,
        marketplaceId: "EBAY_FR",
        listingUrl: `https://www.ebay.fr/itm/${albumId}`,
        note: "Aspect « Numéro de cartes » → 001–108; image from group row.",
        variations,
      };
      writeEbayDisney26FacesLedger(albumLedger);
    }
  }

  if (!existingFixeez?.variations?.length || opts.force) {
    const variations = variationsFromItemGroup(
      await fetchEbayItemGroupItems(fixeezId),
      "fixeez",
    );
    if (variations.length) {
      const ledger: EbayDisney25FacesLedger = {
        source: "eBay Browse get_items_by_item_group — Disney Leclerc 2026 Fixeez",
        sourceId: EBAY_LECLERC_DISNEY26_SOURCE_ID,
        lang: EBAY_LECLERC_DISNEY26_LANG,
        setCode: SET,
        legacyItemId: fixeezId,
        marketplaceId: "EBAY_FR",
        listingUrl: `https://www.ebay.fr/itm/${fixeezId}`,
        note: "Aspect « Numéro » (« N - Name ») → f01–f24.",
        variations,
      };
      writeFileSync(
        ebayDisney26FixeezFacesLedgerPath(),
        `${JSON.stringify(ledger, null, 2)}\n`,
      );
    }
  }

  return albumLedger;
}

export async function harvestEbayDisney26Faces(
  opts: { force?: boolean; stagingDir?: string; packId?: string } = {},
): Promise<EbayDisney25Harvest | null> {
  const op = leclercOpForSetCode(SET);
  if (!op) return null;
  await bootstrapEbayDisney26FacesLedger({ force: opts.force });
  const ledgers = readEbayDisney26AllLedgers();
  if (!ledgers.length) return { cards: 0, ok: 0, skip: 0, fail: 0 };

  const packId = opts.packId ?? op.packId;
  const staging = opts.stagingDir ?? ebayDisney26FacesStagingDir(packId);
  mkdirSync(staging, { recursive: true });

  let cards = 0;
  let ok = 0;
  let skip = 0;
  let fail = 0;

  for (const ledger of ledgers) {
    cards += ledger.variations.length;
    const updated: EbayDisney25Variation[] = [];
    for (const row of ledger.variations) {
      let imageUrl = row.imageUrl?.trim() || "";
      if (!imageUrl || opts.force) {
        const itemId = ebayBrowseItemId(ledger.legacyItemId, row.variationId);
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
      const buf = await downloadCardFaceBytes(imageUrl, {
        referer: "https://www.ebay.fr/",
        minBytes: 2_000,
        timeoutMs: 40_000,
      });
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
      writeFileSync(
        ebayDisney26FixeezFacesLedgerPath(),
        `${JSON.stringify({ ...ledger, variations: updated }, null, 2)}\n`,
      );
    } else {
      writeEbayDisney26FacesLedger({ ...ledger, variations: updated });
    }
  }

  return { cards, ok, skip, fail };
}

export async function installEbayDisney26Faces(
  index: LocalPrintsIndex,
  opts: { stagingDir?: string; packId?: string } = {},
): Promise<EbayDisney25Install> {
  const op = leclercOpForSetCode(SET);
  if (!op) return { faces: 0, missing: [] };
  const packId = opts.packId ?? op.packId;
  const staging = opts.stagingDir ?? ebayDisney26FacesStagingDir(packId);
  const missing: string[] = [];
  const assets: {
    printKey: string;
    lang: string;
    art: string;
    sourceUrl: string;
  }[] = [];

  for (const ledger of readEbayDisney26AllLedgers()) {
    const lang = ledger.lang || EBAY_LECLERC_DISNEY26_LANG;
    const sourceId = ledger.sourceId || EBAY_LECLERC_DISNEY26_SOURCE_ID;
    for (const row of ledger.variations) {
      const imageUrl = row.imageUrl?.trim();
      if (!imageUrl) {
        missing.push(row.number);
        continue;
      }
      const src = path.join(staging, stagingFile(row.number, imageUrl));
      const printKey = leclercPrintKey(SET, row.number);
      if (!printKey || !existsSync(src)) {
        missing.push(row.number);
        continue;
      }
      const ext = path.extname(src).toLowerCase() || ".jpg";
      const art = `art.${sourceId}${ext}`;
      const destDir = packCardDir(packId, { set: SET, lang, card: row.number });
      mkdirSync(destDir, { recursive: true });
      const dest = path.join(destDir, art);
      if (isEbayDisney25CardNumber(row.number)) {
        const cropped = await cropEbayDisney25CardSides(
          readFileSync(src),
          EBAY_DISNEY26_CARD_CROP,
        );
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
