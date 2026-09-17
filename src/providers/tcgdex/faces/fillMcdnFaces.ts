/**
 * Official pokemon.com encyclopédie faces → `art.mcdn.png`.
 *
 * Tries cms3/full then cms2/web for each card. Distinct from McDo marketing
 * tiles (`art.pokemoncom.png`).
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { httpGet } from "@/lib/http/httpClient";

import {
  pokemonFaceFilename,
  refreshPokemonFaceDecision,
} from "../faceChoice";
import { pokemonPaperCardDir } from "../paperCardDisk";
import {
  loadMcdnGalleryAliases,
  pokemonMcdnGalleryCodes,
} from "./mcdnGalleryCode";
import {
  pokemonMcdnCandidateUrls,
  type McdnLocale,
} from "./mcdnUrls";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

export type McdnGalleryCampaign = {
  id: string;
  setId: string;
  galleryCode?: string;
  lang: string;
  /** Inclusive range `1-158` or explicit list. */
  localIds: string | readonly string[];
  label?: string;
};

export type McdnGalleryLedger = {
  source?: string;
  aliases?: Readonly<Record<string, string>>;
  campaigns: McdnGalleryCampaign[];
};

export type McdnFillReport = {
  campaignId: string;
  setId: string;
  galleryCode: string | null;
  lang: string;
  tried: number;
  written: number;
  skipped: number;
  failed: number;
};

function curatedLedgerPath(): string {
  return path.join(
    process.cwd(),
    "src",
    "providers",
    "tcgdex",
    "curated",
    "sources",
    "mcdn-gallery.json",
  );
}

export function loadMcdnGalleryLedger(
  filePath = curatedLedgerPath(),
): McdnGalleryLedger {
  return JSON.parse(readFileSync(filePath, "utf8")) as McdnGalleryLedger;
}

/** Parse `1-15` or a JSON array of ids into local id strings. */
export function parseMcdnLocalIds(
  spec: string | readonly string[],
): string[] {
  if (Array.isArray(spec)) return spec.map(String);
  const text = String(spec).trim();
  const range = /^(\d+)\s*-\s*(\d+)$/.exec(text);
  if (range) {
    const a = Number.parseInt(range[1]!, 10);
    const b = Number.parseInt(range[2]!, 10);
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    return Array.from({ length: hi - lo + 1 }, (_, i) => String(lo + i));
  }
  return text
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

async function download(url: string): Promise<Buffer | null> {
  try {
    const res = await httpGet<ArrayBuffer>(url, {
      headers: { "User-Agent": UA },
      responseType: "arraybuffer",
      timeout: 40_000,
      validateStatus: (s) => s === 200,
    });
    if (!res.data || res.data.byteLength < 500) return null;
    return Buffer.from(res.data);
  } catch {
    return null;
  }
}

export async function resolveMcdnGalleryCode(opts: {
  setId: string;
  lang: McdnLocale;
  preferred?: string | null;
  aliases?: Readonly<Record<string, string>>;
  downloadImage?: (url: string) => Promise<Buffer | null>;
}): Promise<string | null> {
  const downloadImage = opts.downloadImage ?? download;
  const aliases = opts.aliases ?? loadMcdnGalleryAliases();
  const codes = opts.preferred
    ? [opts.preferred, ...pokemonMcdnGalleryCodes(opts.setId, aliases)]
    : pokemonMcdnGalleryCodes(opts.setId, aliases);
  const seen = new Set<string>();
  for (const code of codes) {
    if (!code || seen.has(code)) continue;
    seen.add(code);
    const buf = await downloadImage(
      pokemonMcdnCandidateUrls(code, opts.lang, 1)[1]!, // cms2 probe — complete coverage
    );
    if (buf) return code;
    const hq = await downloadImage(
      pokemonMcdnCandidateUrls(code, opts.lang, 1)[0]!,
    );
    if (hq) return code;
  }
  return null;
}

export async function fillMcdnFacesForSet(opts: {
  setId: string;
  lang: McdnLocale;
  localIds: readonly string[];
  galleryCode?: string | null;
  campaignId?: string;
  force?: boolean;
  cardsRoot?: string;
  aliases?: Readonly<Record<string, string>>;
  downloadImage?: (url: string) => Promise<Buffer | null>;
}): Promise<McdnFillReport> {
  const downloadImage = opts.downloadImage ?? download;
  const lang = opts.lang;
  const report: McdnFillReport = {
    campaignId: opts.campaignId ?? `${opts.setId}-${lang}`,
    setId: opts.setId,
    galleryCode: opts.galleryCode ?? null,
    lang,
    tried: 0,
    written: 0,
    skipped: 0,
    failed: 0,
  };

  const galleryCode =
    opts.galleryCode ??
    (await resolveMcdnGalleryCode({
      setId: opts.setId,
      lang,
      aliases: opts.aliases,
      downloadImage,
    }));
  report.galleryCode = galleryCode;
  if (!galleryCode) {
    report.failed = opts.localIds.length;
    report.tried = opts.localIds.length;
    return report;
  }

  for (const localId of opts.localIds) {
    report.tried += 1;
    const cardDir = pokemonPaperCardDir({
      setId: opts.setId,
      lang,
      localId,
      cardsRoot: opts.cardsRoot,
    });
    const outName = pokemonFaceFilename("mcdn", "art", "png");
    const outPath = path.join(cardDir, outName);
    if (!opts.force && existsSync(outPath)) {
      report.skipped += 1;
      refreshPokemonFaceDecision(cardDir, lang);
      continue;
    }

    let buf: Buffer | null = null;
    for (const url of pokemonMcdnCandidateUrls(galleryCode, lang, localId)) {
      buf = await downloadImage(url);
      if (buf) break;
    }
    if (!buf) {
      report.failed += 1;
      continue;
    }
    mkdirSync(cardDir, { recursive: true });
    writeFileSync(outPath, buf);
    refreshPokemonFaceDecision(cardDir, lang);
    report.written += 1;
  }

  return report;
}

export async function fillMcdnGalleryFaces(
  opts: {
    force?: boolean;
    cardsRoot?: string;
    ledgerPath?: string;
    downloadImage?: (url: string) => Promise<Buffer | null>;
  } = {},
): Promise<McdnFillReport[]> {
  const ledger = loadMcdnGalleryLedger(opts.ledgerPath);
  const aliases = {
    ...loadMcdnGalleryAliases(),
    ...(ledger.aliases ?? {}),
  };
  const reports: McdnFillReport[] = [];
  for (const campaign of ledger.campaigns) {
    const lang = campaign.lang.trim().toLowerCase() as McdnLocale;
    if (lang !== "fr" && lang !== "en") continue;
    reports.push(
      await fillMcdnFacesForSet({
        setId: campaign.setId,
        lang,
        localIds: parseMcdnLocalIds(campaign.localIds),
        galleryCode: campaign.galleryCode,
        campaignId: campaign.id,
        force: opts.force,
        cardsRoot: opts.cardsRoot,
        aliases,
        downloadImage: opts.downloadImage,
      }),
    );
  }
  return reports;
}
