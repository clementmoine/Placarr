/**
 * Seed Bleach SCB local index from curated FR + JA ledgers.
 *
 * FR (A/C/E/Z/P) and JA (S-/B-/E-/Z-/PZ- + Ability A-) keep separate printKeys —
 * Bandai remapped European letters; nikita hosts the original JP refs.
 */
import { existsSync, readFileSync, renameSync } from "node:fs";
import path from "node:path";

import sharp from "sharp";

import { packCardDir } from "@/lib/packPaths";
import { installCardFace } from "@/providers/shared/cardCatalogue/faceInstall";
import type {
  LocalPrintAssetWrite,
  LocalPrintsIndex,
  LocalPrintWrite,
} from "@/providers/shared/cardCatalogue/localPrintsIndex";

import { bleachScbJaFaceRotateDeg } from "../sources/faceOrient";
import {
  harvestColekaBleachS1,
  installColekaBleachFaces,
} from "../harvest/coleka";
import { harvestColekaBleachS1Prices } from "../harvest/colekaPrices";
import { harvestBleachJaFromNikita } from "../harvest/nikita";
import type { BleachScbCard } from "../parse/carddassFr";
import { buildBleachFrLedger } from "../parse/carddassFr";
import { bleachScbCuratedDir, BLEACH_SCB_PACK_ID } from "../pack";
import {
  bleachScbPrintKey,
  formatBleachScbReference,
  parseBleachScbPrinted,
} from "../printKey";

function loadCards(rel: string): BleachScbCard[] {
  const p = path.join(bleachScbCuratedDir(), "sources", rel);
  if (!existsSync(p)) return [];
  const raw = JSON.parse(readFileSync(p, "utf8")) as { cards?: BleachScbCard[] };
  return raw.cards ?? [];
}

export async function harvestBleachScbLedgers(): Promise<{
  fr: number;
  ja: number;
  coleka: number;
  colekaPrices: number;
}> {
  const { cards: fr } = buildBleachFrLedger();
  const { cards: ja } = await harvestBleachJaFromNikita();
  const { cards: coleka } = await harvestColekaBleachS1();
  const { ledger: prices } = await harvestColekaBleachS1Prices();
  return {
    fr: fr.length,
    ja: ja.length,
    coleka: coleka.length,
    colekaPrices: prices.withPrintKey,
  };
}

/**
 * Rotate portrait-on-disk JA landscape scans (Blast / Ability) without
 * re-fetching. Idempotent once artW > artH.
 */
export async function ensureBleachJaLandscapeScans(
  cards: readonly BleachScbCard[],
): Promise<number> {
  let rotated = 0;
  for (const card of cards) {
    const deg = bleachScbJaFaceRotateDeg(card);
    if (!deg) continue;
    const parsed =
      parseBleachScbPrinted(card.printed) ??
      (card.set && card.number
        ? { set: card.set, number: card.number, printed: card.printed }
        : null);
    if (!parsed) continue;
    const destDir = packCardDir(BLEACH_SCB_PACK_ID, {
      set: parsed.set,
      lang: "ja",
      card: parsed.number,
    });
    const artPath = path.join(destDir, "art.nikita.jpg");
    if (!existsSync(artPath)) continue;
    const meta = await sharp(artPath).metadata();
    const w = meta.width ?? 0;
    const h = meta.height ?? 0;
    if (!(w > 0 && h > 0) || w > h) continue;
    const tmp = `${artPath}.rotating`;
    await sharp(artPath)
      .rotate(deg)
      .jpeg({ quality: 92, mozjpeg: true })
      .toFile(tmp);
    renameSync(tmp, artPath);
    rotated += 1;
  }
  return rotated;
}

async function installLangFaces(
  cards: BleachScbCard[],
  lang: "fr" | "ja",
  urlKey: "faceUrlFr" | "faceUrlJa",
  artName: string,
  opts: { downloadFaces?: boolean },
): Promise<{
  printRows: LocalPrintWrite[];
  assets: LocalPrintAssetWrite[];
  faces: number;
}> {
  const printRows: LocalPrintWrite[] = [];
  const assets: LocalPrintAssetWrite[] = [];
  let faces = 0;

  for (const card of cards) {
    const parsed =
      parseBleachScbPrinted(card.printed) ??
      (card.set && card.number
        ? { set: card.set, number: card.number, printed: card.printed }
        : null);
    if (!parsed) continue;
    const printKey = bleachScbPrintKey(parsed.set, parsed.number);
    if (!printKey) continue;

    const titles: Array<{
      lang: string;
      fullName: string;
      rarity?: string | null;
    }> = [];
    if (lang === "fr") {
      titles.push({
        lang: "fr",
        fullName:
          card.nameFr?.trim() ||
          formatBleachScbReference(parsed.set, parsed.number),
      });
    } else if (card.nameJa?.trim()) {
      titles.push({ lang: "ja", fullName: card.nameJa.trim() });
    } else {
      continue;
    }

    printRows.push({
      printKey,
      setCode: parsed.set,
      number: parsed.number,
      cardType: parsed.set,
      titles,
    });

    const faceUrl = card[urlKey];
    if (opts.downloadFaces === false || !faceUrl) continue;

    const destDir = packCardDir(BLEACH_SCB_PACK_ID, {
      set: parsed.set,
      lang,
      card: parsed.number,
    });
    const rotateDegrees = lang === "ja" ? bleachScbJaFaceRotateDeg(card) : 0;
    const installed = await installCardFace({
      destDir,
      artName,
      url: faceUrl,
      minBytes: 2_000,
      timeoutMs: 30_000,
      ...(rotateDegrees ? { rotateDegrees } : {}),
    });
    if (!installed) continue;
    if (installed.downloaded) faces += 1;
    assets.push({
      printKey,
      lang,
      art: installed.art,
      sourceUrl: faceUrl,
    });
  }

  return { printRows, assets, faces };
}

export async function installBleachScbFromLedgers(
  index: LocalPrintsIndex,
  opts: { downloadFaces?: boolean } = {},
): Promise<{ prints: number; titles: number; faces: number; rotated: number }> {
  const frCards = loadCards("carddass-fr-bleach.json");
  const jaCards = loadCards("soul-card-battle-ja.json");

  const fr = await installLangFaces(
    frCards,
    "fr",
    "faceUrlFr",
    "art.carddass.jpg",
    opts,
  );
  const ja = await installLangFaces(
    jaCards,
    "ja",
    "faceUrlJa",
    "art.nikita.jpg",
    opts,
  );
  // Coleka after Carddass: download fallback faces; index only if no carddass.
  const coleka = await installColekaBleachFaces(index, opts);
  const rotated =
    opts.downloadFaces === false
      ? 0
      : await ensureBleachJaLandscapeScans(jaCards);

  const printRows = [...fr.printRows, ...ja.printRows];
  const assets = [...fr.assets, ...ja.assets];
  let prints = 0;
  let titles = 0;
  if (printRows.length) {
    const w = index.writePrints(printRows);
    prints = w.prints;
    titles = w.titles;
  }
  if (assets.length) index.writeAssets(assets);
  return {
    prints: prints + coleka.prints,
    titles: titles + coleka.titles,
    faces: fr.faces + ja.faces + coleka.faces,
    rotated,
  };
}
