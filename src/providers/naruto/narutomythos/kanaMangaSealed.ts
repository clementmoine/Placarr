/**
 * Kana manga insert SKUs for Mythos (Boruto TBV t.6, …).
 *
 * Separate provenance from LorenZone retail — publisher manga with a
 * guaranteed promo in a named print run. Rows are merged into the sealed
 * ingest (never written alone — `writeLocalSealedProducts` replaces the index).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { packSealedProductsDir } from "@/lib/packPaths";
import { downloadCardFaceBytes } from "@/providers/shared/cardCatalogue/faceInstall";
import type { LocalSealedWrite } from "@/providers/shared/sealedProducts/localWrite";
import type { SealedKind } from "@/providers/shared/sealedProducts/kinds";

import {
  loadMythosPromoDistributionDig,
  mythosPromoCuratedAssetPath,
} from "./sources/promoDistribution";
import { NARUTO_MYTHOS_PACK_ID } from "./pack";

export const MYTHOS_KANA_BORUTO_TBV6_SLUG =
  "kana-boruto-two-blue-vortex-tome-6";

function artPath(slug: string, lang: string): string {
  return path.join(
    packSealedProductsDir(NARUTO_MYTHOS_PACK_ID),
    slug,
    lang.trim().toLowerCase(),
    "art.kana.jpg",
  );
}

function artLooksComplete(dest: string): boolean {
  if (!existsSync(dest)) return false;
  try {
    return readFileSync(dest).byteLength > 500;
  } catch {
    return false;
  }
}

async function downloadCover(url: string): Promise<Buffer | null> {
  return downloadCardFaceBytes(url, {
    referer: "https://www.editions-kana.com/",
    minBytes: 501,
    timeoutMs: 60_000,
  });
}

/**
 * Ensure packshot on disk, then return a LocalSealedWrite for the Boruto TBV
 * t.6 insert (or null if dig/cover unavailable).
 */
export async function buildMythosKanaBorutoTbv6SealedWrite(opts: {
  force?: boolean;
} = {}): Promise<{
  product: LocalSealedWrite | null;
  cover: "ok" | "skip" | "fail" | "missing";
}> {
  const dig = loadMythosPromoDistributionDig();
  if (!dig?.officialAnnouncement) {
    return { product: null, cover: "missing" };
  }
  const ann = dig.officialAnnouncement;
  const lang = dig.lang || "fr";
  const dest = artPath(MYTHOS_KANA_BORUTO_TBV6_SLUG, lang);

  let cover: "ok" | "skip" | "fail" | "missing" = "missing";
  if (!opts.force && artLooksComplete(dest)) {
    cover = "skip";
  } else if (ann.coverUrl?.trim()) {
    const buf = await downloadCover(ann.coverUrl.trim());
    if (buf) {
      mkdirSync(path.dirname(dest), { recursive: true });
      writeFileSync(dest, buf);
      cover = "ok";
    } else {
      const flyer = dig.proof.tweet.media.find((m) => m.lang === "fr")?.local;
      const flyerPath = flyer ? mythosPromoCuratedAssetPath(flyer) : null;
      if (flyerPath && existsSync(flyerPath)) {
        mkdirSync(path.dirname(dest), { recursive: true });
        writeFileSync(dest, readFileSync(flyerPath));
        cover = "ok";
      } else {
        cover = "fail";
      }
    }
  }

  if (!artLooksComplete(dest)) {
    return { product: null, cover };
  }

  const kind: SealedKind = "special";
  return {
    cover,
    product: {
      slug: MYTHOS_KANA_BORUTO_TBV6_SLUG,
      kind,
      category: "Manga insert (Kana)",
      name: ann.product,
      source: "kana",
      setCode: ann.isbn || MYTHOS_KANA_BORUTO_TBV6_SLUG,
      catalogueSetId: "ks1promo",
      lang,
      releaseDate: ann.releaseDate ?? null,
      priceCents: null,
      cardsPerPack: 1,
      packsContained: 1,
      declaredCardCount: 1,
      path: dig.proof.tweet.statusUrl,
      artPath: dest,
    },
  };
}
