/**
 * TCG Live data-source helpers: CDN version/dir discovery + source matrix.
 *
 * Malie + APK/config catalogue union, then Rainier CDN for UnityFS.
 * Misses (Malie / CDN) logged under data/pokemon/logs/.
 */

import fs from "node:fs";
import path from "node:path";

import { httpGet } from "@/lib/http/httpClient";

import {
  DEFAULT_CONTENT_DIR,
  DEFAULT_UA,
  DEFAULT_VERSION,
  bundleUrl,
  catalogueSetnumsFromConfig,
  headBundle,
} from "./cdn";
import { fetchContentBase } from "./gameSettings";

export const UPDATER_NOTES_URL =
  "https://cdn.studio-prod.pokemon.com/rainier/updater/StandaloneOSX/ReleaseNotes/notes_en.json";

export const VERSION_RE = /Version\s+(\d+\.\d+\.\d+)\s*\((\d+)\)/i;

export const SOURCE_MATRIX = [
  {
    id: "catalogue",
    needs: "exact {set}_{lang}_{num} inventory (multi-lang)",
    source: "apk|malie",
    urlPattern:
      "config-cache card-database/compendium ∪ malie.io/tcgl/databases",
    update:
      "union APK/config stems + Malie DBs → scrape-inventory; Malie-miss logged then CDN",
  },
  {
    id: "cardBundles",
    needs: "MaterialManifest + card/mask textures (UnityFS)",
    source: "cdn",
    urlPattern: "{contentBase}{dir}/{set}_{lang}_{num}",
    update: "scrape Malie stems; skip existing; soft-ban aware",
  },
  {
    id: "shadersbundle",
    needs: "HoloFoil GLES3 + shared foil textures",
    source: "cdn",
    urlPattern: "{contentBase}{dir}/shadersbundle",
    update: "on ver/dir bump or hash change",
  },
  {
    id: "catalogueFallback",
    needs: "set+num when Malie unavailable",
    source: "config-cache",
    urlPattern: "ADB config-cache card-database-*",
    update: "ADB pull; then CDN scrape from setnums",
  },
  {
    id: "cdnVersion",
    needs: "{ver} path segment / GameSettings key",
    source: "cdn-public",
    urlPattern: UPDATER_NOTES_URL,
    update: "parse notes_en.json → then GameSettings/{ver}",
  },
  {
    id: "cdnContentBase",
    needs: "full Content/Android/{ver}/ root (host may migrate)",
    source: "cdn-public",
    urlPattern:
      "…/rainier/GameSettings/{ver}/GameSettings.json → android_contentpath",
    update: "resolve at scrape start; never hardcode CDN host long-term",
  },
  {
    id: "cdnContentDir",
    needs: "{dir} path segment",
    source: "config-cache|probe",
    urlPattern: "asset-bundle-manifest directories / HEAD probe",
    update:
      "prefer 10101_0000 (primary scrape); --probe-all-dirs for dated epochs",
  },
  {
    id: "cdnAssetManifest",
    needs: "exact asset names per locale×bucket",
    source: "cdn-public",
    urlPattern: "{contentBase}{bucket}/manifest_{locale}_{bucket}",
    update:
      "dump via unity/dump_cdn_manifest.py (UnityPy); intersect with Malie stems",
  },
  {
    id: "paperArt",
    needs: "physical card face under foil",
    source: "paper-catalogue",
    urlPattern: "paper catalogue provider (API)",
    update: "provider sync",
  },
  {
    id: "apk",
    needs: "schema reverse only",
    source: "apk",
    urlPattern: "Play / device APK",
    update: "only if CDN/Unity format breaks",
  },
] as const;

export type CdnTarget = {
  version: string;
  content_dir: string;
  /** Authoritative Rainier content root from GameSettings (trailing ``/``). */
  content_base: string;
  build: string | null;
  versionSource: string;
  dirSource: string;
  contentBaseSource: string;
};

async function fetchBytes(url: string, timeoutMs = 20_000): Promise<Buffer> {
  const res = await httpGet<ArrayBuffer>(url, {
    headers: { "User-Agent": DEFAULT_UA },
    timeout: timeoutMs,
    responseType: "arraybuffer",
    validateStatus: () => true,
  });
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`HTTP ${res.status} ${url}`);
  }
  return Buffer.from(res.data);
}

function walkStrings(obj: unknown): string[] {
  const out: string[] = [];
  const stack: unknown[] = [obj];
  while (stack.length) {
    const cur = stack.pop();
    if (typeof cur === "string") out.push(cur);
    else if (cur && typeof cur === "object") {
      if (Array.isArray(cur)) stack.push(...cur);
      else stack.push(...Object.values(cur as Record<string, unknown>));
    }
  }
  return out;
}

export function parseVersionFromNotesPayload(
  data: Record<string, unknown> | unknown[] | string,
): [string, string | null] {
  if (typeof data === "string") {
    const m = VERSION_RE.exec(data);
    if (m) return [m[1]!, m[2] ?? null];
    throw new Error(
      `cannot parse version from notes text: ${JSON.stringify(data.slice(0, 200))}`,
    );
  }
  for (const s of walkStrings(data)) {
    const m = VERSION_RE.exec(s);
    if (m) return [m[1]!, m[2] ?? null];
  }
  const m = VERSION_RE.exec(JSON.stringify(data));
  if (m) return [m[1]!, m[2] ?? null];
  throw new Error("cannot parse version from updater notes payload");
}

export async function discoverVersionFromUpdater(): Promise<
  [string, string | null]
> {
  const raw = await fetchBytes(UPDATER_NOTES_URL);
  const text = raw.toString("utf8");
  let data: Record<string, unknown> | unknown[] | string = text;
  try {
    data = JSON.parse(text) as Record<string, unknown> | unknown[];
  } catch {
    /* raw text notes */
  }
  return parseVersionFromNotesPayload(data);
}

export function contentDirsFromManifest(configCache: string): string[] {
  const filePath = path.join(configCache, "asset-bundle-manifest_0.0.json");
  if (!fs.existsSync(filePath)) return [];
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf8")) as {
      keys?: { manifest?: { contentString?: string } };
    };
    const cs = raw.keys?.manifest?.contentString;
    if (typeof cs !== "string") return [];
    const inner = JSON.parse(cs) as { directories?: unknown[] };
    return (inner.directories ?? []).map((d) => String(d));
  } catch {
    return [];
  }
}

export async function pickContentDir(opts: {
  version: string;
  configCache: string;
  probeName?: string;
  contentBase?: string;
}): Promise<[string, string]> {
  const probeName = opts.probeName ?? "xy8_fr_012";
  const dirs = contentDirsFromManifest(opts.configCache);
  const ordered: string[] = [];
  if (!ordered.includes(DEFAULT_CONTENT_DIR)) ordered.push(DEFAULT_CONTENT_DIR);
  for (const d of dirs) {
    if (!ordered.includes(d)) ordered.push(d);
  }
  for (const d of ordered) {
    const [st] = await headBundle(probeName, {
      version: opts.version,
      contentDir: d,
      contentBase: opts.contentBase,
    });
    if (st === 200) {
      const src =
        d === DEFAULT_CONTENT_DIR && !dirs.includes(d)
          ? "default+probe"
          : "manifest+probe";
      return [d, src];
    }
  }
  return [DEFAULT_CONTENT_DIR, "default-fallback"];
}

function pokemonConfigCacheDir(cacheRoot: string): string {
  return path.join(cacheRoot, "staging", "config-cache");
}

export async function resolveCdnTarget(cache: string): Promise<CdnTarget> {
  const configCache = pokemonConfigCacheDir(cache);
  let ver: string;
  let build: string | null;
  let verSrc: string;
  try {
    [ver, build] = await discoverVersionFromUpdater();
    verSrc = "updater-notes";
  } catch {
    ver = DEFAULT_VERSION;
    build = null;
    verSrc = "default-fallback";
  }
  const resolvedBase = await fetchContentBase({ version: ver });
  const [contentDir, dirSrc] = await pickContentDir({
    version: ver,
    configCache,
    contentBase: resolvedBase.contentBase,
  });
  return {
    version: ver,
    content_dir: contentDir,
    content_base: resolvedBase.contentBase,
    build,
    versionSource: verSrc,
    dirSource: dirSrc,
    contentBaseSource: resolvedBase.source,
  };
}

export async function writeSourcesReport(
  cache: string,
  out?: string,
): Promise<Record<string, unknown>> {
  const target = await resolveCdnTarget(cache);
  const configCache = pokemonConfigCacheDir(cache);
  const setnums =
    fs.existsSync(configCache) && fs.statSync(configCache).isDirectory()
      ? catalogueSetnumsFromConfig(configCache)
      : [];
  const report = {
    cdn: target,
    catalogueSetnums: setnums.length,
    sampleUrl: bundleUrl("xy8_fr_012", {
      version: target.version,
      contentDir: target.content_dir,
      contentBase: target.content_base,
    }),
    matrix: SOURCE_MATRIX,
    adbRequiredFor: ["config-cache refresh (until config API is known)"],
    apkRequiredFor: ["schema reverse if CDN/Unity layout changes"],
    cdnSufficientFor: [
      "card bundles",
      "shadersbundle",
      "named foil motif bundles (subset)",
    ],
  };
  const dest = out ?? path.join(cache, "sources-report.json");
  fs.writeFileSync(dest, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return report;
}
