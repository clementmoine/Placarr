/**
 * 12 Character SAMPLE — galerie `#artwork` sur naruto-cardgame.com (EN + JP).
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { packCardDir } from "@/lib/packPaths";
import { installCardFace } from "@/providers/shared/cardCatalogue/faceInstall";
import type {
  LocalPrintAssetWrite,
  LocalPrintsIndex,
  LocalPrintWrite,
} from "@/providers/shared/cardCatalogue/localPrintsIndex";

import {
  NARUTO_CARDGAME_PACK_ID,
  narutoCardgameCuratedDir,
} from "../pack";
import {
  NARUTO_CARDGAME_PREVIEW_SET,
  narutoCardgamePrintKey,
} from "../printKey";

const CDN = "https://www.naruto-cardgame.com";
const REFERER = `${CDN}/en/welcome/`;
const ART_NAME = "art.bandai.webp";

type GalleryCard = {
  gallery: string;
  number: string;
  nameEn: string;
  nameJa: string;
  category: string;
  frame?: string;
  variant?: string;
  tagsEn?: readonly string[];
  tagsJa?: readonly string[];
};

type GalleryLedger = {
  setCode?: string;
  cards: GalleryCard[];
};

function loadLedger(): GalleryLedger {
  const file = path.join(
    narutoCardgameCuratedDir(),
    "sources",
    "bandai-welcome-gallery.json",
  );
  return JSON.parse(readFileSync(file, "utf8")) as GalleryLedger;
}

function faceUrl(langFolder: "en" | "jp", gallery: string): string {
  return `${CDN}/images/welcome/card/${langFolder}/card${gallery}.webp`;
}

const VARIANT_LABEL_EN: Record<string, string> = {
  "manga-panels": "Manga panels",
  "the-taka": "The Taka",
  wind: "Wind",
  "uchiha-clan": "Uchiha Clan",
  "jinchuriki-team7": "Jinchuriki / Team 7",
};

const VARIANT_LABEL_JA: Record<string, string> = {
  "manga-panels": "マンガパネル",
  "the-taka": "鷹",
  wind: "風",
  "uchiha-clan": "うちは一族",
  "jinchuriki-team7": "人柱力 / 第七班",
};

function displayName(card: GalleryCard, lang: "en" | "ja"): string {
  const base = lang === "ja" ? card.nameJa : card.nameEn;
  if (!card.variant) return base;
  const hint =
    lang === "ja"
      ? VARIANT_LABEL_JA[card.variant]
      : VARIANT_LABEL_EN[card.variant];
  return hint ? `${base} (${hint})` : base;
}

export async function installNarutoCardgameWelcomeGallery(
  index: LocalPrintsIndex,
  opts: { downloadFaces?: boolean } = {},
): Promise<{ prints: number; titles: number; faces: number }> {
  const ledger = loadLedger();
  const setCode = (ledger.setCode ?? NARUTO_CARDGAME_PREVIEW_SET)
    .trim()
    .toLowerCase();
  const printRows: LocalPrintWrite[] = [];
  const assets: LocalPrintAssetWrite[] = [];
  let faces = 0;

  for (const card of ledger.cards) {
    const printKey = narutoCardgamePrintKey(setCode, card.number);
    if (!printKey) continue;
    printRows.push({
      printKey,
      setCode,
      number: card.number.trim().toLowerCase(),
      cardType: "card",
      category: card.category,
      sourceUrl: faceUrl("en", card.gallery),
      titles: [
        {
          lang: "en",
          fullName: displayName(card, "en"),
          rarity: "SAMPLE",
        },
        {
          lang: "ja",
          fullName: displayName(card, "ja"),
          rarity: "SAMPLE",
        },
      ],
    });

    if (opts.downloadFaces === false) continue;

    for (const { lang, folder } of [
      { lang: "en", folder: "en" as const },
      { lang: "ja", folder: "jp" as const },
    ]) {
      const destDir = packCardDir(NARUTO_CARDGAME_PACK_ID, {
        set: setCode,
        lang,
        card: card.number.trim().toLowerCase(),
      });
      const installed = await installCardFace({
        destDir,
        artName: ART_NAME,
        url: faceUrl(folder, card.gallery),
        referer: REFERER,
        minBytes: 8_000,
      });
      if (!installed) continue;
      faces += installed.downloaded ? 1 : 0;
      assets.push({
        printKey,
        lang,
        art: installed.art,
        sourceUrl: faceUrl(folder, card.gallery),
      });
    }
  }

  let prints = 0;
  let titles = 0;
  if (printRows.length) {
    const w = index.writePrints(printRows);
    prints = w.prints;
    titles = w.titles;
    index.prunePrintsExcept(new Set(printRows.map((r) => r.printKey)));
  }
  if (assets.length) index.writeAssets(assets);
  return { prints, titles, faces };
}
