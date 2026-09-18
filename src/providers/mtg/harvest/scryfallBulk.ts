/**
 * Scryfall bulk client — UA + cache under data/mtg/staging/scryfall/.
 *
 * Prefer bulk download over /cards crawl (Scryfall ToS + rate limits).
 */
import {
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createInterface } from "node:readline";
import { createGunzip } from "node:zlib";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

import { httpGet, HTTP_DEFAULT_USER_AGENT } from "@/lib/http/httpClient";
import { packStagingDir } from "@/lib/packPaths";

import { MTG_PACK_ID } from "../pack";

const SCRYFALL_UA = `${HTTP_DEFAULT_USER_AGENT} Scryfall-bulk`;
const BULK_META_URL = "https://api.scryfall.com/bulk-data";

export type ScryfallBulkType = "default_cards" | "all_cards";

export type ScryfallCardFace = {
  name?: string;
  printed_name?: string;
  image_uris?: { normal?: string; small?: string; large?: string };
};

export type ScryfallCard = {
  id: string;
  name: string;
  /** Localized face name when `lang` ≠ English — prefer over `name`. */
  printed_name?: string;
  lang?: string;
  set?: string;
  collector_number?: string;
  rarity?: string;
  digital?: boolean;
  layout?: string;
  type_line?: string;
  finishes?: string[];
  image_uris?: { normal?: string; small?: string; large?: string };
  card_faces?: ScryfallCardFace[];
  released_at?: string;
  set_type?: string;
};

type BulkListRow = {
  type: string;
  updated_at?: string;
  download_uri?: string;
  /** Scryfall now ships gzipped JSON Lines under this key. */
  jsonl_download_uri?: string;
  compressed_size?: number;
};

export function scryfallStagingDir(): string {
  return path.join(packStagingDir(MTG_PACK_ID), "scryfall");
}

export async function fetchScryfallBulkMeta(): Promise<BulkListRow[]> {
  const res = await httpGet<{ data?: BulkListRow[] }>(BULK_META_URL, {
    headers: {
      "User-Agent": SCRYFALL_UA,
      Accept: "application/json",
    },
    timeout: 60_000,
    hostProfile: "api",
  });
  return Array.isArray(res.data?.data) ? res.data.data : [];
}

function bulkDownloadUri(row: BulkListRow): string | null {
  return row.jsonl_download_uri?.trim() || row.download_uri?.trim() || null;
}

/**
 * Download + gunzip Scryfall bulk to staging (cached by updated_at).
 * Returns path to the uncompressed `.jsonl` (or legacy `.json`) file.
 */
export async function ensureScryfallBulkFile(
  type: ScryfallBulkType = "all_cards",
  opts: { force?: boolean } = {},
): Promise<{ path: string; cardsApprox: number; updatedAt: string }> {
  const meta = await fetchScryfallBulkMeta();
  const row = meta.find((r) => r.type === type);
  const downloadUri = row ? bulkDownloadUri(row) : null;
  if (!row?.updated_at || !downloadUri) {
    throw new Error(`Scryfall bulk type « ${type} » introuvable`);
  }
  const stamp = row.updated_at.replace(/[:.]/g, "-");
  const dir = scryfallStagingDir();
  mkdirSync(dir, { recursive: true });
  const isJsonl = downloadUri.includes(".jsonl");
  const dest = path.join(dir, `${type}-${stamp}${isJsonl ? ".jsonl" : ".json"}`);
  const metaPath = path.join(dir, `${type}.meta.json`);

  if (!opts.force && existsSync(dest)) {
    writeFileSync(
      metaPath,
      JSON.stringify(
        { type, updatedAt: row.updated_at, path: dest },
        null,
        2,
      ),
    );
    return { path: dest, cardsApprox: 0, updatedAt: row.updated_at };
  }

  const gzPath = `${dest}.gz.partial`;
  const res = await httpGet<ArrayBuffer>(downloadUri, {
    headers: { "User-Agent": SCRYFALL_UA, Accept: "*/*" },
    responseType: "arraybuffer",
    timeout: 600_000,
    // all_cards gzip ≈ 400 MB ; leave headroom for growth.
    maxContentLength: 700 * 1024 * 1024,
    maxBodyLength: 700 * 1024 * 1024,
    hostProfile: "api",
    noDedup: true,
  });
  writeFileSync(gzPath, Buffer.from(res.data));

  const tmpOut = `${dest}.partial`;
  await pipeline(
    Readable.from(readFileSync(gzPath)),
    createGunzip(),
    createWriteStream(tmpOut),
  );
  renameSync(tmpOut, dest);
  try {
    const { unlinkSync } = await import("node:fs");
    unlinkSync(gzPath);
  } catch {
    /* ignore */
  }

  writeFileSync(
    metaPath,
    JSON.stringify(
      {
        type,
        updatedAt: row.updated_at,
        path: dest,
        bytes: statSync(dest).size,
      },
      null,
      2,
    ),
  );
  return { path: dest, cardsApprox: 0, updatedAt: row.updated_at };
}

/** Stream-load bulk file — JSON Lines (current) or small JSON array (tests). */
export async function loadScryfallBulkCards(
  filePath: string,
): Promise<ScryfallCard[]> {
  if (filePath.endsWith(".json") && !filePath.endsWith(".jsonl")) {
    // Small fixture arrays only — never full Scryfall dumps as one string.
    const size = statSync(filePath).size;
    if (size < 50 * 1024 * 1024) {
      const raw = JSON.parse(readFileSync(filePath, "utf8")) as unknown;
      if (Array.isArray(raw)) return raw as ScryfallCard[];
    }
  }
  const out: ScryfallCard[] = [];
  const rl = createInterface({
    input: createReadStream(filePath, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    out.push(JSON.parse(trimmed) as ScryfallCard);
  }
  return out;
}

/** Front-face art URL for catalogue tiles. */
export function scryfallFrontImageUrl(card: ScryfallCard): string | null {
  const direct = card.image_uris?.normal ?? card.image_uris?.large ?? null;
  if (direct) return direct;
  const face = card.card_faces?.[0];
  return face?.image_uris?.normal ?? face?.image_uris?.large ?? null;
}

export function scryfallFrontName(card: ScryfallCard): string {
  // Foreign printings keep the EN oracle string in `name`; the face text is
  // `printed_name` (Scryfall docs). Prefer that so FR search finds « Éclair ».
  const printed = card.printed_name?.trim();
  if (printed) return printed;
  if (card.name?.trim()) {
    // DFC: "Front // Back" — keep full printed / oracle name.
    return card.name.trim();
  }
  const facePrinted = card.card_faces?.[0]?.printed_name?.trim();
  if (facePrinted) return facePrinted;
  return card.card_faces?.[0]?.name?.trim() || "Unknown";
}
