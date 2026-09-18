/**
 * Bleach SCB sealed SKUs — starters Compagnons / Rivaux + booster S1.
 * Decklists: carddass.fr catalogue S1 (Wayback staging HTML).
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import {
  writeLocalSealedProducts,
  type LocalSealedWrite,
} from "@/providers/shared/sealedProducts/localWrite";
import { installProviderProductsContents } from "@/providers/shared/sealedProducts/curatedContents";
import type { CuratedSealedContentsFile } from "@/providers/shared/sealedProducts/curatedContents";

import { BLEACH_SCB_PACK_ID, bleachScbCuratedDir } from "./pack";
import {
  bleachPrintedToPrintKey,
  parseBleachS1StarterDecks,
} from "./parse/starterDecks";

const SOURCE =
  "http://www.carddass.fr/bleach/catalogue_S1_Bleach.html (Wayback staging bleach-s1.html)";
const VERIFIED = "2026-09-13";

function stagingS1Html(): string | null {
  const p = path.join(
    process.cwd(),
    "data/staging/carddass-wayback-scout/pages/bleach-s1.html",
  );
  if (!existsSync(p)) return null;
  return readFileSync(p, "latin1");
}

function curatedProductArt(name: string): string | null {
  const p = path.join(bleachScbCuratedDir(), "products", name);
  return existsSync(p) ? p : null;
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
      "Booster « Shinigami and Ichigo » — 8 cartes dont 1 spéciale ; pool = 58 cartes booster S1 (pas le set starter).",
    cardsPerPack: 8,
    packsContained: 1,
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

export function ingestBleachScbSealedProducts(): {
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

  const stagingDir = path.join(
    process.cwd(),
    "data",
    "bleach",
    "scb",
    "staging",
    "carddass-fr",
  );
  mkdirSync(stagingDir, { recursive: true });

  const products: LocalSealedWrite[] = [];

  const artMap: Record<string, string | null> = {
    "starter-compagnons": curatedProductArt("compagnons_catalogue.gif"),
    "starter-rivaux": curatedProductArt("rivaux_catalogue.jpg"),
    "booster-s1-shinigami-and-ichigo": curatedProductArt(
      "booster_s1_05211.jpg",
    ),
  };

  const meta: Array<{
    slug: string;
    kind: "deck" | "booster";
    category: string;
    name: string;
    cardsPerPack: number | null;
  }> = [
    {
      slug: "starter-compagnons",
      kind: "deck",
      category: "starter-deck",
      name: 'Bleach SCB S1 — Starter "Compagnons"',
      cardsPerPack: contents.skus["starter-compagnons"]?.declaredCardCount ?? 33,
    },
    {
      slug: "starter-rivaux",
      kind: "deck",
      category: "starter-deck",
      name: 'Bleach SCB S1 — Starter "Rivaux"',
      cardsPerPack: contents.skus["starter-rivaux"]?.declaredCardCount ?? 33,
    },
    {
      slug: "booster-s1-shinigami-and-ichigo",
      kind: "booster",
      category: "boosters",
      name: 'Bleach SCB S1 — Booster "Shinigami and Ichigo"',
      cardsPerPack: 8,
    },
  ];

  for (const row of meta) {
    const art = artMap[row.slug];
    if (!art) continue;
    const dest = path.join(stagingDir, path.basename(art));
    if (!existsSync(dest)) copyFileSync(art, dest);
    products.push({
      slug: row.slug,
      kind: row.kind,
      category: row.category,
      name: row.name,
      source: "carddass-fr",
      setCode: "s1",
      catalogueSetId: "s1",
      lang: "fr",
      releaseDate: "2008",
      declaredCardCount: row.cardsPerPack,
      cardsPerPack: row.kind === "booster" ? 8 : row.cardsPerPack,
      packsContained: 1,
      path: SOURCE,
      artPath: dest,
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
  });
}
