/**
 * Shippuden face installers — Mercari ledger dumps + Suruga-ya CDN scans.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { httpGet } from "@/lib/http/httpClient";
import { packCardDir, packStagingDir } from "@/lib/packPaths";
import { dataRoot } from "@/lib/runtimeData";
import { downloadMercariOrigPhoto } from "@/providers/naruto/shared/mercariCdn";
import { promoteAndPurgeNarutoDig } from "@/providers/naruto/shared/promoteNarutoDig";

import { narutoShippudenCuratedDir } from "../assets";
import {
  NARUTO_SHIPPUDEN_PACK_ID,
  openNarutoShippudenDbForWrite,
} from "../indexStore";
import {
  foldSurugaShippudenListings,
  loadSurugaShippudenCuratedListings,
  parseCardNameFromSurugaTitle,
  SURUGA_SHIPPUDEN_ORIGIN,
  type SurugaShippudenCard,
} from "../parse/suruga";
import { diskIdFromPrintedReference } from "../search";
import { shippudenMercariIngestFaces } from "../sources/faces";

const LANG = "ja";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const MIN_BYTES = 4_000;
const DEFAULT_DELAY_MS = 60;
const DEFAULT_CONCURRENCY = 6;

const sleep = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

function extFromMagic(buf: Buffer): string {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return ".jpg";
  }
  if (buf.length >= 8 && buf.subarray(1, 4).toString("ascii") === "PNG") {
    return ".png";
  }
  if (buf.length >= 12 && buf.subarray(8, 12).toString("ascii") === "WEBP") {
    return ".webp";
  }
  return ".bin";
}

function existingHostArt(cardDir: string, host: string): string | null {
  if (!existsSync(cardDir)) return null;
  const re = new RegExp(`^art\\.${host}\\.`, "i");
  return readdirSync(cardDir).find((name) => re.test(name)) ?? null;
}

function writeHostArt(cardDir: string, host: string, buf: Buffer): string {
  const ext = extFromMagic(buf);
  const destName = `art.${host}${ext === ".bin" ? ".bin" : ext}`;
  const re = new RegExp(`^art\\.${host}\\.`, "i");
  mkdirSync(cardDir, { recursive: true });
  for (const name of readdirSync(cardDir)) {
    if (re.test(name) && name !== destName) {
      unlinkSync(path.join(cardDir, name));
    }
  }
  writeFileSync(path.join(cardDir, destName), buf);
  return destName;
}

async function mapPool<T>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let i = 0;
  const n = Math.max(1, concurrency);
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) {
        const idx = i;
        i += 1;
        await fn(items[idx]!);
      }
    }),
  );
}

// ─── Mercari ───────────────────────────────────────────────────────────────

export type InstallShippudenMercariFacesOptions = {
  packRoot?: string;
  curatedRoot?: string;
  force?: boolean;
  dryRun?: boolean;
  fetchImage?: (url: string) => Promise<Buffer | null>;
};

/**
 * Disk layout: `cards/{family}/{lang}/{diskId}/art.mercari.*`
 * (`shi/ja/shi0001/…`).
 */
export async function installShippudenMercariFaces(
  options: InstallShippudenMercariFacesOptions = {},
): Promise<{ written: string[]; skipped: string[]; failed: string[] }> {
  const packRoot =
    options.packRoot ?? path.join(dataRoot(), NARUTO_SHIPPUDEN_PACK_ID);
  const curatedRoot = options.curatedRoot ?? narutoShippudenCuratedDir();
  const fetchImage = options.fetchImage ?? downloadMercariOrigPhoto;
  const staging = path.join(packStagingDir(NARUTO_SHIPPUDEN_PACK_ID), "mercari");
  mkdirSync(staging, { recursive: true });

  const written: string[] = [];
  const skipped: string[] = [];
  const failed: string[] = [];

  for (const row of shippudenMercariIngestFaces()) {
    const diskId = diskIdFromPrintedReference(row.printedRef);
    if (!diskId) {
      failed.push(row.printedRef);
      continue;
    }
    const family = diskId.replace(/\d+$/, "");
    const cardDir = packCardDir(NARUTO_SHIPPUDEN_PACK_ID, {
      set: family,
      lang: LANG,
      card: diskId,
    });
    const key = `${diskId}/${LANG}`;

    const printKey = `naruto:${family}-${diskId.slice(family.length)}`;
    let destName = existingHostArt(cardDir, "mercari");

    if (!destName || options.force) {
      let buf: Buffer | null = null;
      const curatedRel =
        "curated" in row && typeof row.curated === "string" ? row.curated : null;
      if (curatedRel) {
        const src = path.join(curatedRoot, curatedRel);
        if (existsSync(src)) buf = readFileSync(src);
      }
      if (!buf && typeof row.url === "string" && row.url.length > 0) {
        buf = await fetchImage(row.url);
      }
      if (!buf || extFromMagic(buf) === ".bin" || buf.byteLength < 8_000) {
        failed.push(key);
        continue;
      }
      if (options.dryRun) {
        written.push(key);
        continue;
      }
      writeFileSync(path.join(staging, `${diskId}${extFromMagic(buf)}`), buf);
      destName = writeHostArt(cardDir, "mercari", buf);
      written.push(key);
    } else {
      skipped.push(key);
    }

    try {
      const db = openNarutoShippudenDbForWrite();
      db.prepare(
        `INSERT INTO print_assets (print_key, lang, art, source_url, printed)
         VALUES (?, ?, ?, ?, 1)
         ON CONFLICT(print_key, lang) DO UPDATE SET
           art = excluded.art,
           source_url = COALESCE(excluded.source_url, print_assets.source_url)`,
      ).run(printKey, LANG, destName, row.listingUrl);
    } catch {
      /* ignore db errors in dry runs or headless tests */
    }
  }

  writeFileSync(
    path.join(staging, "faces.json"),
    `${JSON.stringify({ source: "mercari", packRoot, written, skipped, failed }, null, 2)}\n`,
  );

  return { written, skipped, failed };
}

// ─── Suruga-ya ─────────────────────────────────────────────────────────────

async function downloadSurugaBytes(url: string): Promise<Buffer | null> {
  try {
    const res = await httpGet<ArrayBuffer>(url, {
      headers: {
        "User-Agent": UA,
        Accept: "image/jpeg,image/*,*/*;q=0.8",
        Referer: `${SURUGA_SHIPPUDEN_ORIGIN}/`,
      },
      responseType: "arraybuffer",
      timeout: 30_000,
      validateStatus: (status) => status === 200,
    });
    const buf = Buffer.from(res.data as ArrayBuffer);
    if (extFromMagic(buf) === ".bin") return null;
    return buf.byteLength >= MIN_BYTES ? buf : null;
  } catch {
    return null;
  }
}

export type InstallShippudenSurugaFacesOptions = {
  packRoot?: string;
  force?: boolean;
  limit?: number;
  delayMs?: number;
  concurrency?: number;
};

export async function installShippudenSurugaFaces(
  options: InstallShippudenSurugaFacesOptions = {},
): Promise<{
  listed: number;
  written: string[];
  skipped: string[];
  failed: string[];
}> {
  const packRoot =
    options.packRoot ?? path.join(dataRoot(), NARUTO_SHIPPUDEN_PACK_ID);
  const staging = path.join(
    packStagingDir(NARUTO_SHIPPUDEN_PACK_ID),
    "suruga-ya-shippuden",
  );
  mkdirSync(staging, { recursive: true });

  let cards = foldSurugaShippudenListings(
    loadSurugaShippudenCuratedListings(),
  );
  if (options.limit && options.limit > 0) cards = cards.slice(0, options.limit);

  const delayMs = options.delayMs ?? DEFAULT_DELAY_MS;
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;

  const written: string[] = [];
  const skipped: string[] = [];
  const failed: string[] = [];

  let db: ReturnType<typeof openNarutoShippudenDbForWrite> | null = null;
  try {
    db = openNarutoShippudenDbForWrite();
  } catch {
    /* ignore in tests */
  }

  await mapPool(cards, concurrency, async (card: SurugaShippudenCard) => {
    const cardDir = packCardDir(NARUTO_SHIPPUDEN_PACK_ID, {
      set: card.family,
      lang: LANG,
      card: card.diskId,
    });
    const key = `${card.diskId}/${LANG}`;

    let destName = existingHostArt(cardDir, "suruga");
    if (!destName || options.force) {
      let buf: Buffer | null = null;
      let winningId: string | null = null;

      for (const id of card.productIds) {
        const faceUrl = `https://cdn.suruga-ya.jp/database/pics/game/${id.toLowerCase()}.jpg`;
        buf = await downloadSurugaBytes(faceUrl);
        if (buf) {
          winningId = id;
          break;
        }
        await sleep(delayMs);
      }

      if (!buf || !winningId) {
        failed.push(key);
        return;
      }

      destName = writeHostArt(cardDir, "suruga", buf);
      const stagingExt = extFromMagic(buf);
      writeFileSync(
        path.join(staging, `${card.diskId}${stagingExt === ".bin" ? ".jpg" : stagingExt}`),
        buf,
      );
      written.push(key);
      await sleep(delayMs);
    } else {
      skipped.push(key);
    }

    if (destName && db) {
      try {
        db.prepare(
          `INSERT INTO prints (print_key, card_type, number, set_code)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(print_key) DO NOTHING`,
        ).run(
          card.printKey,
          card.family,
          card.diskId,
          card.family.startsWith("pr") ? "promo" : "unknown",
        );

        if (card.title) {
          const parsedName = parseCardNameFromSurugaTitle(card.title);
          if (parsedName) {
            db.prepare(
              `INSERT INTO print_titles (print_key, lang, full_name)
               VALUES (?, ?, ?)
               ON CONFLICT(print_key, lang) DO NOTHING`,
            ).run(card.printKey, LANG, parsedName);
          }
        }

        db.prepare(
          `INSERT INTO print_assets (print_key, lang, art, source_url, printed)
           VALUES (?, ?, ?, ?, 1)
           ON CONFLICT(print_key, lang) DO UPDATE SET
             art = CASE
               WHEN print_assets.art LIKE 'art.mercari%' THEN print_assets.art
               ELSE excluded.art
             END,
             source_url = COALESCE(print_assets.source_url, excluded.source_url)`,
        ).run(
          card.printKey,
          LANG,
          destName,
          `https://www.suruga-ya.jp/product/detail/${card.productIds[0]}`,
        );
      } catch {
        /* ignore db errors in dry run */
      }
    }
  });

  writeFileSync(
    path.join(staging, "faces.json"),
    `${JSON.stringify(
      {
        source: "suruga-ya-shippuden",
        packRoot,
        listed: cards.length,
        written: written.length,
        skipped: skipped.length,
        failed: failed.length,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  if (
    !options.force &&
    options.limit == null &&
    failed.length === 0 &&
    cards.length > 0
  ) {
    promoteAndPurgeNarutoDig({
      packId: NARUTO_SHIPPUDEN_PACK_ID,
      artefactId: "faces:suruga-shippuden",
      stagingRel: "suruga-ya-shippuden",
    });
  }

  return {
    listed: cards.length,
    written,
    skipped,
    failed,
  };
}
