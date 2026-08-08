/**
 * Durable foil extract log under ``data/<pack>/logs/foil-extract.log``.
 * Worker appends lines; admin UI polls via ``/api/admin/foil-logs``.
 */
import fs from "node:fs";
import path from "node:path";

import { foilPackDataDir } from "@/lib/runtimeData";
import type { FoilExtractTarget } from "@/lib/admin/foilExtractRunner";

export const FOIL_EXTRACT_LOG_NAME = "foil-extract.log";
/** Cap retained file size so a multi-hour scrape cannot fill the disk. */
const MAX_LOG_BYTES = 4 * 1024 * 1024;

export function foilExtractLogPath(pack: FoilExtractTarget): string {
  return path.join(foilPackDataDir(pack), "logs", FOIL_EXTRACT_LOG_NAME);
}

export async function beginFoilExtractLog(
  pack: FoilExtractTarget,
  headerLines: readonly string[] = [],
): Promise<string> {
  const filePath = foilExtractLogPath(pack);
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  const stamp = new Date().toISOString();
  const body = [
    `── foil extract ${pack} @ ${stamp}`,
    ...headerLines,
    "",
  ].join("\n");
  await fs.promises.writeFile(filePath, `${body}\n`, "utf8");
  return filePath;
}

export async function appendFoilExtractLog(
  pack: FoilExtractTarget,
  line: string,
): Promise<void> {
  const filePath = foilExtractLogPath(pack);
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  const text = line.endsWith("\n") ? line : `${line}\n`;
  await fs.promises.appendFile(filePath, text, "utf8");
  try {
    const stat = await fs.promises.stat(filePath);
    if (stat.size > MAX_LOG_BYTES) {
      // Keep the tail — live viewers care about recent progress.
      const handle = await fs.promises.open(filePath, "r");
      try {
        const keep = Math.floor(MAX_LOG_BYTES / 2);
        const start = Math.max(0, stat.size - keep);
        const buf = Buffer.alloc(stat.size - start);
        await handle.read(buf, 0, buf.length, start);
        await fs.promises.writeFile(filePath, buf);
      } finally {
        await handle.close();
      }
    }
  } catch {
    /* best-effort trim */
  }
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

const LAUNCH_HEADER_RE =
  /^── foil extract \S+ @ (\d{4}-\d{2}-\d{2}T[^\s]+)/m;

async function readLaunchStamp(filePath: string): Promise<string | null> {
  try {
    const handle = await fs.promises.open(filePath, "r");
    try {
      const buf = Buffer.alloc(256);
      const { bytesRead } = await handle.read(buf, 0, buf.length, 0);
      if (bytesRead <= 0) return null;
      const head = buf.subarray(0, bytesRead).toString("utf8");
      const match = LAUNCH_HEADER_RE.exec(head);
      return match?.[1] ?? null;
    } finally {
      await handle.close();
    }
  } catch {
    return null;
  }
}

/**
 * Read log bytes from ``after`` (inclusive) up to ``maxBytes``.
 * Truncation at a non-UTF8 boundary is avoided by decoding from a line start.
 */
export async function readFoilExtractLog(
  pack: FoilExtractTarget,
  options: { after?: number; maxBytes?: number } = {},
): Promise<FoilExtractLogSlice> {
  const filePath = foilExtractLogPath(pack);
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
