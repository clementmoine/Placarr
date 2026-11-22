/**
 * Xsolla GUS update manifest for Fusion World Digital (project 254594).
 * @see docs/fusion_world_digital.md
 */
import { httpGet } from "@/lib/http/httpClient";

export const DBS_FW_GUS_PROJECT_ID = "254594";
export const DBS_FW_GUS_URL =
  `https://gus.xsolla.com/updates?project_id=${DBS_FW_GUS_PROJECT_ID}` +
  `&region=&gds_version=1&platform=mac_os&stage&no_redistr=false`;

/** Primary CDN origin baked into LauncherElectron. */
export const DBS_FW_CDN_ORIGIN = "https://gamebuild.launcher.xsolla.com";
/** Compiled fallback origin. */
export const DBS_FW_CDN_ORIGIN_FALLBACK =
  "https://launcher-gamebuild-cdn.xsolla.com";

export type GusVolume = {
  /** Relative path under the CDN origin (alt_data_link). */
  relativePath: string;
  /** Absolute download URL. */
  url: string;
  /** Declared size in bytes (alt data_size). */
  bytes: number;
  /** Basename e.g. `full_game_….7z.001`. */
  fileName: string;
};

export type GusManifest = {
  version: string;
  buildId: string;
  stem: string;
  extractedSize: number;
  volumes: GusVolume[];
  /** First volume (pass this to 7za for multi-volume extract). */
  firstVolume: GusVolume;
};

function attr(tag: string, name: string): string | null {
  const re = new RegExp(`\\b${name}="([^"]*)"`, "i");
  return re.exec(tag)?.[1] ?? null;
}

/**
 * Parse a GUS `<actions>` XML body into downloadable multi-volume 7z parts.
 */
export function parseGusManifestXml(
  xml: string,
  cdnOrigin: string = DBS_FW_CDN_ORIGIN,
): GusManifest {
  const version =
    /<action\b[^>]*\btype="version"[^>]*\bversion="(\d+)"/i.exec(xml)?.[1] ??
    /<action\b[^>]*\bversion="(\d+)"[^>]*\btype="version"/i.exec(xml)?.[1];
  if (!version) throw new Error("GUS manifest: missing version action");

  const extractedSize = Number(
    /<action\b[^>]*\btype="extracted_size"[^>]*\bdata_size="(\d+)"/i.exec(
      xml,
    )?.[1] ??
      /<action\b[^>]*\bdata_size="(\d+)"[^>]*\btype="extracted_size"/i.exec(
        xml,
      )?.[1] ??
      0,
  );

  const origin = cdnOrigin.replace(/\/$/, "");
  const volumes: GusVolume[] = [];
  for (const tag of xml.match(/<action\b[^>]*\/>|<action\b[^>]*>/gi) ?? []) {
    if (!/\btype="torrent_download"/i.test(tag)) continue;
    const relativePath = attr(tag, "alt_data_link");
    if (!relativePath) continue;
    const bytes = Number(attr(tag, "data_size") ?? 0);
    const fileName = relativePath.split("/").pop() ?? relativePath;
    volumes.push({
      relativePath,
      url: `${origin}/${relativePath}`,
      bytes,
      fileName,
    });
  }
  if (volumes.length === 0) {
    throw new Error("GUS manifest: no torrent_download volumes");
  }

  // Extract order is often .009→.001 in the XML; sort by volume index.
  volumes.sort((a, b) => a.fileName.localeCompare(b.fileName));

  const first =
    volumes.find((v) => /\.7z\.001$/i.test(v.fileName)) ?? volumes[0]!;
  const buildId = first.relativePath.split("/")[0] ?? "";
  const stemMatch = /^(full_game_[0-9a-f]+_)\.7z\.\d+$/i.exec(first.fileName);
  const stem = stemMatch?.[1] ?? first.fileName.replace(/\.7z\.\d+$/i, "");

  return {
    version,
    buildId,
    stem,
    extractedSize,
    volumes,
    firstVolume: first,
  };
}

export async function fetchGusManifest(
  opts: { url?: string; cdnOrigin?: string } = {},
): Promise<GusManifest> {
  const url = opts.url ?? DBS_FW_GUS_URL;
  // lib/http : rejeu des erreurs transitoires + circuit par host (ADR-008/024).
  const res = await httpGet<string>(url, {
    responseType: "text",
    headers: { accept: "application/xml,text/xml,*/*" },
    noDedup: true,
  });
  return parseGusManifestXml(String(res.data), opts.cdnOrigin);
}
