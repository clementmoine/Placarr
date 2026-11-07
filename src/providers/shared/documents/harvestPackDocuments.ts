/**
 * Catalogue Sync harvest — curated public document URLs →
 * `data/<pack>/documents/{lang}/{kind}/` + index.json.
 *
 * Prefer `localPath` (staging / sources already on disk) over network GET.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  classifyPackDocument,
  documentRelativePath,
  readPackDocumentsIndex,
  upsertPackDocumentEntry,
  writePackDocumentsIndex,
  type CuratedPackDocument,
  type PackDocumentEntry,
} from "@/lib/admin/packDocuments";
import { httpGet } from "@/lib/http/httpClient";
import { packDataDir, packDocumentsDir } from "@/lib/packPaths";
import { dataRoot } from "@/lib/runtimeData";

export type HarvestPackDocumentsResult = {
  packId: string;
  total: number;
  fetched: number;
  skipped: number;
  urlOnly: number;
  failed: number;
  errors: string[];
};

export type HarvestPackDocumentsOpts = {
  packId: string;
  curated: readonly CuratedPackDocument[];
  force?: boolean;
  signal?: AbortSignal;
  /** Injected for tests — defaults to httpGet arraybuffer. */
  fetchBytes?: (url: string, signal?: AbortSignal) => Promise<Buffer>;
};

async function defaultFetchBytes(
  url: string,
  signal?: AbortSignal,
): Promise<Buffer> {
  const res = await httpGet<ArrayBuffer>(url, {
    responseType: "arraybuffer",
    timeout: 120_000,
    signal,
    hostProfile: "scrape",
  });
  return Buffer.from(res.data);
}

function looksLikePdfPath(value: string): boolean {
  return /\.pdf([?#]|$)/i.test(value.trim());
}

/**
 * Reject truncated Wayback / mid-stream dumps.
 * Linearized captures often embed an early `%%EOF` then cut off — require the
 * file to *end* with `%%EOF` (whitespace after OK).
 */
export function isCompletePdfBytes(bytes: Buffer): boolean {
  if (bytes.length < 16) return false;
  if (bytes.subarray(0, 5).toString("latin1") !== "%PDF-") return false;
  let end = bytes.length;
  while (
    end > 0 &&
    (bytes[end - 1] === 0x00 ||
      bytes[end - 1] === 0x09 ||
      bytes[end - 1] === 0x0a ||
      bytes[end - 1] === 0x0d ||
      bytes[end - 1] === 0x20)
  ) {
    end -= 1;
  }
  if (end < 5) return false;
  return bytes.subarray(end - 5, end).equals(Buffer.from("%%EOF"));
}

function shouldDownload(entry: CuratedPackDocument): boolean {
  // Explicit opt-out wins over waybackUrl / localPath.
  if (entry.download === false) return false;
  if (entry.localPath?.trim()) return true;
  if (entry.waybackUrl?.trim()) return true;
  try {
    const u = new URL(entry.url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    if (/brand\.ravensburger-group\.com/i.test(u.hostname)) return false;
    const pathLower = decodeURIComponent(u.pathname).toLowerCase();
    return /\.(pdf|png|jpe?g|webp)$/i.test(pathLower);
  } catch {
    return false;
  }
}

/** Resolve curated localPath under the pack (or `..` within dataRoot). */
export function resolveCuratedLocalPath(
  packId: string,
  localPath: string,
): string | null {
  const cleaned = localPath.replace(/\\/g, "/").trim();
  if (!cleaned || cleaned.startsWith("/") || cleaned.includes("\0")) return null;
  const abs = path.resolve(packDataDir(packId), cleaned);
  const root = path.resolve(dataRoot()) + path.sep;
  if (!abs.startsWith(root) && abs !== path.resolve(dataRoot())) return null;
  if (!existsSync(abs)) return null;
  return abs;
}

function classifySourceUrl(entry: CuratedPackDocument): string {
  const url = entry.url.trim();
  if (/^https?:\/\//i.test(url) && /\.(pdf|png|jpe?g|webp)([?#]|$)/i.test(url)) {
    return url;
  }
  const base = path.basename(entry.localPath || url);
  return `https://documents.local/${base}`;
}

export async function harvestPackDocuments(
  opts: HarvestPackDocumentsOpts,
): Promise<HarvestPackDocumentsResult> {
  const { packId, curated, force = false, signal } = opts;
  const fetchBytes = opts.fetchBytes ?? defaultFetchBytes;
  const result: HarvestPackDocumentsResult = {
    packId,
    total: curated.length,
    fetched: 0,
    skipped: 0,
    urlOnly: 0,
    failed: 0,
    errors: [],
  };

  let index = readPackDocumentsIndex(packId);

  for (const curatedRow of curated) {
    if (signal?.aborted) throw new Error("documents harvest cancelled");
    const url = curatedRow.url?.trim();
    if (!url) continue;

    const classified = classifyPackDocument(
      classifySourceUrl(curatedRow),
      curatedRow,
    );

    const download = shouldDownload(curatedRow);

    if (!download) {
      const entry: PackDocumentEntry = {
        id: classified.id,
        title: classified.title,
        lang: classified.lang,
        kind: classified.kind,
        sourceUrl: url,
        fetchedAt: null,
        relativePath: null,
        sha256: null,
        bytes: null,
      };
      index = upsertPackDocumentEntry(index, entry);
      result.urlOnly += 1;
      continue;
    }

    const relativePath = documentRelativePath(
      classified.lang,
      classified.kind,
      classified.filename,
    );
    const abs = path.join(packDocumentsDir(packId), relativePath);
    const existing = index.documents.find((d) => d.id === classified.id);

    const expectPdf =
      looksLikePdfPath(classified.filename) || looksLikePdfPath(url);

    if (
      !force &&
      existing?.relativePath === relativePath &&
      existing.sha256 &&
      existsSync(abs)
    ) {
      const onDisk = readFileSync(abs);
      if (!expectPdf || isCompletePdfBytes(onDisk)) {
        result.skipped += 1;
        continue;
      }
      // Truncated on-disk PDF — fall through to re-fetch / replace.
    }

    try {
      let bytes: Buffer | null = null;
      const localAbs = curatedRow.localPath
        ? resolveCuratedLocalPath(packId, curatedRow.localPath)
        : null;
      const wayback = curatedRow.waybackUrl?.trim() || "";
      if (localAbs) {
        const localBytes = readFileSync(localAbs);
        if (!expectPdf || isCompletePdfBytes(localBytes)) {
          bytes = localBytes;
        } else if (!wayback) {
          throw new Error(
            `truncated PDF at localPath (${localBytes.byteLength} bytes, missing %%EOF): ${curatedRow.localPath}`,
          );
        }
        // Incomplete staging + waybackUrl → prefer network capture.
      } else if (curatedRow.localPath && !wayback) {
        throw new Error(`localPath missing: ${curatedRow.localPath}`);
      }
      if (!bytes) {
        const fetchUrl = wayback || url;
        bytes = await fetchBytes(fetchUrl, signal);
      }
      if (expectPdf && !isCompletePdfBytes(bytes)) {
        // Keep bytes for « Ouvrir » — thumbs may still recover via embeds.
        console.warn(
          `[documents] truncated PDF kept (${bytes.byteLength} bytes, no trailing %%EOF): ${relativePath}`,
        );
      }
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      if (
        !force &&
        existing?.sha256 === sha256 &&
        existing.relativePath &&
        existsSync(path.join(packDocumentsDir(packId), existing.relativePath))
      ) {
        const existingAbs = path.join(
          packDocumentsDir(packId),
          existing.relativePath,
        );
        if (!expectPdf || isCompletePdfBytes(readFileSync(existingAbs))) {
          result.skipped += 1;
          continue;
        }
      }
      mkdirSync(path.dirname(abs), { recursive: true });
      writeFileSync(abs, bytes);
      let thumbRelativePath: string | null = null;
      try {
        const { ensurePackDocumentThumb } = await import(
          "@/lib/admin/packDocumentThumbs"
        );
        thumbRelativePath = await ensurePackDocumentThumb({
          packId,
          relativePath,
        });
      } catch {
        /* preview is best-effort — PDF still counts as fetched */
      }
      const entry: PackDocumentEntry = {
        id: classified.id,
        title: classified.title,
        lang: classified.lang,
        kind: classified.kind,
        sourceUrl: url,
        fetchedAt: new Date().toISOString(),
        relativePath,
        thumbRelativePath,
        sha256,
        bytes: bytes.byteLength,
      };
      index = upsertPackDocumentEntry(index, entry);
      result.fetched += 1;
    } catch (error) {
      result.failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      result.errors.push(`${url}: ${message}`);
      const entry: PackDocumentEntry = {
        id: classified.id,
        title: classified.title,
        lang: classified.lang,
        kind: classified.kind,
        sourceUrl: url,
        fetchedAt: null,
        relativePath: existing?.relativePath ?? null,
        sha256: existing?.sha256 ?? null,
        bytes: existing?.bytes ?? null,
      };
      index = upsertPackDocumentEntry(index, entry);
    }
  }

  writePackDocumentsIndex(packId, index);
  return result;
}
