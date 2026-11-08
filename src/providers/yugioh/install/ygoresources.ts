/**
 * Fill missing FR Yu-Gi-Oh! faces from artworks.ygoresources.com (language=fr).
 *
 * Passcodes come from the YGOPRODeck ledger; FR regional prints without a
 * local `art.*` get `art.ygoresources.webp`.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { packCardDir, packLogsDir, packStagingDir } from "@/lib/packPaths";
import {
  downloadCardFaceBytes,
  installCardFace,
} from "@/providers/shared/cardCatalogue/faceInstall";
import { probeLocalArtBasename } from "@/providers/shared/cardCatalogue/localCatalogueFace";
import type {
  LocalPrintAssetWrite,
  LocalPrintsIndex,
} from "@/providers/shared/cardCatalogue/localPrintsIndex";

import { YUGIOH_PACK_ID } from "../pack";
import {
  isYugiohFrRegionalNumber,
  yugiohPrintKey,
} from "../printKey";
import { loadYgoprodeckLedger } from "../ygoprodeck";

const MANIFEST_URL = "https://artworks.ygoresources.com/manifest.json";
const ART_NAME = "art.ygoresources.webp";
const REFERER = "https://artworks.ygoresources.com/";

type YgoresourcesCardArt = {
  idx?: Record<string, Array<{ path?: string; source?: string }>>;
};

type YgoresourcesManifest = {
  cards?: Record<string, Record<string, YgoresourcesCardArt>>;
};

export function ygoresourcesManifestPath(): string {
  return path.join(packLogsDir(YUGIOH_PACK_ID), "ygoresources", "manifest.json");
}

export function resolveYgoresourcesFrUrl(
  manifest: YgoresourcesManifest,
  passcode: string | number,
): string | null {
  const card = manifest.cards?.[String(passcode)];
  if (!card) return null;
  // Artwork index "1" is the default face; prefer FR database scan.
  const slots = Object.values(card);
  for (const slot of slots) {
    const fr = slot.idx?.fr;
    const pathRel =
      fr?.find((row) => row.source === "database")?.path ?? fr?.[0]?.path;
    if (!pathRel?.trim()) continue;
    const trimmed = pathRel.trim();
    if (trimmed.startsWith("//")) return `https:${trimmed}`;
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
  }
  return null;
}

export async function harvestYgoresourcesManifest(opts: {
  force?: boolean;
} = {}): Promise<{ path: string; cards: number }> {
  const out = ygoresourcesManifestPath();
  if (!opts.force && existsSync(out)) {
    try {
      const parsed = JSON.parse(readFileSync(out, "utf8")) as YgoresourcesManifest;
      return { path: out, cards: Object.keys(parsed.cards ?? {}).length };
    } catch {
      /* re-fetch */
    }
  }
  const res = await fetch(MANIFEST_URL, {
    headers: { Accept: "application/json", Referer: REFERER },
  });
  if (!res.ok) {
    throw new Error(`ygoresources manifest HTTP ${res.status}`);
  }
  const text = await res.text();
  const parsed = JSON.parse(text) as YgoresourcesManifest;
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, text);
  // Staging copy for ingest ledger / offline.
  const staging = path.join(packStagingDir(YUGIOH_PACK_ID), "ygoresources");
  mkdirSync(staging, { recursive: true });
  writeFileSync(path.join(staging, "manifest.json"), text);
  return { path: out, cards: Object.keys(parsed.cards ?? {}).length };
}

function loadManifest(): YgoresourcesManifest | null {
  const p = ygoresourcesManifestPath();
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8")) as YgoresourcesManifest;
  } catch {
    return null;
  }
}

export async function fillYgoresourcesFrFaces(
  index: LocalPrintsIndex,
  opts: {
    force?: boolean;
    limit?: number;
    downloadManifest?: boolean;
  } = {},
): Promise<{
  tried: number;
  written: number;
  skipped: number;
  failed: number;
  unmapped: number;
}> {
  if (opts.downloadManifest !== false) {
    await harvestYgoresourcesManifest({ force: opts.force });
  }
  const manifest = loadManifest();
  const ledger = loadYgoprodeckLedger();
  if (!manifest || !ledger) {
    return { tried: 0, written: 0, skipped: 0, failed: 0, unmapped: 0 };
  }

  let tried = 0;
  let written = 0;
  let skipped = 0;
  let failed = 0;
  let unmapped = 0;
  const assets: LocalPrintAssetWrite[] = [];
  const bufByPasscode = new Map<string, Buffer>();

  // YGOPRODeck ledger is mostly EN collector codes — map FR titles → passcode.
  const passcodeByFrName = new Map<string, string>();
  for (const [passcode, name] of Object.entries(ledger.frNames)) {
    const key = name.trim().toLowerCase();
    if (key) passcodeByFrName.set(key, passcode);
  }

  let frRows = index
    .listRowsForLanguage("fr")
    .filter((row) => isYugiohFrRegionalNumber(row.number));
  if (opts.limit && opts.limit > 0) frRows = frRows.slice(0, opts.limit);

  for (const row of frRows) {
    const destDir = packCardDir(YUGIOH_PACK_ID, {
      set: row.setCode,
      lang: "fr",
      card: row.number,
    });
    if (!opts.force && probeLocalArtBasename(destDir)) {
      skipped += 1;
      continue;
    }
    const nameKey = row.fullName?.trim().toLowerCase() ?? "";
    const passcode = nameKey ? passcodeByFrName.get(nameKey) : undefined;
    if (!passcode) {
      unmapped += 1;
      continue;
    }
    const url = resolveYgoresourcesFrUrl(manifest, passcode);
    if (!url) {
      unmapped += 1;
      continue;
    }
    tried += 1;
    const installed = await installCardFace({
      destDir,
      artName: ART_NAME,
      url,
      webpQuality: 85,
      referer: REFERER,
      force: opts.force,
      fetchImage: async (faceUrl) => {
        let buf = bufByPasscode.get(passcode) ?? null;
        if (!buf) {
          buf = await downloadCardFaceBytes(faceUrl, {
            referer: REFERER,
            timeoutMs: 40_000,
          });
          if (buf) bufByPasscode.set(passcode, buf);
        }
        return buf;
      },
    });
    if (!installed) {
      failed += 1;
      continue;
    }
    if (installed.downloaded) written += 1;
    else skipped += 1;
    assets.push({
      printKey: row.printKey,
      lang: "fr",
      art: installed.art,
      sourceUrl: url,
    });
  }

  if (assets.length) index.writeAssets(assets);
  return { tried, written, skipped, failed, unmapped };
}
