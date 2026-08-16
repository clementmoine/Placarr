/**
 * Rebuild `data/naruto/ccg/logs/apache-index.json` from Wayback Apache Index-of
 * HTML under `data/naruto/ccg/staging/carddass-fr/pages/`.
 *
 * Prefer autoindex pages over CDX: they list files that existed on the server
 * even when Wayback never captured the JPEG itself. Regenerable → `data/`, not
 * `curated/`.
 *
 *   pnpm naruto:cards -- --only sources
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { dataRoot } from "@/lib/runtimeData";

import { NARUTO_PACK_ID } from "./indexStore";

const INDEX_TITLE_RE =
  /<title>\s*Index of\s+(\/naruto\/images(?:\/[^<\s]*)?)\s*<\/title>/i;
const HREF_FILE_RE = /href="([^"?#]+\.(?:jpe?g|gif|png|pdf|webp))"/gi;

export type ApacheIndexDirectory = {
  timestamp?: string;
  files: string[];
};

export type ApacheIndexDoc = {
  source: string;
  note: string;
  generatedAt: string;
  directories: Record<string, ApacheIndexDirectory>;
};

function pagesDir(): string {
  return path.join(
    dataRoot(),
    NARUTO_PACK_ID,
    "staging",
    "carddass-fr",
    "pages",
  );
}

/** Derived ledger — regenerable, lives under pack logs (not curated). */
export function apacheIndexPath(): string {
  return path.join(dataRoot(), NARUTO_PACK_ID, "logs", "apache-index.json");
}

function normalizeDir(raw: string): string {
  let dir = decodeURIComponent(raw.trim());
  if (!dir.startsWith("/")) dir = `/${dir}`;
  if (!dir.endsWith("/")) dir = `${dir}/`;
  return dir;
}

function decodeHrefName(href: string): string | null {
  const cleaned = href.trim();
  if (!cleaned || cleaned.startsWith("?") || cleaned.startsWith("/")) {
    // Absolute site paths are parent/dir links — skip; files are relative.
    if (cleaned.startsWith("/")) return null;
  }
  try {
    return decodeURIComponent(cleaned);
  } catch {
    return cleaned;
  }
}

/** Parse one Index-of HTML body → directory key + file basenames. */
export function parseApacheIndexHtml(html: string): {
  dir: string;
  files: string[];
} | null {
  const title = INDEX_TITLE_RE.exec(html);
  if (!title?.[1]) return null;
  const dir = normalizeDir(title[1]);
  const files = new Set<string>();
  for (const match of html.matchAll(HREF_FILE_RE)) {
    const name = decodeHrefName(match[1] ?? "");
    if (!name) continue;
    // Skip lock / junk siblings; keep .LCK out of attestation.
    if (/\.lck$/i.test(name)) continue;
    const base = path.posix.basename(name);
    if (base && base !== name && name.includes("/")) continue;
    files.add(base);
  }
  return { dir, files: [...files].sort((a, b) => a.localeCompare(b, "en")) };
}

function walkHtmlFiles(root: string): string[] {
  if (!existsSync(root)) return [];
  const out: string[] = [];
  const stack = [root];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const name of readdirSync(cur)) {
      if (name.startsWith(".")) continue;
      const full = path.join(cur, name);
      let st;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) stack.push(full);
      else if (/\.html?$/i.test(name)) out.push(full);
    }
  }
  return out;
}

function cdxTimestampsByDir(): Map<string, string> {
  const cdxPath = path.join(
    dataRoot(),
    NARUTO_PACK_ID,
    "staging",
    "carddass-fr",
    "cdx.json",
  );
  const map = new Map<string, string>();
  if (!existsSync(cdxPath)) return map;
  try {
    const rows = JSON.parse(readFileSync(cdxPath, "utf8")) as unknown;
    if (!Array.isArray(rows)) return map;
    for (const row of rows) {
      if (!Array.isArray(row) || row.length < 3) continue;
      const timestamp = String(row[1] ?? "");
      const original = String(row[2] ?? "");
      if (!/^\d{14}$/.test(timestamp)) continue;
      let pathname = "";
      try {
        pathname = new URL(original).pathname;
      } catch {
        continue;
      }
      if (!pathname.includes("/naruto/images")) continue;
      // Directory listing captures end with / or lack a file extension.
      const isDir =
        pathname.endsWith("/") || !path.posix.basename(pathname).includes(".");
      if (!isDir) continue;
      const dir = normalizeDir(pathname);
      const prev = map.get(dir);
      if (!prev || timestamp > prev) map.set(dir, timestamp);
    }
  } catch {
    return map;
  }
  return map;
}

export function buildApacheIndexFromStaging(): ApacheIndexDoc {
  const directories: Record<string, ApacheIndexDirectory> = {};
  const stamps = cdxTimestampsByDir();

  for (const file of walkHtmlFiles(pagesDir())) {
    const html = readFileSync(file, "utf8");
    const parsed = parseApacheIndexHtml(html);
    if (!parsed) continue;
    const existing = directories[parsed.dir];
    if (!existing || parsed.files.length >= existing.files.length) {
      directories[parsed.dir] = {
        ...(stamps.get(parsed.dir)
          ? { timestamp: stamps.get(parsed.dir) }
          : existing?.timestamp
            ? { timestamp: existing.timestamp }
            : {}),
        files: parsed.files,
      };
    }
  }

  return {
    source: "Apache autoindex of carddass.fr /naruto/images/ (Wayback)",
    note: "Authoritative list of files that EXISTED on the server, including files Wayback never downloaded. Regenerated from staging/carddass-fr/pages Index-of HTML.",
    generatedAt: new Date().toISOString(),
    directories,
  };
}

export function writeApacheIndexSource(opts?: { dryRun?: boolean }): {
  path: string;
  directories: number;
  files: number;
  dryRun: boolean;
} {
  const doc = buildApacheIndexFromStaging();
  const dest = apacheIndexPath();
  const files = Object.values(doc.directories).reduce(
    (n, d) => n + d.files.length,
    0,
  );
  if (!opts?.dryRun) {
    mkdirSync(path.dirname(dest), { recursive: true });
    writeFileSync(dest, `${JSON.stringify(doc, null, 1)}\n`, "utf8");
  }
  return {
    path: dest,
    directories: Object.keys(doc.directories).length,
    files,
    dryRun: Boolean(opts?.dryRun),
  };
}

export function runNarutoSourcesCli(opts?: { dryRun?: boolean }): void {
  console.log(`── Naruto derived sources${opts?.dryRun ? " (dry run)" : ""}`);
  const result = writeApacheIndexSource(opts);
  console.log(
    `   apache-index.json  ${result.directories} dirs / ${result.files} files` +
      `${opts?.dryRun ? "" : ` → ${result.path}`}`,
  );
  console.log(
    "   (curated ledgers: checklist / names / sets / coleka — not automated)",
  );
}
