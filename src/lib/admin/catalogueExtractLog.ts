/**
 * Durable foil extract log under ``data/<pack>/logs/foil-extract.log``.
 * Worker appends lines; admin UI polls via ``/api/admin/catalogue-logs``.
 */
import fs from "node:fs";
import path from "node:path";

import { foilPackDataDir } from "@/lib/runtimeData";
import { cataloguePackForExtractTarget } from "@/lib/admin/cataloguePacks";
import type { CatalogueExtractTarget } from "@/lib/admin/catalogueExtractRunner";

export const CATALOGUE_EXTRACT_LOG_NAME = "foil-extract.log";
/** Cap retained file size so a multi-hour scrape cannot fill the disk. */
const MAX_LOG_BYTES = 4 * 1024 * 1024;

/** Extract UI target → on-disk data pack (franchise line nest). */
function foilExtractDataPack(pack: CatalogueExtractTarget): string {
  return cataloguePackForExtractTarget(pack)?.id ?? pack;
}

export function catalogueExtractLogPath(pack: CatalogueExtractTarget): string {
  return path.join(
    foilPackDataDir(foilExtractDataPack(pack)),
    "logs",
    CATALOGUE_EXTRACT_LOG_NAME,
  );
}

export async function beginCatalogueExtractLog(
  pack: CatalogueExtractTarget,
  headerLines: readonly string[] = [],
): Promise<string> {
  const filePath = catalogueExtractLogPath(pack);
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  const stamp = new Date().toISOString();
  const body = [`── foil extract ${pack} @ ${stamp}`, ...headerLines, ""].join(
    "\n",
  );
  await fs.promises.writeFile(filePath, `${body}\n`, "utf8");
  return filePath;
}

/**
 * Sync append so CPU-bound extract phases (Malie reparse, manifest load) still
 * update the admin log / heartbeat while the event loop is starved. Async
 * ``appendFile`` chains were silently lagging behind wall-clock progress.
 */
export function appendCatalogueExtractLogSync(
  pack: CatalogueExtractTarget,
  line: string,
): void {
  const filePath = catalogueExtractLogPath(pack);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const text = line.endsWith("\n") ? line : `${line}\n`;
  fs.appendFileSync(filePath, text, "utf8");
  try {
    const stat = fs.statSync(filePath);
    if (stat.size > MAX_LOG_BYTES) {
      const keep = Math.floor(MAX_LOG_BYTES / 2);
      const start = Math.max(0, stat.size - keep);
      const fd = fs.openSync(filePath, "r");
      try {
        const buf = Buffer.alloc(stat.size - start);
        fs.readSync(fd, buf, 0, buf.length, start);
        fs.writeFileSync(filePath, buf);
      } finally {
        fs.closeSync(fd);
      }
    }
  } catch {
    /* best-effort trim */
  }
}

export async function appendCatalogueExtractLog(
  pack: CatalogueExtractTarget,
  line: string,
): Promise<void> {
  appendCatalogueExtractLogSync(pack, line);
}

export type FoilExtractLogSlice = {
  exists: boolean;
  size: number;
  /** Last byte written (append / begin). */
  mtime: string | null;
  /** Stamp from the ``── foil extract … @ ISO`` header, when present. */
  launchedAt: string | null;
  /** Byte offset to pass as `after` on the next poll. */
  nextOffset: number;
  text: string;
};

const LAUNCH_HEADER_RE = /^── foil extract \S+ @ (\d{4}-\d{2}-\d{2}T[^\s]+)/m;
const JOB_ID_RE = /^jobId=([^\s]+)/m;

async function readLogHead(filePath: string): Promise<string> {
  try {
    const handle = await fs.promises.open(filePath, "r");
    try {
      const buf = Buffer.alloc(512);
      const { bytesRead } = await handle.read(buf, 0, buf.length, 0);
      if (bytesRead <= 0) return "";
      return buf.subarray(0, bytesRead).toString("utf8");
    } finally {
      await handle.close();
    }
  } catch {
    return "";
  }
}

async function readLaunchStamp(filePath: string): Promise<string | null> {
  const head = await readLogHead(filePath);
  const match = LAUNCH_HEADER_RE.exec(head);
  return match?.[1] ?? null;
}

/** jobId line written by admin enqueue / worker logHeader. */
export async function readFoilExtractJobId(
  pack: CatalogueExtractTarget,
): Promise<string | null> {
  const head = await readLogHead(catalogueExtractLogPath(pack));
  const match = JOB_ID_RE.exec(head);
  return match?.[1] ?? null;
}

/**
 * Read log bytes from ``after`` (inclusive) up to ``maxBytes``.
 * Truncation at a non-UTF8 boundary is avoided by decoding from a line start.
 */
export async function readCatalogueExtractLog(
  pack: CatalogueExtractTarget,
  options: { after?: number; maxBytes?: number } = {},
): Promise<FoilExtractLogSlice> {
  const filePath = catalogueExtractLogPath(pack);
  const after = Math.max(0, options.after ?? 0);
  const maxBytes = Math.min(
    Math.max(1_024, options.maxBytes ?? 256 * 1024),
    MAX_LOG_BYTES,
  );

  try {
    const stat = await fs.promises.stat(filePath);
    if (!stat.isFile()) {
      return {
        exists: false,
        size: 0,
        mtime: null,
        launchedAt: null,
        nextOffset: 0,
        text: "",
      };
    }
    const launchedAt = await readLaunchStamp(filePath);
    if (after >= stat.size) {
      return {
        exists: true,
        size: stat.size,
        mtime: stat.mtime.toISOString(),
        launchedAt,
        nextOffset: stat.size,
        text: "",
      };
    }
    const length = Math.min(stat.size - after, maxBytes);
    const handle = await fs.promises.open(filePath, "r");
    try {
      const buf = Buffer.alloc(length);
      await handle.read(buf, 0, length, after);
      let text = buf.toString("utf8");
      // If we started mid-file (after=0 but reading a capped tail), drop partial first line.
      if (after === 0 && length < stat.size) {
        const nl = text.indexOf("\n");
        if (nl >= 0) text = text.slice(nl + 1);
      }
      return {
        exists: true,
        size: stat.size,
        mtime: stat.mtime.toISOString(),
        launchedAt,
        nextOffset: after + length,
        text,
      };
    } finally {
      await handle.close();
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
      return {
        exists: false,
        size: 0,
        mtime: null,
        launchedAt: null,
        nextOffset: 0,
        text: "",
      };
    }
    throw error;
  }
}
