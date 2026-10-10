/**
 * Carte-outil « Détecteur » / Special Scouter — un seul print catalogue,
 * inclus dans les starters Série 4–10. Face FR (dbzc) + face JA (Hatatoy
 * 月刊少年ジャンプ スペシャルスカウター). Les SKU scellés `*-d-tecteur-*` sont
 * des doublons par série : on les retire.
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
} from "node:fs";
import path from "node:path";

import { packCardsDir, packSealedProductsDir } from "@/lib/packPaths";
import {
  downloadCardFaceBytes,
  installCardFace,
} from "@/providers/shared/cardCatalogue/faceInstall";
import { createLocalPrintsIndex } from "@/providers/shared/cardCatalogue/localPrintsIndex";
import {
  loadSealedProductsIndex,
  persistSealedProductsIndexDoc,
} from "@/providers/shared/sealedProducts/persistProductsIndex";

import { DBS_JCC_PACK_ID } from "../pack";
import {
  DBSJCC_DETECTEUR_NUMBER,
  DBSJCC_DETECTEUR_PRINT_KEY,
  DBSJCC_DETECTEUR_SET,
} from "../printKey";

const FR_SOURCE = "dbzcollection";
const JA_SOURCE = "hatatoy";
/** Hatatoy pid=172758353 — バンダイ ドラゴンボール 月刊少年ジャンプ スペシャルスカウター */
export const DBSJCC_DETECTEUR_HATATOY_URL =
  "https://img07.shop-pro.jp/PA01424/345/product/172758353.jpg";
export const DBSJCC_DETECTEUR_HATATOY_PRODUCT =
  "https://hatatoy.shop/?pid=172758353";

function detecteurFrFaceSource(): string | null {
  const productsRoot = packSealedProductsDir(DBS_JCC_PACK_ID);
  if (!existsSync(productsRoot)) return null;
  const preferred = path.join(
    productsRoot,
    "part4-d-tecteur-253",
    "fr",
    `art.${FR_SOURCE}.jpg`,
  );
  if (existsSync(preferred)) return preferred;
  for (const slug of readdirSync(productsRoot)) {
    if (!/d-?tecteur/i.test(slug)) continue;
    const candidate = path.join(
      productsRoot,
      slug,
      "fr",
      `art.${FR_SOURCE}.jpg`,
    );
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

export function isDbsjccDetecteurSealedSlug(slug: string): boolean {
  return /d-?tecteur/i.test(slug.trim());
}

export function purgeDbsjccDetecteurSealedProducts(): { removed: number } {
  const index = loadSealedProductsIndex(DBS_JCC_PACK_ID);
  const products = { ...index.products };
  let removed = 0;
  for (const [key, entry] of Object.entries(products)) {
    if (
      entry.category === "scouter" ||
      isDbsjccDetecteurSealedSlug(entry.slug)
    ) {
      delete products[key];
      removed += 1;
    }
  }
  if (removed) {
    persistSealedProductsIndexDoc({ ...index, products });
  }
  return { removed };
}

export type InstallDetecteurReport = {
  print: boolean;
  faceFr: boolean;
  faceJa: boolean;
  purgedSealed: number;
};

export async function installDbsjccDetecteur(
  opts: { force?: boolean } = {},
): Promise<InstallDetecteurReport> {
  const index = createLocalPrintsIndex(DBS_JCC_PACK_ID);
  index.writePrints([
    {
      printKey: DBSJCC_DETECTEUR_PRINT_KEY,
      setCode: DBSJCC_DETECTEUR_SET,
      number: DBSJCC_DETECTEUR_NUMBER,
      cardType: DBSJCC_DETECTEUR_SET,
      category: "accessory",
      sourceUrl: DBSJCC_DETECTEUR_HATATOY_PRODUCT,
      titles: [
        { lang: "fr", fullName: "Détecteur", rarity: null },
        { lang: "en", fullName: "Detector", rarity: null },
        { lang: "ja", fullName: "スペシャルスカウター", rarity: null },
      ],
    },
  ]);

  let faceFr = false;
  const frSrc = detecteurFrFaceSource();
  if (frSrc) {
    const destDir = path.join(
      packCardsDir(DBS_JCC_PACK_ID),
      DBSJCC_DETECTEUR_SET,
      "fr",
      DBSJCC_DETECTEUR_NUMBER,
    );
    mkdirSync(destDir, { recursive: true });
    const artName = `art.${FR_SOURCE}.jpg`;
    copyFileSync(frSrc, path.join(destDir, artName));
    index.writeAssets([
      {
        printKey: DBSJCC_DETECTEUR_PRINT_KEY,
        lang: "fr",
        art: artName,
        sourceUrl: "http://www.dbzcollection.fr/2v2/",
      },
    ]);
    faceFr = true;
  }

  let faceJa = false;
  const jaDir = path.join(
    packCardsDir(DBS_JCC_PACK_ID),
    DBSJCC_DETECTEUR_SET,
    "ja",
    DBSJCC_DETECTEUR_NUMBER,
  );
  const jaArt = `art.${JA_SOURCE}.jpg`;
  const installed = await installCardFace({
    destDir: jaDir,
    artName: jaArt,
    url: DBSJCC_DETECTEUR_HATATOY_URL,
    referer: DBSJCC_DETECTEUR_HATATOY_PRODUCT,
    force: opts.force,
    minBytes: 8_000,
    fetchImage: (url) =>
      downloadCardFaceBytes(url, {
        referer: DBSJCC_DETECTEUR_HATATOY_PRODUCT,
        minBytes: 8_000,
        timeoutMs: 45_000,
      }),
  });
  if (installed) {
    index.writeAssets([
      {
        printKey: DBSJCC_DETECTEUR_PRINT_KEY,
        lang: "ja",
        art: installed.art,
        sourceUrl: DBSJCC_DETECTEUR_HATATOY_PRODUCT,
      },
    ]);
    faceJa = true;
  }

  const { removed } = purgeDbsjccDetecteurSealedProducts();
  return {
    print: true,
    faceFr,
    faceJa,
    purgedSealed: removed,
  };
}
