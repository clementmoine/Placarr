/**
 * Écrire `products-index.json` + copies locales pour un catalogue qui a
 * déjà les octets (staging, ledger). Ce n'est pas l'ingest TCG Cards :
 * pas de listings boutique. L'index pointe un packshot ; les autres hôtes
 * restent `art.<source>.*` à côté (`extraDumps`).
 *
 * Wrapper, display, album : des **produits**. Une face de carte ne s'y
 * pose pas.
 */
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { assetsPackFileUrl } from "@/lib/packAssetUrls";
import { packProductsIndexPath, packSealedProductsDir } from "@/lib/packPaths";

import {
  emptyProductsIndex,
  sealedProductKey,
  type SealedProductEntry,
} from "./indexFormat";
import {
  sealedBehaviorForKind,
  sealedContentsKnown,
  type SealedKind,
} from "./kinds";

export type LocalSealedWrite = {
  slug: string;
  kind: SealedKind;
  category: string;
  name: string;
  setCode: string | null;
  catalogueSetId?: string | null;
  lang: string;
  releaseDate: string | null;
  declaredCardCount: number | null;
  setCardCount?: number | null;
  /** Fiche éditeur / page produit, pas une URL d'archive. */
  path?: string;
  /** Octets du packshot, déjà sur disque. Absent = SKU sauté. */
  artPath: string | null;
  logoPath?: string | null;
  imageBackPath?: string | null;
  /**
   * Autres hôtes, copiés à côté. L'index continue d'afficher `artPath`.
   * Un dump Coleka à côté d'un `art.reconstructed` n'est pas un 2ᵉ SKU.
   */
  extraDumps?: readonly {
    source: string;
    artPath?: string | null;
    imageBackPath?: string | null;
  }[];
};

export type WriteLocalSealedResult = {
  pack: string;
  written: number;
  skipped: number;
  file: string;
};

function storedName(
  role: "art" | "logo" | "back",
  source: string,
  src: string,
): string {
  const ext = path.extname(src).toLowerCase() || ".jpg";
  return `${role}.${source}${ext === ".jpeg" ? ".jpg" : ext}`;
}

function installRole(
  destDir: string,
  role: "art" | "logo" | "back",
  source: string,
  src: string | null | undefined,
): string | null {
  if (!src || !existsSync(src)) return null;
  mkdirSync(destDir, { recursive: true });
  const name = storedName(role, source, src);
  copyFileSync(src, path.join(destDir, name));
  return name;
}

export function writeLocalSealedProducts(input: {
  packId: string;
  /** Marque le dump : `art.inkworks.jpg`. */
  source: string;
  products: readonly LocalSealedWrite[];
}): WriteLocalSealedResult {
  const index = emptyProductsIndex(input.packId);
  const destRoot = packSealedProductsDir(input.packId);
  mkdirSync(destRoot, { recursive: true });
  let skipped = 0;

  for (const spec of input.products) {
    const langFolder = spec.lang.trim().toLowerCase();
    const destDir = path.join(destRoot, spec.slug, langFolder);
    const artFile = installRole(destDir, "art", input.source, spec.artPath);
    if (!artFile) {
      skipped += 1;
      continue;
    }
    const logoFile = installRole(destDir, "logo", input.source, spec.logoPath);
    const backFile = installRole(
      destDir,
      "back",
      input.source,
      spec.imageBackPath,
    );
    for (const extra of spec.extraDumps ?? []) {
      installRole(destDir, "art", extra.source, extra.artPath);
      installRole(destDir, "back", extra.source, extra.imageBackPath);
    }
    const preview = spec.kind === "booster" || spec.kind === "display";
    const entry: SealedProductEntry = {
      slug: spec.slug,
      path: spec.path ?? "",
      kind: spec.kind,
      behavior: sealedBehaviorForKind(spec.kind),
      category: spec.category,
      name: spec.name,
      image: assetsPackFileUrl(
        input.packId,
        "products",
        spec.slug,
        langFolder,
        artFile,
      ),
      imageBack: backFile
        ? assetsPackFileUrl(
            input.packId,
            "products",
            spec.slug,
            langFolder,
            backFile,
          )
        : null,
      setLogo: logoFile
        ? assetsPackFileUrl(
            input.packId,
            "products",
            spec.slug,
            langFolder,
            logoFile,
          )
        : null,
      setCode: spec.setCode,
      catalogueSetId: spec.catalogueSetId ?? spec.setCode,
      lang: spec.lang,
      releaseDate: spec.releaseDate,
      declaredCardCount: spec.declaredCardCount,
      setCardCount: spec.setCardCount ?? null,
      contentsKnown: sealedContentsKnown({
        kind: spec.kind,
        containsPrintsIsPreview: preview,
        printCount: 0,
      }),
      containsPrintsIsPreview: preview,
      prints: [],
    };
    index.products[sealedProductKey(input.packId, spec.slug)] = entry;
  }

  const file = packProductsIndexPath(input.packId);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(index, null, 2)}\n`, "utf8");
  return {
    pack: input.packId,
    written: Object.keys(index.products).length,
    skipped,
    file,
  };
}
