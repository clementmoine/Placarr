/**
 * Targeted Wayback harvest for official 巻ノ壱 face GIFs (`*_1.gif`).
 * Fills nikita holes (e.g. N-003) when CDX retained the asset body.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { dataRoot } from "@/lib/runtimeData";
import { httpGet } from "@/lib/http/httpClient";

import {
  CARDDAS_JP_VOL1_WAYBACK_TIMESTAMPS,
  carddasJpVol1FaceOriginalUrls,
  carddasJpVol1FaceTargets,
  waybackImageUrl,
} from "../carddasVol1Face";
import { extFromMagic } from "../narutoFaceBytes";
import { NARUTO_PACK_ID } from "../packs";
import { downloadRaw } from "../scrape/scrapeCards";
import { NARUTO_STAGING_CARDDAS_JP } from "../scrape/scrapeCarddasJp";
import {
  fetchCdxRows,
  stagingRelFromUrl,
  WAYBACK_UA,
} from "../waybackSiteMirror";

const DEFAULT_DELAY_MS = 250;

export type HarvestCarddasVol1FacesOptions = {
  force?: boolean;
  root?: string;
  delayMs?: number;
  limit?: number;
};

function packRoot(dataDir?: string): string {
  return path.join(dataDir ?? dataRoot(), NARUTO_PACK_ID);
}

function stagingDest(stagingDir: string, original: string): string | null {
  const rel = stagingRelFromUrl(original, {
    stripPathPrefix: "/naruto/",
    includeHost: true,
  });
  if (!rel) return null;
  const host = rel.split("/")[0] ?? "www.carddas.com";
  const rest = rel.slice(host.length + 1);
  const withNaruto = rest.startsWith("naruto/")
    ? rel
    : path.posix.join(host, "naruto", rest);
  return path.join(stagingDir, withNaruto.toLowerCase());
}

async function cdxTimestamp(original: string): Promise<string | null> {
  const encoded = encodeURIComponent(original);
  const url = `https://web.archive.org/cdx/search/cdx?url=${encoded}&output=json&fl=timestamp,statuscode&filter=statuscode:200&limit=1`;
  try {
    const response = await httpGet<string[][]>(url, {
      headers: { "user-agent": WAYBACK_UA },
      validateStatus: () => true,
    });
    if (response.status < 200 || response.status >= 300) return null;
    const raw = response.data;
    const row = raw[1];
    return row?.[0] ?? null;
  } catch {
    return null;
  }
}

async function tryDownload(
  dest: string,
  original: string,
  force: boolean,
): Promise<"ok" | "skip" | "fail"> {
  if (!force && existsSync(dest)) {
    const buf = readFileSync(dest);
    if (extFromMagic(buf) === ".gif") return "skip";
  }
  const ts = await cdxTimestamp(original);
  const timestamps = ts
    ? [ts, ...CARDDAS_JP_VOL1_WAYBACK_TIMESTAMPS.filter((t) => t !== ts)]
    : [...CARDDAS_JP_VOL1_WAYBACK_TIMESTAMPS];
  for (const candidate of timestamps) {
    const url = waybackImageUrl(candidate, original);
    const result = await downloadRaw(url, dest, false);
    if (result === "fail") continue;
    const buf = readFileSync(dest);
    if (extFromMagic(buf) !== ".gif") {
      try {
        unlinkSync(dest);
      } catch {
        /* ignore */
      }
      continue;
    }
    return result;
  }
  return "fail";
}

export async function harvestCarddasVol1Faces(
  opts: HarvestCarddasVol1FacesOptions = {},
): Promise<{
  listed: number;
  downloaded: number;
  skipped: number;
  failed: number;
}> {
  const root = packRoot(opts.root);
  const stagingDir = path.join(root, NARUTO_STAGING_CARDDAS_JP);
  mkdirSync(stagingDir, { recursive: true });
  const force = opts.force === true;
  const delayMs = opts.delayMs ?? DEFAULT_DELAY_MS;
  let targets = carddasJpVol1FaceTargets();
  if (opts.limit && opts.limit > 0) targets = targets.slice(0, opts.limit);

  console.log(
    `── JA carddas 巻ノ壱 *_1.gif → ${NARUTO_STAGING_CARDDAS_JP}/ (${targets.length} stems)`,
  );

  let downloaded = 0;
  let skipped = 0;
  let failed = 0;
  const log: Array<{ stem: string; number: string; result: string }> = [];

  for (const target of targets) {
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
    const originals = carddasJpVol1FaceOriginalUrls(target.stem);
    let result: "ok" | "skip" | "fail" = "fail";
    for (const original of originals) {
      const dest = stagingDest(stagingDir, original);
      if (!dest) continue;
      result = await tryDownload(dest, original, force);
      if (result !== "fail") break;
    }
    if (result === "ok") downloaded += 1;
    else if (result === "skip") skipped += 1;
    else failed += 1;
    log.push({ stem: target.stem, number: target.number, result });
    if (result === "fail") {
      console.log(`JA vol1 ${target.stem} (${target.number}) FAIL`);
    }
  }

  writeFileSync(
    path.join(stagingDir, "vol1-harvest.json"),
    `${JSON.stringify(
      {
        at: new Date().toISOString(),
        listed: targets.length,
        downloaded,
        skipped,
        failed,
        log,
      },
      null,
      2,
    )}\n`,
  );

  console.log(
    JSON.stringify({
      carddasVol1Harvest: true,
      listed: targets.length,
      downloaded,
      skipped,
      failed,
    }),
  );
  return { listed: targets.length, downloaded, skipped, failed };
}

/** Optional bulk CDX sweep for any retained `*_1.gif` under card_img. */
export async function sweepCarddasVol1Cdx(): Promise<number> {
  const url =
    "https://web.archive.org/cdx/search/cdx?url=www.carddas.com/naruto/cardlist/card_img/*_1.gif&matchType=prefix&output=json&fl=timestamp,original,statuscode&filter=statuscode:200&collapse=urlkey&limit=5000";
  const rows = await fetchCdxRows(url, "JP carddas vol1 *_1.gif");
  return rows.length;
}

const thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === thisFile) {
  harvestCarddasVol1Faces({
    limit: process.argv.includes("--limit")
      ? Number(process.argv[process.argv.indexOf("--limit") + 1])
      : undefined,
  }).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
