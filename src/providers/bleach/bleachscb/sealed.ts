/**
 * Bleach SCB sealed SKUs — starters Compagnons / Rivaux + booster S1 + display.
 * Decklists: carddass.fr catalogue S1 (Wayback HTML under curated/sources/wayback).
 * Packshots: curated/products + provenance `data/bleach/scb/sources/press-packshots.json`.
 */
import { existsSync, readFileSync } from "node:fs";
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
import {
  writeInstalledProductsContents,
  type CuratedSealedContentsFile,
} from "@/providers/shared/sealedProducts/curatedContents";
import type { SealedKind } from "@/providers/shared/sealedProducts/kinds";

import {
  BLEACH_SCB_PACK_ID,
  bleachScbCuratedDir,
  bleachScbSyncedSourcePath,
  bleachScbSourcePath,
} from "./pack";
import { bleachScbPrintKey } from "./printKey";
import {
  bleachPrintedToPrintKey,
  parseBleachS1StarterDecks,
} from "./parse/starterDecks";

const pressPackshotsLedgerJson = JSON.parse(
  readFileSync(bleachScbSourcePath("press-packshots.json"), "utf8"),
) as {
  products: Array<{ ingest?: boolean; host?: string; [key: string]: unknown }>;
};

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
    primary: "compagnons_adilsons.jpg",
    source: "adilsons",
    extras: [
      { file: "compagnons_catalogue.gif", source: "carddass-fr" },
      { file: "compagnons_ultrajeux.jpg", source: "ultrajeux" },
    ],
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

/**
 * FR S1 booster lottery — letter sets a/c/e/z (âmes, combat, événements,
 * zanpakutô). Never JA set `s` (Soul nikita) : FR SKUs must not resolve to
 * 黒崎 titles. Bandai announces 58 booster-available cards; ledger has 69
 * non-promo FR printKeys — exact starter-only vs booster split not keyed yet.
 */
export function bleachFrS1BoosterPoolPrintKeys(): string[] {
  const ledgerPath = bleachScbSyncedSourcePath("carddass-fr-bleach.json");
  if (!existsSync(ledgerPath)) return [];
  try {
    const raw = JSON.parse(readFileSync(ledgerPath, "utf8")) as {
      cards?: Array<{ set?: string; number?: string; type?: string }>;
    };
    const cards = Array.isArray(raw.cards) ? raw.cards : [];
    const keys = new Set<string>();
    for (const card of cards) {
      const set = card.set?.trim().toLowerCase() ?? "";
      const number = card.number?.trim() ?? "";
      if (!set || !number) continue;
      if (set === "p" || card.type === "promo") continue;
      if (!/^[acez]$/.test(set)) continue;
      const printKey = bleachScbPrintKey(set, number);
      if (printKey) keys.add(printKey);
    }
    return [...keys].sort();
  } catch {
    return [];
  }
}

/**
 * Build S1 decklists → `data/<pack>/curated/products-contents.json`.
 * Does not rewrite the git seed under `providers/.../curated/`.
 */
export function buildBleachScbProductsContents(): CuratedSealedContentsFile {
  const html = stagingS1Html() ?? "";
  const decks = parseBleachS1StarterDecks(html);
  const skus: CuratedSealedContentsFile["skus"] = {};
  const boosterPool = bleachFrS1BoosterPoolPrintKeys();

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
      notes: `${deck.nameFr} — ${sum} cartes (liste Bandai FR ; « 32 + Zanpakutô » sur la fiche). Boosters S1 = 8 cartes, pool FR listé.`,
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
      `Booster « Shinigami and Ichigo » — 8 cartes dont 1 spéciale. EAN 3296580052110. Pool loterie = corpus FR S1 hors promos (${boosterPool.length} printKeys a/c/e/z) ; Bandai annonce 58 cartes booster — découpe starter-only non attestée carte-à-carte. Pas le set JA « s ».`,
    cardsPerPack: 8,
    packsContained: 1,
    randomPoolScope: "listed",
    randomPoolPrintKeys: boosterPool,
    contentsKnown: false,
    containsPrintsIsPreview: false,
  };

  skus["display-s1-shinigami-and-ichigo"] = {
    source:
      "https://collectthemall.be/autres-tcg/29--fr-bleach-display-serie-1-shinigami-and-ichigo-x24.html",
    verifiedAt: VERIFIED,
    notes:
      "Boîte display S1 — 24 boosters × 8 (collectthemall « x24 »). Photo Ultrajeux ; fiche boutique confond EAN sachet — ne pas fusionner avec booster-s1. Loterie = sachets enfants.",
    cardsPerPack: 8,
    packsContained: 24,
    behavior: "pack_container",
    randomPoolScope: "none",
    contentsKnown: false,
    containsPrintsIsPreview: false,
    guaranteedProducts: [{ slug: "booster-s1-shinigami-and-ichigo" }],
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
        randomPoolScope: "listed",
        contentsKnown: false,
        notes: "FR S1 : 8 cartes / sachet (Bandai carddass.fr).",
      },
      display: {
        source:
          "https://collectthemall.be/autres-tcg/29--fr-bleach-display-serie-1-shinigami-and-ichigo-x24.html",
        verifiedAt: VERIFIED,
        cardsPerPack: 8,
        packsContained: 24,
        behavior: "pack_container",
        randomPoolScope: "none",
        contentsKnown: false,
        notes: "Display S1 — 24 sachets (collectthemall) ; loterie dans les boosters.",
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

  writeInstalledProductsContents(BLEACH_SCB_PACK_ID, file);
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
      path: "https://adilsons.mu/products/bleach-serie-1-compagnons",
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
      packsContained: 24,
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
      // FR retail S1 — not JA catalogue set `s` (would expand nikita Soul titles).
      catalogueSetId: null,
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
