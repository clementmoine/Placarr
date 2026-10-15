/**
 * Bleach SCB sealed SKUs — starters Compagnons / Rivaux + booster S1 + display.
 * Decklists: carddass.fr catalogue S1 (Wayback HTML under curated/sources/wayback).
 * Packshots: curated/products + provenance `curated/sources/press-packshots.json`.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { packStagingDir } from "@/lib/packPaths";
import {
  catalogArtefactIsFresh,
  hashCatalogArtefactBytes,
  packCatalogIngestLedgerPath,
  readCatalogIngestLedger,
  recordCatalogPromoteAndPurgeStaging,
} from "@/providers/shared/catalogIngestLedger";
import {
  writeLocalSealedProducts,
  type LocalSealedWrite,
} from "@/providers/shared/sealedProducts/localWrite";
import { installProviderProductsContents } from "@/providers/shared/sealedProducts/curatedContents";
import type { CuratedSealedContentsFile } from "@/providers/shared/sealedProducts/curatedContents";
import type { SealedKind } from "@/providers/shared/sealedProducts/kinds";

import pressPackshotsLedgerJson from "./curated/sources/press-packshots.json";
import { BLEACH_SCB_PACK_ID, bleachScbCuratedDir } from "./pack";
import {
  bleachPrintedToPrintKey,
  parseBleachS1StarterDecks,
} from "./parse/starterDecks";

const SOURCE =
  "http://www.carddass.fr/bleach/catalogue_S1_Bleach.html (Wayback staging bleach-s1.html)";
const VERIFIED = "2026-10-15";
const SEALED_ARTEFACT = "sealed:carddass-fr";
const SEALED_STAGING_REL = "carddass-fr";

type CuratedArtSpec = {
  primary: string;
  source: string;
  extras?: readonly { file: string; source: string }[];
};

/** Face catalogue + dumps secondaires (carddass basse rés., mangaluxe…). */
export const BLEACH_SCB_CURATED_ART: Record<string, CuratedArtSpec> = {
  "starter-compagnons": {
    primary: "compagnons_catalogue.gif",
    source: "carddass-fr",
  },
  "starter-rivaux": {
    primary: "rivaux_ultrajeux.jpg",
    source: "ultrajeux",
    extras: [{ file: "rivaux_catalogue.jpg", source: "carddass-fr" }],
  },
  "booster-s1-shinigami-and-ichigo": {
    primary: "booster_s1_tempslibre.jpg",
    source: "tempslibre",
    extras: [{ file: "booster_s1_05211.jpg", source: "carddass-fr" }],
  },
  "display-s1-shinigami-and-ichigo": {
    primary: "display_s1_ultrajeux.jpg",
    source: "ultrajeux",
  },
};

export function bleachScbPressPackshotLedger() {
  return pressPackshotsLedgerJson;
}

function stagingS1Html(): string | null {
  const p = path.join(
    bleachScbCuratedDir(),
    "sources",
    "wayback",
    "bleach-s1.html",
  );
  if (!existsSync(p)) return null;
  return readFileSync(p, "latin1");
}

function curatedProductArt(name: string): string | null {
  const p = path.join(bleachScbCuratedDir(), "products", name);
  return existsSync(p) ? p : null;
}

function bleachSealedStagingDir(): string {
  return path.join(packStagingDir(BLEACH_SCB_PACK_ID), SEALED_STAGING_REL);
}

/** Stable SSOT — curated packshot bytes (force = re-install). */
export function bleachScbSealedContentHash(): string {
  const parts: Buffer[] = [];
  for (const spec of Object.values(BLEACH_SCB_CURATED_ART)) {
    const abs = curatedProductArt(spec.primary);
    if (abs) parts.push(readFileSync(abs));
    for (const extra of spec.extras ?? []) {
      const extraAbs = curatedProductArt(extra.file);
      if (extraAbs) parts.push(readFileSync(extraAbs));
    }
  }
  const contentsPath = path.join(
    bleachScbCuratedDir(),
    "products-contents.json",
  );
  if (existsSync(contentsPath)) parts.push(readFileSync(contentsPath));
  return hashCatalogArtefactBytes(Buffer.concat(parts));
}

/** Build + write `products-contents.json` from S1 HTML decklists. */
export function buildBleachScbProductsContents(): CuratedSealedContentsFile {
  const html = stagingS1Html() ?? "";
  const decks = parseBleachS1StarterDecks(html);
  const skus: CuratedSealedContentsFile["skus"] = {};

  for (const deck of decks) {
    const guaranteedPrints = deck.lines
      .map((line) => {
        const printKey = bleachPrintedToPrintKey(line.printed);
        if (!printKey) return null;
        return { printKey, qty: line.qty };
      })
      .filter((row): row is { printKey: string; qty: number } => row != null);
    const sum = guaranteedPrints.reduce((n, r) => n + r.qty, 0);
    skus[deck.slug] = {
      source: SOURCE,
      verifiedAt: VERIFIED,
      notes: `${deck.nameFr} — ${sum} cartes (liste Bandai FR ; « 32 + Zanpakutô » sur la fiche). Boosters S1 = 8 cartes, pool set.`,
      cardsPerPack: null,
      packsContained: 1,
      declaredCardCount: sum,
      behavior: "known_bundle",
      randomPoolScope: "none",
      contentsKnown: true,
      containsPrintsIsPreview: false,
      guaranteedPrintKeys: guaranteedPrints.map((r) => r.printKey),
      guaranteedPrints,
    };
  }

  skus["booster-s1-shinigami-and-ichigo"] = {
    source: SOURCE,
    verifiedAt: VERIFIED,
    notes:
      "Booster « Shinigami and Ichigo » — 8 cartes dont 1 spéciale ; pool = 58 cartes booster S1 (pas le set starter). EAN 3296580052110.",
    cardsPerPack: 8,
    packsContained: 1,
    randomPoolScope: "set",
    contentsKnown: false,
    containsPrintsIsPreview: false,
  };

  skus["display-s1-shinigami-and-ichigo"] = {
    source:
      "https://www.ultrajeux.com/produit-1137-bleach-serie-1-shinigami-and-ichigo-3296580052110.html",
    verifiedAt: VERIFIED,
    notes:
      "Boîte display S1 (photo Ultrajeux). Fiche boutique confond EAN sachet — ne pas fusionner avec booster-s1. packsContained inconnu.",
    cardsPerPack: 8,
    packsContained: null,
    randomPoolScope: "set",
    contentsKnown: false,
    containsPrintsIsPreview: false,
  };

  const file: CuratedSealedContentsFile = {
    version: 1,
    pack: BLEACH_SCB_PACK_ID,
    updatedAt: VERIFIED,
    byKind: {
      booster: {
        source: SOURCE,
        verifiedAt: VERIFIED,
        cardsPerPack: 8,
        packsContained: 1,
        randomPoolScope: "set",
        contentsKnown: false,
        notes: "FR S1 : 8 cartes / sachet (Bandai carddass.fr).",
      },
      display: {
        source: SOURCE,
        verifiedAt: VERIFIED,
        cardsPerPack: 8,
        randomPoolScope: "set",
        contentsKnown: false,
        notes: "Display S1 — qty sachets non attestée.",
      },
      deck: {
        source: SOURCE,
        verifiedAt: VERIFIED,
        packsContained: 1,
        randomPoolScope: "none",
        behavior: "known_bundle",
        contentsKnown: false,
        notes: "Listes SKU sous skus.* quand attestées.",
      },
    },
    skus,
  };

  const outPath = path.join(bleachScbCuratedDir(), "products-contents.json");
  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(file, null, 2)}\n`);
  return file;
}

export function ingestBleachScbSealedProducts(
  opts: { force?: boolean } = {},
): {
  pack: string;
  written: number;
  skipped: number;
  file: string;
} {
  const contents = buildBleachScbProductsContents();
  installProviderProductsContents(
    BLEACH_SCB_PACK_ID,
    path.join(bleachScbCuratedDir(), "products-contents.json"),
  );

  const contentHash = bleachScbSealedContentHash();
  const stagingPath = bleachSealedStagingDir();
  if (
    !opts.force &&
    catalogArtefactIsFresh(
      readCatalogIngestLedger(packCatalogIngestLedgerPath(BLEACH_SCB_PACK_ID)),
      SEALED_ARTEFACT,
      contentHash,
    )
  ) {
    // Already durable — drop any leftover staging copies.
    if (existsSync(stagingPath)) {
      recordCatalogPromoteAndPurgeStaging({
        ledgerPath: packCatalogIngestLedgerPath(BLEACH_SCB_PACK_ID),
        artefactId: SEALED_ARTEFACT,
        contentHash,
        stagingPath,
      });
    }
    return {
      pack: BLEACH_SCB_PACK_ID,
      written: 0,
      skipped: Object.keys(BLEACH_SCB_CURATED_ART).length,
      file: "",
    };
  }

  const products: LocalSealedWrite[] = [];

  const meta: Array<{
    slug: string;
    kind: SealedKind;
    category: string;
    name: string;
    cardsPerPack: number | null;
    packsContained: number | null;
    path?: string;
  }> = [
    {
      slug: "starter-compagnons",
      kind: "deck",
      category: "starter-deck",
      name: 'Bleach SCB S1 — Starter "Compagnons"',
      cardsPerPack: contents.skus["starter-compagnons"]?.declaredCardCount ?? 33,
      packsContained: 1,
    },
    {
      slug: "starter-rivaux",
      kind: "deck",
      category: "starter-deck",
      name: 'Bleach SCB S1 — Starter "Rivaux"',
      cardsPerPack: contents.skus["starter-rivaux"]?.declaredCardCount ?? 33,
      packsContained: 1,
      path: "https://www.ultrajeux.com/produit-1138-bleach-serie-1-shinigami-and-ichigo-starter-rivaux.html",
    },
    {
      slug: "booster-s1-shinigami-and-ichigo",
      kind: "booster",
      category: "boosters",
      name: 'Bleach SCB S1 — Booster "Shinigami and Ichigo"',
      cardsPerPack: 8,
      packsContained: 1,
      path: "https://www.tempslibrenet.com/fr/autres-jcc-en-francais/659-bleach-booster-shinigami-ichigo-vf-3296580052110.html",
    },
    {
      slug: "display-s1-shinigami-and-ichigo",
      kind: "display",
      category: "booster-box",
      name: 'Bleach SCB S1 — Display "Shinigami and Ichigo"',
      cardsPerPack: 8,
      packsContained: null,
      path: "https://www.ultrajeux.com/produit-1137-bleach-serie-1-shinigami-and-ichigo-3296580052110.html",
    },
  ];

  for (const row of meta) {
    const art = BLEACH_SCB_CURATED_ART[row.slug];
    if (!art) continue;
    const artPath = curatedProductArt(art.primary);
    if (!artPath) continue;
    const extraDumps = (art.extras ?? [])
      .map((extra) => {
        const p = curatedProductArt(extra.file);
        return p ? { source: extra.source, artPath: p } : null;
      })
      .filter((x): x is { source: string; artPath: string } => x != null);
    products.push({
      slug: row.slug,
      kind: row.kind,
      category: row.category,
      name: row.name,
      source: art.source,
      setCode: "s1",
      catalogueSetId: "s",
      lang: "fr",
      releaseDate: "2008",
      declaredCardCount: row.kind === "deck" ? row.cardsPerPack : null,
      cardsPerPack: row.cardsPerPack,
      packsContained: row.packsContained,
      path: row.path ?? SOURCE,
      artPath,
      ...(extraDumps.length ? { extraDumps } : {}),
    });
  }

  if (!products.length) {
    return {
      pack: BLEACH_SCB_PACK_ID,
      written: 0,
      skipped: meta.length,
      file: "",
    };
  }

  return writeLocalSealedProducts({
    packId: BLEACH_SCB_PACK_ID,
    source: "carddass-fr",
    products,
    purgeStaging: {
      artefactId: SEALED_ARTEFACT,
      stagingPath,
      contentHash,
    },
  });
}
