/**
 * Kit foil « web » partagé : textures référencées par du CSS public
 * (visualiseur officiel Lorcana, dépôts CSS de cartes Pokémon…) téléchargées
 * sous un nom stable, avec rejeu, transformation optionnelle (WebP) et un
 * registre de provenance (une URL par fichier). Chaque pack ne garde que ce
 * qui lui est propre : où lire le CSS et quels fichiers retenir.
 */
import fs from "node:fs";
import path from "node:path";

import { httpGet } from "@/lib/http/httpClient";
import { retry } from "@/lib/http/retry";

export type WebFoilAsset = { name: string; url: string };

/** GET d'un asset avec rejeu ; `noDedup` pour qu'un échec ne soit pas partagé. */
export async function fetchWebAssetBytes(
  url: string,
  opts: { userAgent?: string; attempts?: number; backoffMs?: number } = {},
): Promise<Buffer> {
  return retry(
    async () => {
      const res = await httpGet<ArrayBuffer>(url, {
        headers: {
          ...(opts.userAgent ? { "User-Agent": opts.userAgent } : {}),
          // Certains CDN coupent le keep-alive (ECONNRESET).
          Connection: "close",
        },
        timeout: 45_000,
        responseType: "arraybuffer",
        noDedup: true,
      });
      if (!res.data || (res.data as ArrayBuffer).byteLength < 16) {
        throw new Error(`empty response from ${url}`);
      }
      return Buffer.from(res.data);
    },
    opts.attempts ?? 4,
    opts.backoffMs ?? 800,
  );
}

export async function downloadWebFoilAssets(
  entries: readonly WebFoilAsset[],
  destDir: string,
  opts: {
    fetchBytes?: (url: string) => Promise<Buffer>;
    transform?: (bytes: Buffer, entry: WebFoilAsset) => Promise<Buffer>;
    log?: (line: string) => void;
  } = {},
): Promise<{
  written: string[];
  failed: string[];
  sources: Record<string, string>;
}> {
  const fetchBytes =
    opts.fetchBytes ?? ((url: string) => fetchWebAssetBytes(url));
  const log = opts.log ?? ((line: string) => console.log(line));
  fs.mkdirSync(destDir, { recursive: true });
  const written: string[] = [];
  const failed: string[] = [];
  const sources: Record<string, string> = {};
  for (const entry of entries) {
    try {
      const raw = await fetchBytes(entry.url);
      const bytes = opts.transform ? await opts.transform(raw, entry) : raw;
      fs.writeFileSync(path.join(destDir, entry.name), bytes);
      written.push(entry.name);
      sources[entry.name] = entry.url;
      log(`  ${entry.name} ← ${entry.url}`);
    } catch (error) {
      failed.push(entry.name);
      log(`  ATTENTION fetch ${entry.url}: ${error}`);
    }
  }
  return { written, failed, sources };
}

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, sortDeep(v)]),
    );
  }
  return value;
}

/** Registre de provenance trié (diffs stables) sous `logs/`. */
export function writeWebFoilSourceLedger(
  logsDir: string,
  fileName: string,
  payload: Record<string, unknown>,
): void {
  fs.mkdirSync(logsDir, { recursive: true });
  fs.writeFileSync(
    path.join(logsDir, fileName),
    `${JSON.stringify(sortDeep(payload), null, 2)}\n`,
    "utf8",
  );
}
