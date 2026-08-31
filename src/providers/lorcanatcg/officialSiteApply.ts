/**
 * Applique le harvest `www.disneylorcana.com` : logos d'extension + SKU manquants.
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { assetsPackFileUrl } from "@/lib/packAssetUrls";
import {
  packProductsIndexPath,
  packSealedProductsDir,
} from "@/lib/packPaths";
import {
  emptyProductsIndex,
  isProductsIndexV1,
  sealedProductKey,
  type ProductsIndexV1,
  type SealedProductEntry,
} from "@/providers/shared/sealedProducts/indexFormat";
import {
  sealedBehaviorForKind,
  sealedContentsKnown,
} from "@/providers/shared/sealedProducts/kinds";
import { resolveContentLayers } from "@/providers/shared/sealedProducts/contentLayers";
import { resolveSealedContents } from "@/core/collect/sealedContents";

import {
  officialSiteStagingDir,
  readOfficialSiteLedger,
  type OfficialProductPage,
} from "./officialSite";
import {
  lorcanaSetLogoAssetUrl,
  loadLorcanaSetLogoIndex,
  lorcanaSetLogoCachePath,
  persistLorcanaSetLogoIndex,
  type LorcanaSetLogoIndex,
  type LorcanaSetLogoRow,
  LORCANA_SET_LOGO_CACHE_VERSION,
  LORCANA_CATALOG_URL,
} from "./setLogos";

const SOURCE = "disneysite";

function loadProductsIndex(packId: string): ProductsIndexV1 {
  const file = packProductsIndexPath(packId);
  if (existsSync(file)) {
    try {
      const raw: unknown = JSON.parse(readFileSync(file, "utf8"));
      if (isProductsIndexV1(raw)) return raw;
    } catch {
      /* fall through */
    }
  }
  return emptyProductsIndex(packId);
}

/**
 * Remplace / complète les logos API par les wordmarks marketing (plus grands,
 * fond transparent). Crée aussi set14+ / quest3 absents de l'API.
 *
 * N'écrase un logo API existant que si le fichier officiel ressemble à un
 * wordmark (pas un header 1920×…).
 */
export function applyOfficialSiteLogos(opts: {
  stagingDir?: string;
  packId?: string;
  index?: LorcanaSetLogoIndex | null;
} = {}): { updated: number; added: number; index: LorcanaSetLogoIndex | null } {
  const staging = opts.stagingDir ?? officialSiteStagingDir(opts.packId);
  const logosDir = path.join(staging, "logos");
  const ledger = readOfficialSiteLedger(staging);
  let index =
    opts.index ?? loadLorcanaSetLogoIndex(lorcanaSetLogoCachePath());
  if (!index) {
    index = {
      version: LORCANA_SET_LOGO_CACHE_VERSION,
      language: "fr",
      source: LORCANA_CATALOG_URL,
      fetchedAt: new Date().toISOString(),
      sets: [],
    };
  }

  const byId = new Map(index.sets.map((row) => [row.id, { ...row }]));
  let updated = 0;
  let added = 0;

  const logoFiles = existsSync(logosDir)
    ? readdirSync(logosDir).filter((f) => /\.(png|webp|jpg)$/i.test(f))
    : [];

  for (const file of logoFiles) {
    const setId = path.basename(file, path.extname(file)).toLowerCase();
    if (!/^(set|quest|gateway)\d+$/.test(setId)) continue;
    const src = path.join(logosDir, file);
    if (!isPlausibleWordmarkFile(src)) continue;
    const ext = path.extname(file).toLowerCase() || ".png";
    const destDir = path.join(
      packSealedProductsDir(opts.packId ?? "lorcana"),
      "sets",
      setId,
    );
    mkdirSync(destDir, { recursive: true });
    const dest = path.join(destDir, `logo${ext}`);
    copyFileSync(src, dest);
    const logo = lorcanaSetLogoAssetUrl(setId, ext);
    const page = ledger?.pages.find((p) => p.setId === setId);
    const existing = byId.get(setId);
    const cleanTitle = page?.title?.trim() || null;
    if (existing) {
      byId.set(setId, {
        ...existing,
        logo,
        sourceUrl: page?.logoUrl ?? existing.sourceUrl,
        ...(cleanTitle && !existing.name ? { name: cleanTitle } : {}),
      });
      updated += 1;
    } else {
      const aliases: string[] = [];
      if (cleanTitle) aliases.push(cleanTitle);
      byId.set(setId, {
        id: setId,
        name: cleanTitle ?? setId,
        aliases,
        sourceUrl: page?.logoUrl ?? `official:${setId}`,
        logo,
      });
      added += 1;
    }
  }

  const next: LorcanaSetLogoIndex = {
    ...index,
    version: LORCANA_SET_LOGO_CACHE_VERSION,
    fetchedAt: new Date().toISOString(),
    sets: [...byId.values()].sort((a, b) =>
      a.id.localeCompare(b.id, undefined, { numeric: true }),
    ),
  };
  persistLorcanaSetLogoIndex(next, lorcanaSetLogoCachePath());
  return { updated, added, index: next };
}

/** Wordmark marketing typique ~648×300 ; headers 1920× exclus. */
function isPlausibleWordmarkFile(file: string): boolean {
  try {
    const buf = readFileSync(file);
    if (buf.byteLength < 500 || buf.byteLength > 1_500_000) return false;
    // PNG IHDR width/height at bytes 16–23
    if (buf[0] === 0x89 && buf[1] === 0x50) {
      const width = buf.readUInt32BE(16);
      const height = buf.readUInt32BE(20);
      if (width >= 1600 || height >= 900) return false;
      if (width > 1500 || height > 800) return false;
      if (width < 80 || height < 40) return false;
    }
    return true;
  } catch {
    return false;
  }
}

function slugForOfficialPackshot(
  page: OfficialProductPage,
  kind: string,
  _index: number,
): string {
  // Une seule variante par kind après dédup parse → slug stable.
  return `${page.slug}-${kind}`;
}

/** Évite de dupliquer un SKU déjà fourni par lorcards pour le même set+kind. */
function existingCoversOfficialSku(
  index: ProductsIndexV1,
  page: OfficialProductPage,
  kind: SealedProductEntry["kind"],
): boolean {
  const setId = page.setId?.toLowerCase() ?? null;
  for (const p of Object.values(index.products)) {
    if (p.category === "official-site") continue;
    if (p.kind !== kind) continue;
    if (setId) {
      const code = (p.setCode || "").toLowerCase();
      if (code === setId) return true;
      if (p.catalogueSetId && `set${p.catalogueSetId}` === setId) return true;
      if (setId.startsWith("quest")) {
        const n = setId.replace(/^quest/, "");
        const hay = `${p.slug} ${p.name || ""} ${p.category || ""}`;
        if (new RegExp(`(?:quest|iq|quête)\\s*${n}`, "i").test(hay)) {
          return true;
        }
        if (n === "3" && /miel|hunny/i.test(hay)) return true;
        if (n === "2" && /heist|palais|palace/i.test(hay)) return true;
        if (n === "1" && /trouble|profond/i.test(hay)) return true;
      }
      continue;
    }
    const root = page.slug.replace(/-/g, "");
    const hay = `${p.slug}${p.name || ""}`.replace(/-/g, "").toLowerCase();
    if (root.length > 8 && hay.includes(root)) return true;
  }
  return false;
}

/**
 * Ajoute les packshots officiels absents de lorcards (sans écraser l'index).
 * Source de vérité = ledger `pages.json` (pas les fichiers orphelins du staging).
 */
export function upsertOfficialSiteProducts(opts: {
  stagingDir?: string;
  packId?: string;
  setLogoIndex?: LorcanaSetLogoIndex | null;
} = {}): { written: number; skipped: number } {
  const packId = opts.packId ?? "lorcana";
  const staging = opts.stagingDir ?? officialSiteStagingDir(packId);
  const shotsDir = path.join(staging, "packshots");
  const ledger = readOfficialSiteLedger(staging);
  if (!ledger || !existsSync(shotsDir)) return { written: 0, skipped: 0 };

  const logoIndex =
    opts.setLogoIndex ?? loadLorcanaSetLogoIndex(lorcanaSetLogoCachePath());
  const index = loadProductsIndex(packId);
  let written = 0;
  let skipped = 0;

  for (const page of ledger.pages) {
    for (const [shotIndex, shot] of page.packshots.entries()) {
      if (!shot.kind) {
        skipped += 1;
        continue;
      }
      const kind = shot.kind;
      const ext =
        path.extname(new URL(shot.url).pathname).toLowerCase() || ".png";
      const safeExt = ext === ".jpeg" ? ".jpg" : ext;
      const file = `${page.slug}.${kind}.${shotIndex}${safeExt}`;
      const artSrc = path.join(shotsDir, file);
      if (!existsSync(artSrc)) {
        skipped += 1;
        continue;
      }

      const productSlug = slugForOfficialPackshot(page, kind, shotIndex);
      const key = sealedProductKey(packId, productSlug);
      if (index.products[key]?.image) {
        const existing = index.products[key]!;
        if (!existing.setLogo && page.setId) {
          const setRow = logoIndex?.sets.find((s) => s.id === page.setId);
          if (setRow?.logo) {
            existing.setLogo = setRow.logo;
            if (!existing.catalogueSetId && /^set(\d+)$/.test(page.setId)) {
              existing.catalogueSetId = page.setId.replace(/^set/, "");
            }
            written += 1;
          }
        }
        continue;
      }

      if (existingCoversOfficialSku(index, page, kind)) {
        skipped += 1;
        continue;
      }

      const lang = "fr";
      const destDir = path.join(packSealedProductsDir(packId), productSlug, lang);
      mkdirSync(destDir, { recursive: true });
      const artFile = `art.${SOURCE}${safeExt}`;
      copyFileSync(artSrc, path.join(destDir, artFile));

      const setRow = page.setId
        ? logoIndex?.sets.find((s) => s.id === page.setId)
        : null;
      const name =
        shot.alt?.trim() || page.title || productSlug.replace(/-/g, " ");
      const preview = kind === "booster" || kind === "display";
      const contents = resolveSealedContents({
        kind,
        name,
        slug: productSlug,
        declaredCardCount: null,
      });
      const behavior = sealedBehaviorForKind(kind);
      const contentsKnown = sealedContentsKnown({
        kind,
        containsPrintsIsPreview: preview,
        printCount: 0,
      });
      const layers = resolveContentLayers({
        kind,
        behavior,
        prints: [],
        contentsKnown,
        containsPrintsIsPreview: preview,
      });

      const entry: SealedProductEntry = {
        slug: productSlug,
        path: page.sourceUrl,
        kind,
        behavior,
        category: "official-site",
        name,
        image: assetsPackFileUrl(packId, "products", productSlug, lang, artFile),
        imageBack: null,
        setLogo: setRow?.logo ?? null,
        setCode: page.setId?.toUpperCase() ?? null,
        catalogueSetId: page.setId?.match(/^set(\d+)$/)?.[1] ?? null,
        lang,
        releaseDate: null,
        priceCents: null,
        cardsPerPack: contents.cardsPerPack,
        packsContained: contents.packsContained,
        guaranteedPrints: layers.guaranteedPrints,
        randomPoolScope: layers.randomPoolScope,
        randomPoolPrints: layers.randomPoolPrints,
        declaredCardCount: null,
        setCardCount: null,
        contentsKnown,
        containsPrintsIsPreview: preview,
        prints: [],
      };
      index.products[key] = entry;
      written += 1;
    }
  }

  index.generatedAt = new Date().toISOString();
  const file = packProductsIndexPath(packId);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(index, null, 2)}\n`, "utf8");
  return { written, skipped };
}

export type { LorcanaSetLogoRow };
