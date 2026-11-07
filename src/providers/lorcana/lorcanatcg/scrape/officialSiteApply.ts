/**
 * Applique le harvest `www.disneylorcana.com` : logos d'extension + SKU manquants.
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  unlinkSync,
} from "node:fs";
import path from "node:path";

import { assetsSealedProductRoleUrl } from "@/lib/packAssetUrls";
import { writeSealedProductFaceDecision } from "@/providers/shared/sealedProducts/resolveProductFace";
import { packSealedProductsDir } from "@/lib/packPaths";
import {
  sealedProductKey,
  type ProductsIndexV1,
  type SealedProductEntry,
} from "@/providers/shared/sealedProducts/indexFormat";
import {
  sealedBehaviorForKind,
  sealedContentsKnown,
  sealedKindIsOpaqueContents,
} from "@/providers/shared/sealedProducts/kinds";
import { resolveContentLayers } from "@/providers/shared/sealedProducts/contentLayers";
import {
  loadSealedProductsIndex,
  persistSealedProductsIndexDoc,
} from "@/providers/shared/sealedProducts/persistProductsIndex";
import { backfillSealedProductSetLogos } from "@/providers/shared/sealedProducts/backfillLogos";
import { resolveSealedContents } from "@/core/collect/sealedContents";

import {
  inferLangFromPackshotUrl,
  inferPackshotKind,
  officialProductDisplayName,
  officialSetIdToSetCode,
  officialSiteStagingDir,
  readOfficialSiteLedger,
  type OfficialProductPage,
} from "./officialSite";
import {
  lorcanaCatalogueSetIdForProduct,
  lorcanaLogoUrlForSet,
  lorcanaSetLogoAssetUrl,
  loadLorcanaSetLogoIndex,
  lorcanaSetLogoCachePath,
  persistLorcanaSetLogoIndex,
  type LorcanaSetLogoIndex,
  type LorcanaSetLogoRow,
  LORCANA_SET_LOGO_CACHE_VERSION,
  LORCANA_CATALOG_URL,
} from "../sources/setLogos";

const SOURCE = "disneysite";

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
  const ledger = readOfficialSiteLedger(staging, opts.packId ?? "lorcana");
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
  lang: string,
): string {
  const base = `${page.slug}-${kind}`;
  // FR keeps the historical slug so existing lorcards-cover checks still match.
  return lang === "fr" ? base : `${base}-${lang}`;
}

/**
 * SKU boutique déjà présent pour le même set+kind+lang (évite un doublon
 * official-site). Retourne l'entrée pour éventuellement y coller le packshot
 * officiel (gift boxes, etc.).
 */
function findCoveringShopSku(
  index: ProductsIndexV1,
  page: OfficialProductPage,
  kind: SealedProductEntry["kind"],
  lang: string,
): SealedProductEntry | null {
  const setId = page.setId?.toLowerCase() ?? null;
  const want = lang.toLowerCase();
  for (const p of Object.values(index.products)) {
    if (p.category === "official-site") continue;
    /*
      Shop FR quest covers an official mint even when the packshot was classed
      as trove (CMS folder name) — same product family, don't double-count.
    */
    const kindOk =
      p.kind === kind ||
      (Boolean(setId?.startsWith("quest")) &&
        p.kind === "quest" &&
        (kind === "quest" || kind === "trove"));
    if (!kindOk) continue;
    const pLang = (p.lang ?? "").trim().toLowerCase();
    // Unknown-lang shop rows only cover FR official upserts.
    if (pLang && pLang !== want) continue;
    if (!pLang && want !== "fr") continue;
    if (setId) {
      const code = (p.setCode || "").toLowerCase();
      if (code === setId) return p;
      if (p.catalogueSetId && `set${p.catalogueSetId}` === setId) return p;
      if (setId.startsWith("quest")) {
        const n = setId.replace(/^quest/, "");
        const hay = `${p.slug} ${p.name || ""} ${p.category || ""}`;
        if (new RegExp(`(?:quest|iq|quête)\\s*${n}`, "i").test(hay)) {
          return p;
        }
        if (n === "3" && /miel|hunny/i.test(hay)) return p;
        if (n === "2" && /heist|palais|palace/i.test(hay)) return p;
        if (n === "1" && /trouble|profond/i.test(hay)) return p;
      }
      continue;
    }
    const root = page.slug.replace(/-/g, "");
    const hay = `${p.slug}${p.name || ""}`.replace(/-/g, "").toLowerCase();
    if (root.length > 8 && hay.includes(root)) return p;
  }
  return null;
}

/**
 * CMS website headers / key art (1920×1080, 1080×1350, …) — not a packshot.
 * Used to upgrade a bad early harvest when the ledger now has a product-shot.
 */
export function officialArtLooksLikeCmsHero(filePath: string): boolean {
  const size = readRasterSizeSync(filePath);
  if (!size) return false;
  const { width: w, height: h } = size;
  if (w === 1920 && h === 1080) return true;
  if (w === 1080 && (h === 1350 || h === 1375)) return true;
  // Wide cinematic banners (e.g. 1920×800-ish) — never product box shots.
  if (w >= 1600 && w / h >= 1.6) return true;
  return false;
}

function readRasterSizeSync(
  filePath: string,
): { width: number; height: number } | null {
  try {
    const buf = readFileSync(filePath);
    if (buf.length >= 24 && buf[0] === 0x89 && buf[1] === 0x50) {
      return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
    }
    if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
      let i = 2;
      while (i < buf.length - 9) {
        if (buf[i] !== 0xff) {
          i += 1;
          continue;
        }
        const marker = buf[i + 1]!;
        if (marker === 0xd9 || marker === 0xda) break;
        const len = buf.readUInt16BE(i + 2);
        if (
          marker >= 0xc0 &&
          marker <= 0xcf &&
          marker !== 0xc4 &&
          marker !== 0xc8 &&
          marker !== 0xcc
        ) {
          return {
            height: buf.readUInt16BE(i + 5),
            width: buf.readUInt16BE(i + 7),
          };
        }
        i += 2 + len;
      }
    }
  } catch {
    return null;
  }
  return null;
}

function isOfficialProductShotAlt(alt: string | null | undefined): boolean {
  return /product[-_]?shot|components|product\s*image/i.test(alt ?? "");
}

function shouldInstallOfficialProductShot(opts: {
  stagingArt: string;
  entry: SealedProductEntry;
  packId: string;
  lang: string;
}): boolean {
  const image = opts.entry.image?.trim() || "";
  if (!image) return true;
  if (/website header/i.test(opts.entry.name || "")) return true;
  if (!/disneysite/i.test(image)) return true;
  const durable = resolveDurableOfficialArtPath(
    opts.packId,
    opts.entry.slug,
    (opts.entry.lang || opts.lang).trim() || opts.lang,
  );
  return Boolean(durable && officialArtLooksLikeCmsHero(durable));
}

function installOfficialArtOnEntry(opts: {
  packId: string;
  entry: SealedProductEntry;
  lang: string;
  stagingArt: string;
  safeExt: string;
}): void {
  const destLang = (opts.entry.lang || opts.lang).trim() || opts.lang;
  const destDir = path.join(
    packSealedProductsDir(opts.packId),
    opts.entry.slug,
    destLang,
  );
  mkdirSync(destDir, { recursive: true });
  const artFile = `art.${SOURCE}${opts.safeExt}`;
  const dest = path.join(destDir, artFile);
  // Drop sibling hero harvests (e.g. art.disneysite.jpg → .png product-shot).
  const prefix = `art.${SOURCE}.`;
  for (const file of readdirSync(destDir)) {
    if (
      file.startsWith(prefix) &&
      file !== artFile &&
      /\.(png|webp|jpe?g)$/i.test(file)
    ) {
      try {
        unlinkSync(path.join(destDir, file));
      } catch {
        /* ignore */
      }
    }
  }
  copyFileSync(opts.stagingArt, dest);
  writeSealedProductFaceDecision(destDir, { art: artFile });
  opts.entry.image = assetsSealedProductRoleUrl(
    opts.packId,
    opts.entry.slug,
    destLang,
    "face",
  );
}

/** `art.disneysite.*` already installed under `products/{slug}/{lang}/`. */
function findDurableOfficialArt(
  packId: string,
  productSlug: string,
  lang: string,
): string | null {
  const dir = path.join(packSealedProductsDir(packId), productSlug, lang);
  if (!existsSync(dir)) return null;
  const prefix = `art.${SOURCE}.`;
  const hit = readdirSync(dir)
    .filter((f) => f.startsWith(prefix) && /\.(png|webp|jpe?g)$/i.test(f))
    .sort()[0];
  return hit ?? null;
}

function resolveDurableOfficialArtPath(
  packId: string,
  productSlug: string,
  lang: string,
): string | null {
  const name = findDurableOfficialArt(packId, productSlug, lang);
  if (!name) return null;
  return path.join(packSealedProductsDir(packId), productSlug, lang, name);
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
  // Ledger falls back to durable pages.json — staging is purged after promote.
  const ledger = readOfficialSiteLedger(staging, packId);
  if (!ledger) return { written: 0, skipped: 0 };

  const logoIndex =
    opts.setLogoIndex ?? loadLorcanaSetLogoIndex(lorcanaSetLogoCachePath());
  const index = loadSealedProductsIndex(packId);
  let written = 0;
  let skipped = 0;

  for (const page of ledger.pages) {
    const pageLang = (page.lang ?? "fr").toLowerCase();
    for (const [shotIndex, shot] of page.packshots.entries()) {
      /*
        Re-inférer : un ledger durable peut encore porter un playmat classé
        `collector_box` via l'ancien catch-all `product-photography`.
      */
      const kind =
        inferPackshotKind(shot.alt, shot.url, { setId: page.setId }) ?? null;
      if (!kind) {
        if (shot.kind) {
          const dropLang =
            inferLangFromPackshotUrl(shot.url) ?? pageLang;
          const dropSlug = slugForOfficialPackshot(page, shot.kind, dropLang);
          const dropKey = sealedProductKey(packId, dropSlug);
          const drop = index.products[dropKey];
          if (drop?.category === "official-site") {
            delete index.products[dropKey];
            written += 1;
          }
        }
        skipped += 1;
        continue;
      }
      const lang =
        inferLangFromPackshotUrl(shot.url) ?? pageLang;
      const ext =
        path.extname(new URL(shot.url).pathname).toLowerCase() || ".png";
      const safeExt = ext === ".jpeg" ? ".jpg" : ext;
      const file = `${page.slug}.${kind}.${shotIndex}.${lang}${safeExt}`;
      const legacyFile = `${page.slug}.${kind}.${shotIndex}${safeExt}`;
      const productSlug = slugForOfficialPackshot(page, kind, lang);
      // Prefer fresh staging bytes; else art already installed durably.
      const stagingArt = existsSync(path.join(shotsDir, file))
        ? path.join(shotsDir, file)
        : existsSync(path.join(shotsDir, legacyFile))
          ? path.join(shotsDir, legacyFile)
          : null;
      const durableArtFile = stagingArt
        ? null
        : findDurableOfficialArt(packId, productSlug, lang);
      if (!stagingArt && !durableArtFile) {
        skipped += 1;
        continue;
      }
      const key = sealedProductKey(packId, productSlug);
      const isProductShot = isOfficialProductShotAlt(shot.alt);
      if (index.products[key]?.image) {
        const existing = index.products[key]!;
        let touched = false;
        const displayName = officialProductDisplayName({
          pageTitle: page.title,
          packshotAlt: shot.alt,
          pageSlug: page.slug,
        });
        const pageTitle = page.title?.trim() || "";
        if (
          displayName &&
          existing.name !== displayName &&
          (!existing.name ||
            existing.name === pageTitle ||
            existing.name === shot.alt?.trim() ||
            /cards of .+ next to each other/i.test(existing.name) ||
            /website header/i.test(existing.name))
        ) {
          existing.name = displayName;
          touched = true;
        }
        // Replace a bad hero harvest with the real product-shot.
        if (
          stagingArt &&
          isProductShot &&
          shouldInstallOfficialProductShot({
            stagingArt,
            entry: existing,
            packId,
            lang,
          })
        ) {
          installOfficialArtOnEntry({
            packId,
            entry: existing,
            lang,
            stagingArt,
            safeExt,
          });
          touched = true;
        }
        if (!existing.setLogo) {
          const fromSet = page.setId
            ? logoIndex?.sets.find((s) => s.id === page.setId)?.logo
            : null;
          const fromResolve = lorcanaLogoUrlForSet({
            setCode: page.setId,
            slug: page.slug,
            name: page.title,
            index: logoIndex,
          });
          const logo = fromSet ?? fromResolve ?? page.logoUrl ?? null;
          if (logo) {
            existing.setLogo = logo;
            if (!existing.catalogueSetId) {
              const numbered = page.setId?.match(/^set(\d+)$/);
              if (numbered) existing.catalogueSetId = numbered[1]!;
              else {
                const resolved = lorcanaCatalogueSetIdForProduct({
                  setCode: page.setId,
                  slug: page.slug,
                  name: page.title,
                  index: logoIndex,
                });
                if (resolved) existing.catalogueSetId = resolved;
              }
            }
            touched = true;
          }
        }
        if (page.contents?.packsContained != null && !existing.packsContained) {
          existing.packsContained = page.contents.packsContained;
          touched = true;
        }
        if (touched) written += 1;
        continue;
      }

      const cover = findCoveringShopSku(index, page, kind, lang);
      if (cover) {
        if (
          stagingArt &&
          isProductShot &&
          shouldInstallOfficialProductShot({
            stagingArt,
            entry: cover,
            packId,
            lang,
          })
        ) {
          installOfficialArtOnEntry({
            packId,
            entry: cover,
            lang,
            stagingArt,
            safeExt,
          });
          if (page.title?.trim() && /website header/i.test(cover.name || "")) {
            cover.name = page.title.trim();
          }
          if (page.contents?.packsContained != null && !cover.packsContained) {
            cover.packsContained = page.contents.packsContained;
          }
          written += 1;
        } else {
          skipped += 1;
        }
        continue;
      }

      const destDir = path.join(packSealedProductsDir(packId), productSlug, lang);
      mkdirSync(destDir, { recursive: true });
      const artFile = stagingArt
        ? `art.${SOURCE}${safeExt}`
        : durableArtFile!;
      if (stagingArt) copyFileSync(stagingArt, path.join(destDir, artFile));

      const setRow = page.setId
        ? logoIndex?.sets.find((s) => s.id === page.setId)
        : null;
      const setLogo =
        setRow?.logo ??
        lorcanaLogoUrlForSet({
          setCode: page.setId,
          slug: page.slug,
          name: page.title,
          index: logoIndex,
        }) ??
        page.logoUrl ??
        null;
      const catalogueSetId =
        page.setId?.match(/^set(\d+)$/)?.[1] ??
        lorcanaCatalogueSetIdForProduct({
          setCode: page.setId,
          slug: page.slug,
          name: page.title,
          index: logoIndex,
        });
      const name = officialProductDisplayName({
        pageTitle: page.title,
        packshotAlt: shot.alt,
        pageSlug: page.slug,
      });
      const preview = sealedKindIsOpaqueContents(kind);
      const declaredFromPage = page.contents?.declaredCardCount ?? null;
      const contents = resolveSealedContents({
        kind,
        name,
        slug: productSlug,
        declaredCardCount: declaredFromPage,
      });
      // Official « Contents Include » / body (polluted FR lists already filtered).
      const packsFromPage = page.contents?.packsContained ?? null;
      const cardsFromPage = page.contents?.cardsPerPack ?? null;
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
        image: assetsSealedProductRoleUrl(packId, productSlug, lang, "face"),
        imageBack: null,
        setLogo,
        setCode: officialSetIdToSetCode(page.setId),
        catalogueSetId,
        lang,
        releaseDate: null,
        priceCents: null,
        cardsPerPack: cardsFromPage ?? contents.cardsPerPack,
        packsContained: packsFromPage ?? contents.packsContained,
        guaranteedPrints: layers.guaranteedPrints,
        randomPoolScope: layers.randomPoolScope,
        randomPoolPrints: layers.randomPoolPrints,
        declaredCardCount: declaredFromPage,
        setCardCount: null,
        contentsKnown,
        containsPrintsIsPreview: preview,
        prints: [],
      };
      index.products[key] = entry;
      written += 1;
    }
  }

  written += backfillSealedProductSetLogos(packId, index.products);

  index.generatedAt = new Date().toISOString();
  persistSealedProductsIndexDoc(index, { alreadyMerged: false });
  return { written, skipped };
}

export type { LorcanaSetLogoRow };
