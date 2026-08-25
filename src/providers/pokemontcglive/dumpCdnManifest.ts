/**
 * Dump Rainier CDN ``manifest_<locale>_<bucket>`` UnityFS → JSON.
 * Node port of ``unity/dump_cdn_manifest.py`` (ADR-021 phase A).
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

import { httpGet } from "@/lib/http/httpClient";
import { parseAssetManifestEntries } from "@/lib/unity/assetManifest";
import type { CdnManifestDump, ManifestAssetEntry } from "./cdnManifest";
import { DEFAULT_UA } from "./cdn";
import { normalizeContentBase } from "./gameSettings";

export function manifestUrl(
  contentBase: string,
  bucket: string,
  locale: string,
): string {
  const base = normalizeContentBase(contentBase);
  return `${base}${bucket}/manifest_${locale}_${bucket}`;
}

export function resolveBuckets(
  bucketsArg: string | undefined,
  fallback: string,
  dirsManifest: string | undefined,
): string[] {
  if (!bucketsArg) return [fallback];
  if (bucketsArg.trim().toLowerCase() !== "all") {
    return bucketsArg
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (!dirsManifest) {
    throw new Error("--buckets all requires --dirs-manifest");
  }
  if (!existsSync(dirsManifest)) {
    throw new Error(
      `--dirs-manifest not found: ${dirsManifest} (expected staging/config-cache/asset-bundle-manifest_0.0.json)`,
    );
  }
  const raw = JSON.parse(readFileSync(dirsManifest, "utf8")) as {
    keys?: { manifest?: { contentString?: string } };
  };
  const inner = JSON.parse(
    raw.keys?.manifest?.contentString ?? "{}",
  ) as { directories?: unknown[] };
  const dirs = (inner.directories ?? []).map(String);
  return dirs.length ? dirs : [fallback];
}

async function fetchBytes(
  url: string,
  timeoutMs: number,
): Promise<Uint8Array> {
  const res = await httpGet<ArrayBuffer>(url, {
    responseType: "arraybuffer",
    timeout: timeoutMs,
    headers: { "User-Agent": DEFAULT_UA },
    noDedup: true,
  });
  return new Uint8Array(res.data);
}

export type DumpCdnManifestOpts = {
  contentBase: string;
  bucket?: string;
  locale?: string;
  buckets?: string;
  locales?: string;
  out?: string;
  outDir?: string;
  dirsManifest?: string;
  skipExisting?: boolean;
  timeoutMs?: number;
};

export type DumpCdnManifestResult = {
  ok: boolean;
  buckets: number;
  locales: number;
  written: number;
  failed: { bucket: string; locale: string; error: string }[];
  assetRows: number;
};

export async function dumpCdnManifests(
  opts: DumpCdnManifestOpts,
): Promise<DumpCdnManifestResult> {
  if (!opts.out && !opts.outDir) {
    throw new Error("one of out / outDir is required");
  }
  const contentBase = normalizeContentBase(opts.contentBase);
  const buckets = resolveBuckets(
    opts.buckets,
    opts.bucket ?? "10101_0000",
    opts.dirsManifest,
  );
  const locales = opts.locales
    ? opts.locales
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [opts.locale ?? "fr"];
  const single = Boolean(opts.out) && buckets.length === 1 && locales.length === 1;
  const timeoutMs = opts.timeoutMs ?? 60_000;

  const written: string[] = [];
  const failed: DumpCdnManifestResult["failed"] = [];
  let total = 0;

  for (const bucket of buckets) {
    for (const locale of locales) {
      const outPath = single
        ? (opts.out as string)
        : path.join(opts.outDir as string, `manifest_${locale}_${bucket}.json`);
      if (opts.skipExisting && existsSync(outPath)) continue;
      const url = manifestUrl(contentBase, bucket, locale);
      let data: Uint8Array;
      try {
        data = await fetchBytes(url, timeoutMs);
      } catch (err) {
        failed.push({
          bucket,
          locale,
          error: err instanceof Error ? err.message : String(err),
        });
        continue;
      }
      if (
        data.length < 7 ||
        String.fromCharCode(...data.subarray(0, 7)) !== "UnityFS"
      ) {
        failed.push({ bucket, locale, error: "not-unityfs" });
        continue;
      }
      const entries = parseAssetManifestEntries(data);
      const dump: CdnManifestDump = {
        contentBase,
        bucket,
        locale,
        assetCount: entries.length,
        assets: entries.map((e) => e.name),
        entries: entries.map(
          (e): ManifestAssetEntry => ({
            name: e.name,
            crc: e.crc,
            hash: e.hash,
            dependencies: e.dependencies,
          }),
        ),
        source: url,
      };
      mkdirSync(path.dirname(outPath), { recursive: true });
      writeFileSync(outPath, `${JSON.stringify(dump, null, 2)}\n`, "utf8");
      written.push(outPath);
      total += entries.length;
      console.log(`  [ok] ${locale}/${bucket} assets=${entries.length}`);
    }
  }

  return {
    ok: failed.length === 0 || written.length > 0,
    buckets: buckets.length,
    locales: locales.length,
    written: written.length,
    failed,
    assetRows: total,
  };
}
