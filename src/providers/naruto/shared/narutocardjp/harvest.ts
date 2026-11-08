/**
 * Harvest naruto-card.jp photo archives → staging ledgers + optional install.
 *
 * Archive HTML: FlareSolverr when plain GET is challenged (Vercel).
 * Media `/media/cards/*.jpg`: curl + stock FlareSolverr 429 / empty download —
 * prefetch via Chromium (`scripts/narutocardjpBrowserFetch.py`) then install
 * from local blobs.
 */
import "dotenv/config";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { flareSolverrRequestGet } from "@/lib/http/flareSolverr";
import { httpGet } from "@/lib/http/httpClient";
import { packStagingDir } from "@/lib/packPaths";
import {
  downloadCardFaceBytes,
  installCardFace,
} from "@/providers/shared/cardCatalogue/faceInstall";
import { probeLocalArtBasename } from "@/providers/shared/cardCatalogue/localCatalogueFace";

import {
  NARUTOCARDJP_ORIGIN,
  narutocardjpArchiveUrl,
  parseNarutocardjpArchiveHtml,
  type NarutocardjpFaceHit,
} from "./parse";

export const NARUTOCARDJP_SOURCE = "narutocardjp";

export type NarutocardjpLine =
  | "carddass-ja"
  | "shippuden"
  | "data-carddass";

const LINE_ARCHIVES: Record<
  NarutocardjpLine,
  Array<Parameters<typeof narutocardjpArchiveUrl>[0]>
> = {
  "carddass-ja": ["carddassJa"],
  shippuden: ["shippuden"],
  "data-carddass": ["dataNm", "dataNf", "dataNx"],
};

export function narutocardjpBlobDir(packId: string, line: NarutocardjpLine): string {
  return path.join(packStagingDir(packId), "narutocardjp", "blobs", line);
}

export function narutocardjpBlobPath(
  packId: string,
  line: NarutocardjpLine,
  imageUrl: string,
): string {
  const hash = createHash("sha1").update(imageUrl).digest("hex");
  return path.join(narutocardjpBlobDir(packId, line), `${hash}.jpg`);
}

/** Chromium prefetch for Vercel-gated media (requires system Chrome + playwright). */
export function prefetchNarutocardjpMediaViaBrowser(opts: {
  packId: string;
  line: NarutocardjpLine;
  limit?: number;
  force?: boolean;
}): { written: number; skipped: number; failed: number; ok: boolean } {
  const ledger = narutocardjpLedgerPath(opts.packId, opts.line);
  if (!existsSync(ledger)) {
    return { written: 0, skipped: 0, failed: 0, ok: false };
  }
  const outDir = narutocardjpBlobDir(opts.packId, opts.line);
  mkdirSync(outDir, { recursive: true });
  const script = path.join(
    process.cwd(),
    "scripts",
    "narutocardjpBrowserFetch.py",
  );
  const args = [
    script,
    "--ledger",
    ledger,
    "--out-dir",
    outDir,
    "--warmup",
    NARUTOCARDJP_ORIGIN + "/",
  ];
  if (opts.limit && opts.limit > 0) args.push("--limit", String(opts.limit));
  if (opts.force) args.push("--force");
  const result = spawnSync("python3", args, {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.stderr) process.stderr.write(result.stderr);
  const stdout = (result.stdout || "").trim();
  const lastLine = stdout.split("\n").filter(Boolean).at(-1) ?? "";
  try {
    const json = JSON.parse(lastLine) as {
      written?: number;
      skipped?: number;
      failed?: number;
      ok?: boolean;
    };
    return {
      written: json.written ?? 0,
      skipped: json.skipped ?? 0,
      failed: json.failed ?? 0,
      ok: json.ok !== false && (result.status ?? 1) === 0,
    };
  } catch {
    return {
      written: 0,
      skipped: 0,
      failed: 1,
      ok: false,
    };
  }
}

async function fetchHtml(url: string): Promise<string | null> {
  const flared = await flareSolverrRequestGet(url);
  if (flared && flared.length > 500) return flared;
  try {
    const res = await httpGet<string>(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
        Accept: "text/html,application/xhtml+xml",
        Referer: NARUTOCARDJP_ORIGIN + "/",
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

export function narutocardjpLedgerPath(
  packId: string,
  line: NarutocardjpLine,
): string {
  return path.join(
    packStagingDir(packId),
    "narutocardjp",
    `${line}.faces.json`,
  );
}

export async function harvestNarutocardjpFaces(opts: {
  packId: string;
  line: NarutocardjpLine;
  maxPages?: number;
}): Promise<{ hits: number; path: string }> {
  const archives = LINE_ARCHIVES[opts.line];
  const all: NarutocardjpFaceHit[] = [];
  const seen = new Set<string>();
  const maxPages = opts.maxPages ?? 40;

  for (const archive of archives) {
    for (let page = 1; page <= maxPages; page += 1) {
      const url = narutocardjpArchiveUrl(archive, page);
      const html = await fetchHtml(url);
      if (!html) break;
      const hits = parseNarutocardjpArchiveHtml(html);
      if (!hits.length && page > 1) break;
      for (const hit of hits) {
        const key = `${hit.printedRef}\0${hit.imageUrl}`;
        if (seen.has(key)) continue;
        seen.add(key);
        all.push(hit);
      }
      if (hits.length < 3 && page > 1) break;
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  const out = narutocardjpLedgerPath(opts.packId, opts.line);
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(
    out,
    `${JSON.stringify(
      {
        source: NARUTOCARDJP_ORIGIN,
        line: opts.line,
        observed: new Date().toISOString(),
        faces: all,
      },
      null,
      2,
    )}\n`,
  );
  return { hits: all.length, path: out };
}

export function loadNarutocardjpLedger(
  packId: string,
  line: NarutocardjpLine,
): NarutocardjpFaceHit[] {
  const p = narutocardjpLedgerPath(packId, line);
  if (!existsSync(p)) return [];
  try {
    const json = JSON.parse(readFileSync(p, "utf8")) as {
      faces?: NarutocardjpFaceHit[];
    };
    return json.faces ?? [];
  } catch {
    return [];
  }
}

export type InstallNarutocardjpOpts = {
  packId: string;
  line: NarutocardjpLine;
  /** Resolve hit → disk card dir (set/lang/card). */
  resolveDest: (hit: NarutocardjpFaceHit) => {
    set: string;
    lang: string;
    card: string;
    printKey: string;
  } | null;
  force?: boolean;
  /** Prefetch media via Chromium before install (default true). */
  prefetchBrowser?: boolean;
  writeAsset?: (row: {
    printKey: string;
    lang: string;
    art: string;
    sourceUrl: string;
  }) => void;
};

export async function installNarutocardjpFaces(
  opts: InstallNarutocardjpOpts,
): Promise<{ written: number; skipped: number; failed: number }> {
  const { packCardDir } = await import("@/lib/packPaths");
  const faces = loadNarutocardjpLedger(opts.packId, opts.line);
  let written = 0;
  let skipped = 0;
  let failed = 0;

  if (opts.prefetchBrowser !== false && faces.length > 0) {
    const pre = prefetchNarutocardjpMediaViaBrowser({
      packId: opts.packId,
      line: opts.line,
      force: opts.force,
    });
    console.log(
      `── naruto-card.jp browser prefetch (${opts.line}) — written=${pre.written} skipped=${pre.skipped} failed=${pre.failed}`,
    );
  }

  for (const hit of faces) {
    const dest = opts.resolveDest(hit);
    if (!dest) {
      skipped += 1;
      continue;
    }
    const destDir = packCardDir(opts.packId, {
      set: dest.set,
      lang: dest.lang,
      card: dest.card,
    });
    if (!opts.force && probeLocalArtBasename(destDir)) {
      skipped += 1;
      continue;
    }
    const blobPath = narutocardjpBlobPath(
      opts.packId,
      opts.line,
      hit.imageUrl,
    );
    const installed = await installCardFace({
      destDir,
      artName: `art.${NARUTOCARDJP_SOURCE}.webp`,
      url: hit.imageUrl,
      webpQuality: 85,
      referer: NARUTOCARDJP_ORIGIN + "/",
      force: opts.force,
      fetchImage: async (url) => {
        if (existsSync(blobPath)) {
          try {
            const buf = readFileSync(blobPath);
            if (buf.length >= 2_000) return buf;
          } catch {
            /* fall through */
          }
        }
        const direct = await downloadCardFaceBytes(url, {
          referer: NARUTOCARDJP_ORIGIN + "/",
          minBytes: 2_000,
          timeoutMs: 40_000,
        });
        if (direct) return direct;
        const { flareSolverrCookiesFor, flareSolverrDownloadImages } =
          await import("@/lib/http/flareSolverr");
        const { httpGet } = await import("@/lib/http/httpClient");
        const session = await flareSolverrCookiesFor(NARUTOCARDJP_ORIGIN + "/");
        if (session?.cookie) {
          try {
            const res = await httpGet<ArrayBuffer>(url, {
              responseType: "arraybuffer",
              timeout: 40_000,
              validateStatus: (s) => s === 200,
              headers: {
                Cookie: session.cookie,
                "User-Agent": session.userAgent,
                Referer: NARUTOCARDJP_ORIGIN + "/",
                Accept: "image/avif,image/webp,image/*,*/*;q=0.8",
              },
            });
            const buf = Buffer.from(res.data as ArrayBuffer);
            if (buf.length >= 2_000) return buf;
          } catch {
            /* fall through */
          }
        }
        const flared = await flareSolverrDownloadImages(
          NARUTOCARDJP_ORIGIN + "/",
          [url],
        );
        const buf = flared[0]?.buffer;
        return buf && buf.length >= 2_000 ? buf : null;
      },
    });
    if (!installed) {
      failed += 1;
      continue;
    }
    if (installed.downloaded) written += 1;
    else skipped += 1;
    opts.writeAsset?.({
      printKey: dest.printKey,
      lang: dest.lang,
      art: installed.art,
      sourceUrl: hit.imageUrl,
    });
  }

  return { written, skipped, failed };
}
