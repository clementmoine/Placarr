/**
 * Packshots presse / retail FR → starters & boosters JCC.
 *
 * Ledger `curated/sources/press-packshots.json` : download staging, copy
 * `art.<host>.*`, `face.json`, rename SKU, mint 2ᵉ starters manquants.
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { assetsPackFileUrl } from "@/lib/packAssetUrls";
import { packDataDir, packSealedProductsDir } from "@/lib/packPaths";
import { CARD_FACE_DECISION_FILE } from "@/providers/shared/cardFaces";
import { downloadCardFaceBytes } from "@/providers/shared/cardCatalogue/faceInstall";
import {
  sealedProductKey,
  type SealedProductEntry,
} from "@/providers/shared/sealedProducts/indexFormat";
import {
  sealedBehaviorForKind,
  type SealedKind,
} from "@/providers/shared/sealedProducts/kinds";
import {
  loadSealedProductsIndex,
  persistSealedProductsIndexDoc,
} from "@/providers/shared/sealedProducts/persistProductsIndex";

import pressPackshotsLedgerJson from "../curated/sources/press-packshots.json";
import { DBS_JCC_PACK_ID } from "../pack";

export type PressPackshotRow =
  (typeof pressPackshotsLedgerJson.products)[number];

export function pressPackshotLedger() {
  return pressPackshotsLedgerJson;
}

export function pressIngestPackshots(): PressPackshotRow[] {
  return pressPackshotsLedgerJson.products.filter((row) => row.ingest);
}

/** Index keys may still be `dbs/jcc::…` after the pack-id rename. */
function productKeyForSlug(
  products: Record<string, SealedProductEntry>,
  slug: string,
): string | null {
  const preferred = sealedProductKey(DBS_JCC_PACK_ID, slug);
  if (products[preferred]) return preferred;
  for (const [key, entry] of Object.entries(products)) {
    if (entry.slug === slug) return key;
  }
  return null;
}

function mintKeyForSlug(
  products: Record<string, SealedProductEntry>,
  slug: string,
  siblingSlug: string,
): string {
  const siblingKey = productKeyForSlug(products, siblingSlug);
  if (siblingKey) {
    const sep = siblingKey.indexOf("::");
    if (sep > 0) return `${siblingKey.slice(0, sep)}::${slug}`;
  }
  return sealedProductKey(DBS_JCC_PACK_ID, slug);
}

function artFileName(host: string, stagingRel: string): string {
  const ext = path.extname(stagingRel).toLowerCase() || ".jpg";
  const safe = ext === ".jpeg" ? ".jpg" : ext;
  return `art.${host}${safe}`;
}

function productArtDir(slug: string, lang: string): string {
  return path.join(packSealedProductsDir(DBS_JCC_PACK_ID), slug, lang);
}

async function downloadToStaging(
  row: PressPackshotRow,
  opts: { force?: boolean },
): Promise<{ path: string; wrote: boolean } | null> {
  const dest = path.join(packDataDir(DBS_JCC_PACK_ID), row.staging);
  if (!opts.force && existsSync(dest)) return { path: dest, wrote: false };
  mkdirSync(path.dirname(dest), { recursive: true });
  const buf = await downloadCardFaceBytes(row.url, {
    referer: row.referer ?? row.url,
    minBytes: 6_000,
    timeoutMs: 45_000,
  });
  if (!buf) return null;
  writeFileSync(dest, buf);
  return { path: dest, wrote: true };
}

function installArt(
  row: PressPackshotRow,
  staged: string,
): string {
  const artName = artFileName(row.host, row.staging);
  const dir = productArtDir(row.slug, row.lang);
  mkdirSync(dir, { recursive: true });
  copyFileSync(staged, path.join(dir, artName));
  writeFileSync(
    path.join(dir, CARD_FACE_DECISION_FILE),
    `${JSON.stringify({ art: artName }, null, 2)}\n`,
    "utf8",
  );
  return assetsPackFileUrl(
    DBS_JCC_PACK_ID,
    "products",
    row.slug,
    row.lang,
    artName,
  );
}

function mintDeckTemplate(
  sibling: SealedProductEntry | undefined,
  row: PressPackshotRow,
  imageUrl: string,
): SealedProductEntry {
  const kind = (row.kind as SealedKind) || "deck";
  const category =
    kind === "display"
      ? "booster-box"
      : kind === "collector_box"
        ? "tin-box"
        : (sibling?.category ?? "starter-deck");
  const cardsPerPack =
    kind === "deck"
      ? (sibling?.cardsPerPack ?? 32)
      : (sibling?.cardsPerPack ?? 8);
  const packsContained =
    kind === "display" ? 24 : (sibling?.packsContained ?? 1);
  return {
    slug: row.slug,
    path: sibling?.path ?? row.referer ?? row.url,
    kind,
    behavior: sealedBehaviorForKind(kind),
    category,
    name: row.title,
    image: imageUrl,
    imageBack: null,
    setLogo: sibling?.setLogo ?? null,
    setCode: row.setCode,
    catalogueSetId: sibling?.catalogueSetId ?? row.setCode,
    lang: row.lang,
    releaseDate: sibling?.releaseDate ?? null,
    priceCents: null,
    cardsPerPack,
    packsContained,
    guaranteedPrints: [],
    randomPoolScope:
      kind === "booster" || kind === "display" ? "set" : "none",
    randomPoolPrints: [],
    declaredCardCount: sibling?.declaredCardCount ?? null,
    setCardCount: sibling?.setCardCount ?? null,
    contentsKnown: false,
    containsPrintsIsPreview: false,
    prints: [],
  };
}

export type InstallPressPackshotsReport = {
  downloaded: number;
  installed: number;
  renamed: number;
  minted: number;
  failed: number;
};

export async function installDbsJccPressPackshots(
  opts: { force?: boolean } = {},
): Promise<InstallPressPackshotsReport> {
  const index = loadSealedProductsIndex(DBS_JCC_PACK_ID);
  const products = { ...index.products };
  let downloaded = 0;
  let installed = 0;
  let renamed = 0;
  let minted = 0;
  let failed = 0;

  for (const row of pressIngestPackshots()) {
    const staged = await downloadToStaging(row, opts);
    if (!staged) {
      failed += 1;
      continue;
    }
    if (staged.wrote) downloaded += 1;

    const imageUrl = installArt(row, staged.path);
    installed += 1;
    let existingKey = productKeyForSlug(products, row.slug);
    let existing = existingKey ? products[existingKey] : undefined;
    const siblingSlug =
      "mintSiblingSlug" in row && typeof row.mintSiblingSlug === "string"
        ? row.mintSiblingSlug
        : `${row.setCode}-starter`;

    if (!existing && row.mint) {
      const key = mintKeyForSlug(products, row.slug, siblingSlug);
      const siblingKey = productKeyForSlug(products, siblingSlug);
      products[key] = mintDeckTemplate(
        siblingKey ? products[siblingKey] : undefined,
        row,
        imageUrl,
      );
      minted += 1;
      continue;
    }

    if (!existing || !existingKey) {
      failed += 1;
      continue;
    }

    if (row.mint) {
      const aligned = mintKeyForSlug(products, row.slug, siblingSlug);
      if (aligned !== existingKey) {
        products[aligned] = existing;
        delete products[existingKey];
        existingKey = aligned;
        existing = products[aligned]!;
      }
    }

    if (existing.name !== row.title) renamed += 1;
    products[existingKey] = {
      ...existing,
      name: row.title,
      image: imageUrl,
    };
  }

  persistSealedProductsIndexDoc({
    ...index,
    products,
  });

  return { downloaded, installed, renamed, minted, failed };
}
