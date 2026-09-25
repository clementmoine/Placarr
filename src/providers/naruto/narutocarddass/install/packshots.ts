/**
 * Naruto Carddass packshot installers — shared staging download loop + host
 * installers (press, marketplaces, boutiques).
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { httpGet } from "@/lib/http/httpClient";
import { dataRoot } from "@/lib/runtimeData";

import { NARUTO_PACK_ID } from "../identity";
import {
  cardgameclubImageUrl,
  cardgameclubIngestPackshots,
  ebayIngestPackshots,
  ebayListingImageFull,
  goatCdnOriginal,
  goatIngestPackshots,
  gradedcardcenterIngestPackshots,
  gradedcardcenterOriginalUrl,
  kinkaiIngestBacks,
  kinkaiIngestPackshots,
  kinkaiPackshotLedger,
  leboncoinIngestBacks,
  leboncoinIngestPackshots,
  leboncoinPackshotImageFull,
  mangaSanctuaryIngestPackshots,
  martinaIngestPackshots,
  sunnystoreIngestBacks,
  sunnystoreIngestPackshots,
  sunnystorePackshotLedger,
  trictracCdnOriginal,
  trictracIngestPackshots,
  magentoCatalogOriginal,
  scifiUniverseIngestPackshots,
  vialudibundaIngestPackshots,
  vintedIngestBacks,
  vintedIngestPackshots,
  vintedLedger,
} from "../sources/packshots";

// ─── shared staging download loop ──────────────────────────────────────────

export type StagingPackshotRow = {
  /** Optional when `idKey` is `staging` (e.g. Vinted extraAngles). */
  slug?: string;
  staging: string;
  url: string;
  page?: string;
  listing?: string;
};

export type InstallStagingPackshotsOptions = {
  packRoot?: string;
  force?: boolean;
};

export type StagingBytesAccept = (buf: Buffer) => boolean;

export const ACCEPT_JPEG: StagingBytesAccept = (buf) =>
  buf[0] === 0xff && buf[1] === 0xd8 && buf.byteLength >= 8_000;

export const ACCEPT_PNG: StagingBytesAccept = (buf) =>
  buf[0] === 0x89 &&
  buf.subarray(1, 4).toString("ascii") === "PNG" &&
  buf.byteLength >= 8_000;

export const ACCEPT_WEBP: StagingBytesAccept = (buf) =>
  buf.subarray(0, 4).toString() === "RIFF" && buf.byteLength >= 8_000;

export const ACCEPT_JPEG_OR_GIF: StagingBytesAccept = (buf) => {
  const jpeg = buf[0] === 0xff && buf[1] === 0xd8;
  const gif = buf.subarray(0, 3).toString("ascii") === "GIF";
  return (jpeg || gif) && buf.byteLength >= 8_000;
};

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

export async function installStagingPackshots(input: {
  packId: string;
  /** Relative staging folder under the pack root (created eagerly). */
  stagingDir: string;
  rows: readonly StagingPackshotRow[];
  options?: InstallStagingPackshotsOptions;
  /** Fixed referer, or per-row. */
  referer: string | ((row: StagingPackshotRow) => string);
  resolveUrl?: (row: StagingPackshotRow) => string;
  accept?: StagingBytesAccept;
  /** Key pushed into written/skipped (default: slug). */
  idKey?: "slug" | "staging";
  /**
   * `rowStaging` = `packRoot/row.staging` (default).
   * `basenameInFolder` = `packRoot/stagingDir/basename(row.staging)`.
   */
  destMode?: "rowStaging" | "basenameInFolder";
  dedupeByDest?: boolean;
}): Promise<{ written: string[]; skipped: string[] }> {
  const packRoot =
    input.options?.packRoot ?? path.join(dataRoot(), input.packId);
  const stagingAbs = path.join(packRoot, input.stagingDir);
  mkdirSync(stagingAbs, { recursive: true });
  const written: string[] = [];
  const skipped: string[] = [];
  const seen = new Set<string>();
  const accept = input.accept ?? ACCEPT_JPEG;
  const idKey = input.idKey ?? "slug";
  const destMode = input.destMode ?? "rowStaging";

  for (const row of input.rows) {
    const dest =
      destMode === "basenameInFolder"
        ? path.join(stagingAbs, path.basename(row.staging))
        : path.join(packRoot, row.staging);
    if (input.dedupeByDest) {
      if (seen.has(dest)) continue;
      seen.add(dest);
    }
    const id =
      idKey === "staging" ? row.staging : (row.slug ?? row.staging);
    if (!input.options?.force && existsSync(dest)) {
      skipped.push(id);
      continue;
    }
    const url = input.resolveUrl ? input.resolveUrl(row) : row.url;
    const referer =
      typeof input.referer === "function" ? input.referer(row) : input.referer;
    const buf = await downloadBytes(url, referer, accept);
    if (!buf) {
      skipped.push(id);
      continue;
    }
    mkdirSync(path.dirname(dest), { recursive: true });
    writeFileSync(dest, buf);
    written.push(id);
  }
  return { written, skipped };
}

async function downloadBytes(
  url: string,
  referer: string,
  accept: StagingBytesAccept,
): Promise<Buffer | null> {
  try {
    const res = await httpGet<ArrayBuffer>(url, {
      headers: { "User-Agent": UA, Referer: referer },
      responseType: "arraybuffer",
      timeout: 30_000,
      validateStatus: (status) => status === 200,
    });
    const buf = Buffer.from(res.data as ArrayBuffer);
    return accept(buf) ? buf : null;
  } catch {
    return null;
  }
}

// ─── Press / boutique twins — Manga Sanctuary + Martina ────────────────────

export const NARUTO_STAGING_MANGA_SANCTUARY = path.join(
  "staging",
  "manga-sanctuary",
);
export const NARUTO_STAGING_MARTINA = path.join("staging", "martina");

const MANGA_SANCTUARY_REFERER =
  "https://www.manga-sanctuary.com/news/7397/naruto-jcc.html";

export type InstallMangaSanctuaryPackshotsOptions =
  InstallStagingPackshotsOptions;
export type InstallMartinaPackshotsOptions = InstallStagingPackshotsOptions;

/** Download Manga Sanctuary press packshots into staging. */
export async function installMangaSanctuaryPackshots(
  options: InstallMangaSanctuaryPackshotsOptions = {},
): Promise<{ written: string[]; skipped: string[] }> {
  return installStagingPackshots({
    packId: NARUTO_PACK_ID,
    stagingDir: NARUTO_STAGING_MANGA_SANCTUARY,
    rows: mangaSanctuaryIngestPackshots(),
    options,
    referer: MANGA_SANCTUARY_REFERER,
  });
}

/** Download Martina’s Fumetti packshots into staging. */
export async function installMartinaPackshots(
  options: InstallMartinaPackshotsOptions = {},
): Promise<{ written: string[]; skipped: string[] }> {
  return installStagingPackshots({
    packId: NARUTO_PACK_ID,
    stagingDir: NARUTO_STAGING_MARTINA,
    rows: martinaIngestPackshots(),
    options,
    referer: (row) => row.page ?? row.url,
  });
}

// ─── eBay ──────────────────────────────────────────────────────────────────

export const NARUTO_STAGING_EBAY = path.join("staging", "ebay");

export type InstallEbayPackshotsOptions = InstallStagingPackshotsOptions;

export async function installEbayPackshots(
  options: InstallEbayPackshotsOptions = {},
): Promise<{ written: string[]; skipped: string[] }> {
  return installStagingPackshots({
    packId: NARUTO_PACK_ID,
    stagingDir: NARUTO_STAGING_EBAY,
    rows: ebayIngestPackshots(),
    options,
    referer: "https://www.ebay.fr/",
    resolveUrl: (row) => ebayListingImageFull(row.url),
    accept: ACCEPT_WEBP,
    destMode: "basenameInFolder",
  });
}

// ─── Goat EN display boxes ─────────────────────────────────────────────────

export const NARUTO_STAGING_GOAT_EN_BOXES = path.join(
  "staging",
  "goat-en-boxes",
);

const ACCEPT_BOX: StagingBytesAccept = (buf) => {
  const jpeg = buf[0] === 0xff && buf[1] === 0xd8;
  const png =
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
  const gif =
    buf.subarray(0, 6).toString("ascii") === "GIF89a" ||
    buf.subarray(0, 6).toString("ascii") === "GIF87a";
  return (jpeg || png || gif) && buf.byteLength >= 8_000;
};

export type InstallGoatPackshotsOptions = InstallStagingPackshotsOptions;

export async function installGoatPackshots(
  options: InstallGoatPackshotsOptions = {},
): Promise<{ written: string[]; skipped: string[] }> {
  return installStagingPackshots({
    packId: NARUTO_PACK_ID,
    stagingDir: NARUTO_STAGING_GOAT_EN_BOXES,
    rows: goatIngestPackshots(),
    options,
    referer:
      "https://goatcardsshop.crystalcommerce.com/catalog/naruto_sealed_product-naruto_ccg_sealed_booster_boxes/3970",
    resolveUrl: (row) => goatCdnOriginal(row.url),
    accept: ACCEPT_BOX,
  });
}

// ─── Kinkai ────────────────────────────────────────────────────────────────

export const NARUTO_STAGING_KINKAI = path.join("staging", "kinkai");

export type InstallKinkaiPackshotsOptions = InstallStagingPackshotsOptions;

export async function installKinkaiPackshots(
  options: InstallKinkaiPackshotsOptions = {},
): Promise<{ written: string[]; skipped: string[] }> {
  const ledger = kinkaiPackshotLedger();
  const rows = [...kinkaiIngestPackshots(), ...kinkaiIngestBacks()];
  return installStagingPackshots({
    packId: NARUTO_PACK_ID,
    stagingDir: NARUTO_STAGING_KINKAI,
    rows,
    options,
    referer: (row) => row.listing || ledger.listing,
    accept: ACCEPT_WEBP,
    idKey: "staging",
    dedupeByDest: true,
  });
}

// ─── SciFi-Universe ────────────────────────────────────────────────────────

export const NARUTO_STAGING_SCIFI = path.join(
  "staging",
  "scifi-universe",
  "images",
);

export type InstallScifiUniversePackshotsOptions =
  InstallStagingPackshotsOptions;

export async function installScifiUniversePackshots(
  options: InstallScifiUniversePackshotsOptions = {},
): Promise<{ written: string[]; skipped: string[] }> {
  return installStagingPackshots({
    packId: NARUTO_PACK_ID,
    stagingDir: NARUTO_STAGING_SCIFI,
    rows: scifiUniverseIngestPackshots(),
    options,
    referer: "https://www.scifi-universe.com/jeux/10095/naruto-jcc/gamme",
    accept: ACCEPT_JPEG_OR_GIF,
  });
}

// ─── Sunny Store ───────────────────────────────────────────────────────────

export const NARUTO_STAGING_SUNNYSTORE = path.join("staging", "sunnystore");

export type InstallSunnystorePackshotsOptions = InstallStagingPackshotsOptions;

export async function installSunnystorePackshots(
  options: InstallSunnystorePackshotsOptions = {},
): Promise<{ written: string[]; skipped: string[] }> {
  const ledger = sunnystorePackshotLedger();
  const rows = [...sunnystoreIngestPackshots(), ...sunnystoreIngestBacks()];
  return installStagingPackshots({
    packId: NARUTO_PACK_ID,
    stagingDir: NARUTO_STAGING_SUNNYSTORE,
    rows,
    options,
    referer: (row) => row.listing || ledger.listings[0] || row.url,
    accept: ACCEPT_JPEG,
    idKey: "staging",
    dedupeByDest: true,
  });
}

// ─── Tric Trac ─────────────────────────────────────────────────────────────

export const NARUTO_STAGING_TRICTRAC = path.join("staging", "trictrac");

export type InstallTrictracOptions = InstallStagingPackshotsOptions;

export async function installTrictracPackshots(
  options: InstallTrictracOptions = {},
): Promise<{ written: string[]; skipped: string[] }> {
  return installStagingPackshots({
    packId: NARUTO_PACK_ID,
    stagingDir: NARUTO_STAGING_TRICTRAC,
    rows: trictracIngestPackshots(),
    options,
    referer: "https://trictrac.net/",
    resolveUrl: (row) => trictracCdnOriginal(row.url),
    accept: ACCEPT_JPEG,
    destMode: "basenameInFolder",
  });
}

// ─── CardGameClub ──────────────────────────────────────────────────────────

export const NARUTO_STAGING_CARDGAMECLUB = path.join("staging", "cardgameclub");

export type InstallCardgameclubPackshotsOptions =
  InstallStagingPackshotsOptions;

export async function installCardgameclubPackshots(
  options: InstallCardgameclubPackshotsOptions = {},
): Promise<{ written: string[]; skipped: string[] }> {
  return installStagingPackshots({
    packId: NARUTO_PACK_ID,
    stagingDir: NARUTO_STAGING_CARDGAMECLUB,
    rows: cardgameclubIngestPackshots().map((row) => ({
      slug: row.slug,
      staging: row.staging,
      url: cardgameclubImageUrl(row.image),
    })),
    options,
    referer: "https://cardgameclub.it/",
    accept: ACCEPT_PNG,
  });
}

// ─── Leboncoin ─────────────────────────────────────────────────────────────

export const NARUTO_STAGING_LEBONCOIN = path.join("staging", "leboncoin");

const LEBONCOIN_REFERER = "https://www.leboncoin.fr/";

export type InstallLeboncoinPackshotsOptions = InstallStagingPackshotsOptions;

export async function installLeboncoinPackshots(
  options: InstallLeboncoinPackshotsOptions = {},
): Promise<{ written: string[]; skipped: string[] }> {
  const rows = [...leboncoinIngestPackshots(), ...leboncoinIngestBacks()];
  return installStagingPackshots({
    packId: NARUTO_PACK_ID,
    stagingDir: NARUTO_STAGING_LEBONCOIN,
    rows,
    options,
    referer: (row) => row.listing || LEBONCOIN_REFERER,
    resolveUrl: (row) => leboncoinPackshotImageFull(row.url),
    accept: ACCEPT_JPEG,
    idKey: "staging",
    dedupeByDest: true,
  });
}

// ─── Vinted ────────────────────────────────────────────────────────────────

export const NARUTO_STAGING_VINTED = path.join("staging", "vinted");

export type InstallVintedPackshotsOptions = InstallStagingPackshotsOptions;

export async function installVintedPackshots(
  options: InstallVintedPackshotsOptions = {},
): Promise<{ written: string[]; skipped: string[] }> {
  const ledger = vintedLedger();
  const rows: StagingPackshotRow[] = [
    ...vintedIngestPackshots(),
    ...vintedIngestBacks(),
    ...ledger.extraAngles.filter((row) => row.staging),
  ];
  return installStagingPackshots({
    packId: NARUTO_PACK_ID,
    stagingDir: NARUTO_STAGING_VINTED,
    rows,
    options,
    referer: ledger.listing,
    accept: ACCEPT_WEBP,
    idKey: "staging",
    dedupeByDest: true,
  });
}

// ─── Graded Card Center (recto/verso paste; custom loop) ───────────────────

export const NARUTO_STAGING_GRADEDCARDCENTER = path.join(
  "staging",
  "gradedcardcenter",
);

export type InstallGradedcardcenterPackshotsOptions = {
  packRoot?: string;
  force?: boolean;
};

export async function installGradedcardcenterPackshots(
  options: InstallGradedcardcenterPackshotsOptions = {},
): Promise<{ written: string[]; skipped: string[] }> {
  const packRoot = options.packRoot ?? path.join(dataRoot(), NARUTO_PACK_ID);
  mkdirSync(path.join(packRoot, NARUTO_STAGING_GRADEDCARDCENTER), {
    recursive: true,
  });
  const written: string[] = [];
  const skipped: string[] = [];
  for (const row of gradedcardcenterIngestPackshots()) {
    const faces = [
      { key: row.slug, url: row.recto.url, staging: row.recto.staging },
      {
        key: `${row.slug}-back`,
        url: row.verso.url,
        staging: row.verso.staging,
      },
    ];
    for (const face of faces) {
      const dest = path.join(packRoot, face.staging);
      if (!options.force && existsSync(dest)) {
        skipped.push(face.key);
        continue;
      }
      const buf = await downloadGccJpeg(gradedcardcenterOriginalUrl(face.url));
      if (!buf) {
        skipped.push(face.key);
        continue;
      }
      mkdirSync(path.dirname(dest), { recursive: true });
      writeFileSync(dest, buf);
      written.push(face.key);
    }
  }
  return { written, skipped };
}

async function downloadGccJpeg(url: string): Promise<Buffer | null> {
  try {
    const res = await httpGet<ArrayBuffer>(url, {
      headers: { "User-Agent": UA, Referer: "https://gradedcardcenter.com/" },
      responseType: "arraybuffer",
      timeout: 30_000,
      validateStatus: (status) => status === 200,
    });
    const buf = Buffer.from(res.data as ArrayBuffer);
    if (buf[0] !== 0xff || buf[1] !== 0xd8) return null;
    return buf.byteLength >= 8_000 ? buf : null;
  } catch {
    return null;
  }
}

// ─── Via Ludibunda ─────────────────────────────────────────────────────────

export const NARUTO_STAGING_VIALUDIBUNDA = path.join("staging", "vialudibunda");

export type InstallVialudibundaOptions = InstallStagingPackshotsOptions;

/**
 * Download Via Ludibunda catalog originals into
 * `data/naruto/carddass/staging/vialudibunda/`.
 *
 * Magento cache thumbs stay in the ledger as `thumb` only.
 */
export async function installVialudibundaPackshots(
  options: InstallVialudibundaOptions = {},
): Promise<{ written: string[]; skipped: string[] }> {
  return installStagingPackshots({
    packId: NARUTO_PACK_ID,
    stagingDir: NARUTO_STAGING_VIALUDIBUNDA,
    rows: vialudibundaIngestPackshots(),
    options,
    referer: "https://vialudibunda.com/",
    resolveUrl: (row) => magentoCatalogOriginal(row.url),
    accept: ACCEPT_JPEG,
    destMode: "basenameInFolder",
  });
}
