/**
 * TCGdex often ships JA set briefs with card names but no `image` field, while
 * `assets.tcgdex.net/ja/{serie}/{Set}/{num}` already hosts the scan (e.g. S8b).
 * Probe the CDN once per set and write synthesized bases — never invent a URL
 * that 404s (catalogue « sans image » must stay honest).
 */
import { synthesizeTcgdexImageBase } from "@/core/enrich/media/tcgdexAssetUrls";
import { httpGet } from "@/lib/http/httpClient";
import { tcgdexImageCandidates } from "./fetch";
import {
  listTcgdexJaPrintsMissingImageBase,
  patchTcgdexPrintImageBases,
} from "./indexStore";

const API_BASE = "https://api.tcgdex.net/v2";

export type BackfillCdnImageBasesReport = {
  setsProbed: number;
  setsWithCdn: number;
  setsWithoutCdn: number;
  printsPatched: number;
};

type RawSetDetail = {
  id?: string;
  serie?: { id?: string };
};

function remoteSetIdFromProvider(providerId: string, fallback: string): string {
  const raw = providerId.trim();
  const cut = raw.lastIndexOf("-");
  if (cut > 0) return raw.slice(0, cut);
  return fallback;
}

async function fetchSetDetail(remoteSetId: string): Promise<RawSetDetail | null> {
  try {
    const response = await httpGet<RawSetDetail>(
      `${API_BASE}/ja/sets/${encodeURIComponent(remoteSetId)}`,
      { timeout: 20_000, validateStatus: () => true },
    );
    if (response.status !== 200 || response.data == null) return null;
    return response.data;
  } catch {
    return null;
  }
}

async function cdnBaseExists(
  base: string,
  head?: (url: string) => Promise<boolean>,
): Promise<boolean> {
  const probe =
    head ??
    (async (url: string) => {
      try {
        const response = await httpGet(url, {
          method: "HEAD",
          timeout: 10_000,
          validateStatus: () => true,
          responseType: "arraybuffer",
        });
        return response.status === 200;
      } catch {
        return false;
      }
    });
  for (const url of tcgdexImageCandidates(base, "high").slice(0, 4)) {
    if (await probe(url)) return true;
  }
  return false;
}

/**
 * Fill empty JA CDN bases for prints whose assets already exist on
 * assets.tcgdex.net even though the API omitted `card.image`.
 */
export async function backfillTcgdexMissingImageBasesFromCdn(
  opts: {
    dbPath?: string;
    delayMs?: number;
    /** Override HEAD probe (tests). */
    headOk?: (url: string) => Promise<boolean>;
    /** Override set detail fetch (tests). */
    fetchSet?: (remoteSetId: string) => Promise<RawSetDetail | null>;
    onProgress?: (message: string) => void;
  } = {},
): Promise<BackfillCdnImageBasesReport> {
  const delayMs = opts.delayMs ?? 120;
  const report = opts.onProgress ?? (() => {});
  const missing = listTcgdexJaPrintsMissingImageBase({ dbPath: opts.dbPath });
  const bySet = new Map<string, typeof missing>();
  for (const row of missing) {
    const key = row.setId.trim().toLowerCase();
    const bucket = bySet.get(key);
    if (bucket) bucket.push(row);
    else bySet.set(key, [row]);
  }

  let setsProbed = 0;
  let setsWithCdn = 0;
  let setsWithoutCdn = 0;
  const patches: { printKey: string; imageBaseUrl: string }[] = [];

  for (const [, rows] of bySet) {
    setsProbed += 1;
    const sample = rows[0]!;
    const remoteGuess = remoteSetIdFromProvider(
      sample.providerId,
      sample.setId,
    );
    if (delayMs > 0 && setsProbed > 1) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
    const detail = opts.fetchSet
      ? await opts.fetchSet(remoteGuess)
      : await fetchSetDetail(remoteGuess);
    const serieId = detail?.serie?.id?.trim();
    const setIdCased = detail?.id?.trim() || remoteGuess;
    if (!serieId) {
      setsWithoutCdn += 1;
      continue;
    }
    const probeBase = synthesizeTcgdexImageBase({
      lang: "ja",
      serieId,
      setId: setIdCased,
      localId: sample.localId,
    });
    if (!probeBase || !(await cdnBaseExists(probeBase, opts.headOk))) {
      setsWithoutCdn += 1;
      continue;
    }
    setsWithCdn += 1;
    for (const row of rows) {
      const base = synthesizeTcgdexImageBase({
        lang: "ja",
        serieId,
        setId: setIdCased,
        localId: row.localId,
      });
      if (!base) continue;
      patches.push({ printKey: row.printKey, imageBaseUrl: base });
    }
    if (setsWithCdn % 10 === 0) {
      report(
        `   CDN JA backfill : ${setsWithCdn} sets avec assets / ${setsProbed} sondés`,
      );
    }
  }

  const printsPatched = patchTcgdexPrintImageBases(patches, opts.dbPath);
  report(
    `CDN JA backfill : ${printsPatched} bases écrites (${setsWithCdn} sets CDN / ${setsWithoutCdn} sans asset)`,
  );
  return {
    setsProbed,
    setsWithCdn,
    setsWithoutCdn,
    printsPatched,
  };
}

/**
 * When a set detail lists cards without `image`, fill from CDN if the set's
 * assets exist. Mutates `imageBaseUrl` on the rows in place.
 */
export async function fillMissingImageBasesFromCdnProbe(opts: {
  lang: string;
  serieId: string | null | undefined;
  remoteSetId: string;
  prints: { localId: string; imageBaseUrl: string | null }[];
  headOk?: (url: string) => Promise<boolean>;
}): Promise<number> {
  const serieId = opts.serieId?.trim();
  if (!serieId) return 0;
  const missing = opts.prints.filter((p) => !p.imageBaseUrl?.trim());
  if (missing.length === 0) return 0;
  const sample = missing[0]!;
  const probeBase = synthesizeTcgdexImageBase({
    lang: opts.lang,
    serieId,
    setId: opts.remoteSetId,
    localId: sample.localId,
  });
  if (!probeBase || !(await cdnBaseExists(probeBase, opts.headOk))) return 0;
  let filled = 0;
  for (const row of opts.prints) {
    if (row.imageBaseUrl?.trim()) continue;
    const base = synthesizeTcgdexImageBase({
      lang: opts.lang,
      serieId,
      setId: opts.remoteSetId,
      localId: row.localId,
    });
    if (!base) continue;
    row.imageBaseUrl = base;
    filled += 1;
  }
  return filled;
}
