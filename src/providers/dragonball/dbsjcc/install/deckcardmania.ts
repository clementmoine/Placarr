/**
 * Install DeckCardMania assets onto dbsjcc — honest set-fiche scope.
 *
 * 1. Album packshots Série 1–10 → staging only (often multi-SKU collage).
 *    Super Série / Tin box → primary sealed slug when one SKU per fiche.
 * 2. Gallery captions « Deck Planète » / « Booster de 8 cartes » → one
 *    `art.deckcardmania.jpg` on the matching sealed slug (never spray).
 * 3. DBS CG / Zenzu albums → staging only (hors corpus).
 * 4. Rarity stamp from DCM rare/holo lists onto FR titles when rarity empty.
 * 5. Named sample faces (`Carte SP01` / `D-###`) → card `art.deckcardmania`.
 * 6. Dos gallery documented in BACK.md — never overwrite nikita / FR backs.
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { packCardDir, packDataDir, packSealedProductsDir } from "@/lib/packPaths";
import {
  primarySealedSlugForSet,
  sealedSlugFromDeckcardmaniaGalleryTitle,
} from "./deckcardmaniaSealedSlugs";
import {
  downloadCardFaceBytes,
  installCardFace,
} from "@/providers/shared/cardCatalogue/faceInstall";
import type {
  LocalPrintAssetWrite,
  LocalPrintsIndex,
  LocalPrintWrite,
} from "@/providers/shared/cardCatalogue/localPrintsIndex";

import {
  installDbsJccSuperSerieMembership,
  type InstallSuperSerieMembershipReport,
} from "./superSerieMembership";

import type { DbsjccPrintCandidate } from "../harvest/chitoroshop";
import {
  matchCarddassFrToDbsjccPrint,
} from "../harvest/carddassFr";
import {
  dbsJccDeckcardmaniaLedgerPath,
  readDeckcardmaniaLedger,
  type DeckcardmaniaAlbum,
  type DeckcardmaniaGalleryImage,
  type DeckcardmaniaLedger,
} from "../harvest/deckcardmania";
import { DBS_JCC_PACK_ID } from "../pack";
import { parseDbsjccNumber } from "../printKey";
import { cardFolderName } from "../scrape/dbzcollection";

const SOURCE = "deckcardmania";
const REFERER = "https://www.deckcardmania.com/";

export function dbsJccDeckcardmaniaStagingDir(): string {
  return path.join(packDataDir(DBS_JCC_PACK_ID), "staging", "deckcardmania");
}

function loadLedger(
  ledgerPath = dbsJccDeckcardmaniaLedgerPath(),
): DeckcardmaniaLedger | null {
  return readDeckcardmaniaLedger(ledgerPath);
}

async function downloadToFile(
  url: string,
  dest: string,
  opts: { force?: boolean; minBytes?: number } = {},
): Promise<"written" | "resumed" | "failed"> {
  if (!opts.force && existsSync(dest)) return "resumed";
  mkdirSync(path.dirname(dest), { recursive: true });
  const buf = await downloadCardFaceBytes(url, {
    referer: REFERER,
    minBytes: opts.minBytes ?? 1_500,
    timeoutMs: 45_000,
  });
  if (!buf) return "failed";
  writeFileSync(dest, buf);
  return "written";
}

function candidatesForNumber(
  index: LocalPrintsIndex,
  number: string,
): DbsjccPrintCandidate[] {
  const rows = index
    .searchRows(number, { language: "fr", limit: 40 })
    .filter((row) => row.number === number);
  const byKey = new Map<string, DbsjccPrintCandidate>();
  for (const row of rows) {
    if (byKey.has(row.printKey)) continue;
    byKey.set(row.printKey, {
      printKey: row.printKey,
      setCode: row.setCode,
      number: row.number,
      grouping: row.grouping ?? null,
    });
  }
  return [...byKey.values()];
}

export type InstallDeckcardmaniaPackshotsReport = {
  albums: number;
  packshotsDownloaded: number;
  packshotsInstalled: number;
  galleryStaged: number;
  failed: number;
  stagedOnly: number;
};

/**
 * Download packshots + useful gallery; install packshots onto existing sealed
 * products when setHint matches; otherwise keep bytes under staging.
 */
export async function installDbsJccDeckcardmaniaPackshots(
  opts: { force?: boolean; ledgerPath?: string } = {},
): Promise<InstallDeckcardmaniaPackshotsReport> {
  const ledger = loadLedger(opts.ledgerPath);
  if (!ledger) {
    return {
      albums: 0,
      packshotsDownloaded: 0,
      packshotsInstalled: 0,
      galleryStaged: 0,
      failed: 0,
      stagedOnly: 0,
    };
  }

  const stagingRoot = dbsJccDeckcardmaniaStagingDir();
  mkdirSync(stagingRoot, { recursive: true });

  let packshotsDownloaded = 0;
  let packshotsInstalled = 0;
  let galleryStaged = 0;
  let failed = 0;
  let stagedOnly = 0;

  for (const album of ledger.albums) {
    const albumDir = path.join(stagingRoot, String(album.idm));
    mkdirSync(albumDir, { recursive: true });

    // Manifest for non-code consumers / re-runs
    writeFileSync(
      path.join(albumDir, "album.json"),
      `${JSON.stringify(
        {
          idm: album.idm,
          title: album.title,
          setHint: album.setHint,
          line: album.line,
          albumUrl: album.albumUrl,
          packshotUrl: album.packshotUrl,
        },
        null,
        2,
      )}\n`,
      "utf8",
    );

    if (album.packshotUrl) {
      const localPack = path.join(albumDir, "packshot.jpg");
      const dl = await downloadToFile(album.packshotUrl, localPack, {
        force: opts.force,
      });
      if (dl === "failed") failed += 1;
      else {
        if (dl === "written") packshotsDownloaded += 1;
        /*
          Série 1–10 album packshot = collage multi-SKU → staging only.
          Super Série / Tin box = une fiche ≈ un SKU → copier sur le primary.
        */
        const set = album.setHint?.trim().toLowerCase() ?? "";
        /*
          Album packshot → primary starter when the fiche is one themed deck
          (Super Série / Tin box / Série 6–10). Never for S1–5 (dual decks /
          collage). Prefer gallery `_iNb` captions when present.
        */
        const partN = /^part(\d+)$/.exec(set);
        const allowAlbumPackshot =
          /^ss\d+$/.test(set) ||
          set === "tinbox" ||
          (partN != null &&
            Number.parseInt(partN[1]!, 10) >= 6 &&
            Number.parseInt(partN[1]!, 10) <= 10);
        if (allowAlbumPackshot) {
          const sealedSlug =
            primarySealedSlugForSet(set) ?? null;
          if (sealedSlug) {
            const productFr = path.join(
              packSealedProductsDir(DBS_JCC_PACK_ID),
              sealedSlug,
              "fr",
            );
            const productArt = path.join(productFr, `art.${SOURCE}.jpg`);
            if (
              existsSync(productFr) &&
              (opts.force || !existsSync(productArt)) &&
              existsSync(localPack)
            ) {
              copyFileSync(localPack, productArt);
              packshotsInstalled += 1;
            } else {
              stagedOnly += 1;
            }
          } else {
            stagedOnly += 1;
          }
        } else {
          stagedOnly += 1;
        }
      }
    }

    for (const img of album.gallery) {
      // Skip anonymous exemples for sealed install; keep liste/dos/named/other packaging.
      if (img.kind === "exemple") continue;
      const safe = img.title
        .toLowerCase()
        .normalize("NFD")
        .replace(/\p{M}/gu, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 48) || "gallery";
      const dest = path.join(albumDir, `${safe}.jpg`);
      const dl = await downloadToFile(img.url, dest, { force: opts.force });
      if (dl === "written") galleryStaged += 1;
      else if (dl === "failed") {
        failed += 1;
        continue;
      }

      const sealedSlug = sealedSlugFromDeckcardmaniaGalleryTitle(
        album.setHint,
        img.title,
      );
      if (!sealedSlug) continue;
      const productFr = path.join(
        packSealedProductsDir(DBS_JCC_PACK_ID),
        sealedSlug,
        "fr",
      );
      if (!existsSync(productFr)) {
        stagedOnly += 1;
        continue;
      }
      const productArt = path.join(productFr, `art.${SOURCE}.jpg`);
      if (!opts.force && existsSync(productArt)) continue;
      if (!existsSync(dest)) continue;
      copyFileSync(dest, productArt);
      packshotsInstalled += 1;
    }
  }

  return {
    albums: ledger.albums.length,
    packshotsDownloaded,
    packshotsInstalled,
    galleryStaged,
    failed,
    stagedOnly,
  };
}

export type InstallDeckcardmaniaRarityReport = {
  listed: number;
  stamped: number;
  skipped: number;
};

/**
 * Stamp DCM rare/holo lists onto FR title rarity when the slot is empty.
 * Never invent; never overwrite an existing dbzcollection rarity.
 */
export function installDbsJccDeckcardmaniaRarity(
  index: LocalPrintsIndex,
  opts: { ledgerPath?: string } = {},
): InstallDeckcardmaniaRarityReport {
  const ledger = loadLedger(opts.ledgerPath);
  if (!ledger) return { listed: 0, stamped: 0, skipped: 0 };

  const byKey = new Map<string, "Rare" | "Holo">();
  let listed = 0;

  for (const album of ledger.albums) {
    if (!album.setHint) continue;
    // Super Série reprints live under partN — match without ssN home set.
    const matchHint = /^ss\d+$/i.test(album.setHint) ? null : album.setHint;
    for (const printed of album.rares) {
      listed += 1;
      const number = parseDbsjccNumber(printed);
      if (!number) continue;
      const candidates = candidatesForNumber(index, number);
      const decision = matchCarddassFrToDbsjccPrint(
        number,
        matchHint,
        candidates,
      );
      if (decision.kind !== "match") continue;
      const prev = byKey.get(decision.print.printKey);
      if (prev === "Holo") continue;
      byKey.set(decision.print.printKey, "Rare");
    }
    for (const printed of album.holos) {
      listed += 1;
      const number = parseDbsjccNumber(printed);
      if (!number) continue;
      const candidates = candidatesForNumber(index, number);
      const decision = matchCarddassFrToDbsjccPrint(
        number,
        matchHint,
        candidates,
      );
      if (decision.kind !== "match") continue;
      byKey.set(decision.print.printKey, "Holo");
    }
  }

  const rows: LocalPrintWrite[] = [];
  let stamped = 0;
  let skipped = 0;

  for (const [printKey, rarity] of byKey) {
    const row = index.lookupRow(printKey, { language: "fr" });
    if (!row) {
      skipped += 1;
      continue;
    }
    const existing = row.rarity?.trim() ?? "";
    if (existing) {
      skipped += 1;
      continue;
    }
    rows.push({
      printKey,
      setCode: row.setCode,
      number: row.number,
      cardType: row.cardType || "card",
      grouping: row.grouping ?? null,
      titles: [
        {
          lang: "fr",
          fullName: row.fullName || row.number,
          rarity,
        },
      ],
    });
    stamped += 1;
  }

  if (rows.length) index.writePrints(rows);
  return { listed, stamped, skipped };
}

export type InstallDeckcardmaniaFacesReport = {
  listed: number;
  matched: number;
  faces: number;
  resumed: number;
  failed: number;
  skipped: string[];
};

function namedSamplesFromAlbum(
  album: DeckcardmaniaAlbum,
): Array<DeckcardmaniaGalleryImage & { setHint: string }> {
  if (!album.setHint) return [];
  return album.gallery
    .filter((g) => g.kind === "named" && g.printed && g.number && g.url)
    .map((g) => ({ ...g, setHint: album.setHint! }));
}

/**
 * Install clearly named sample faces as `art.deckcardmania.jpg` under lang=fr.
 */
export async function installDbsJccDeckcardmaniaFaces(
  index: LocalPrintsIndex,
  opts: { downloadFaces?: boolean; ledgerPath?: string } = {},
): Promise<InstallDeckcardmaniaFacesReport> {
  const ledger = loadLedger(opts.ledgerPath);
  const skipped: string[] = [];
  if (!ledger) {
    return {
      listed: 0,
      matched: 0,
      faces: 0,
      resumed: 0,
      failed: 0,
      skipped,
    };
  }

  const samples = ledger.albums.flatMap(namedSamplesFromAlbum);
  const pendingAssets: LocalPrintAssetWrite[] = [];
  let matched = 0;
  let faces = 0;
  let resumed = 0;
  let failed = 0;

  for (const sample of samples) {
    const candidates = candidatesForNumber(index, sample.number!);
    const decision = matchCarddassFrToDbsjccPrint(
      sample.number!,
      sample.setHint,
      candidates,
    );
    if (decision.kind !== "match") {
      skipped.push(
        `${sample.printed} (idm set ${sample.setHint}): ${decision.reason}`,
      );
      continue;
    }
    matched += 1;
    if (opts.downloadFaces === false) continue;

    const { print } = decision;
    const destDir = packCardDir(DBS_JCC_PACK_ID, {
      set: print.setCode,
      lang: "fr",
      card: cardFolderName(print.number, print.grouping),
    });
    const artName = `art.${SOURCE}.jpg`;
    const installed = await installCardFace({
      destDir,
      artName,
      url: sample.url,
      referer: REFERER,
      minBytes: 1_500,
      timeoutMs: 45_000,
    });
    if (!installed) {
      failed += 1;
      skipped.push(`${sample.printed}: face download failed`);
      continue;
    }
    if (installed.downloaded) faces += 1;
    else resumed += 1;

    // Only fill preferred art when FR has none yet.
    const row = index.lookupRow(print.printKey, { language: "fr" });
    const art = row?.art?.trim() ?? "";
    if (!art || art === artName) {
      pendingAssets.push({
        printKey: print.printKey,
        lang: "fr",
        art: installed.art,
        sourceUrl: sample.url,
      });
    }
  }

  if (pendingAssets.length) index.writeAssets(pendingAssets);

  return {
    listed: samples.length,
    matched,
    faces,
    resumed,
    failed,
    skipped,
  };
}

export type InstallDeckcardmaniaReport = {
  packshots: InstallDeckcardmaniaPackshotsReport;
  rarity: InstallDeckcardmaniaRarityReport;
  faces: InstallDeckcardmaniaFacesReport;
  superSerie: InstallSuperSerieMembershipReport;
};

/** Packshots + rarity + named sample faces + Super Série print_sets. */
export async function installDbsJccDeckcardmania(
  index: LocalPrintsIndex,
  opts: { downloadFaces?: boolean; force?: boolean; ledgerPath?: string } = {},
): Promise<InstallDeckcardmaniaReport> {
  const packshots = await installDbsJccDeckcardmaniaPackshots({
    force: opts.force,
    ledgerPath: opts.ledgerPath,
  });
  const rarity = installDbsJccDeckcardmaniaRarity(index, {
    ledgerPath: opts.ledgerPath,
  });
  const faces = await installDbsJccDeckcardmaniaFaces(index, {
    downloadFaces: opts.downloadFaces,
    ledgerPath: opts.ledgerPath,
  });
  // Clears false ssN→partN links; real SJCC cards come from dbzc idc=112.
  const superSerie = installDbsJccSuperSerieMembership();
  return { packshots, rarity, faces, superSerie };
}
