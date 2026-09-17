/**
 * Moisson dbzcollection.fr — Dragon Ball Cartes À Jouer Et À Collectionner (Bandai France 2005-2009).
 *
 * HTTP CMS : `shared/dbzcollection/site`. Ici : 12 parts (idc=1), HD h3000,
 * fiches TCG, groupings pouvoir caché, install prints + scellés.
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { packCardsDir, packStagingDir } from "@/lib/packPaths";
import type {
  LocalPrintsIndex,
  LocalPrintWrite,
} from "@/providers/shared/cardCatalogue/localPrintsIndex";
import {
  downloadDbzcImage,
  fetchDbzcText,
  loadDbzcListingHtml,
} from "@/providers/shared/dbzcollection/site";
import type { SealedKind } from "@/providers/shared/sealedProducts/kinds";
import {
  writeLocalSealedProducts,
  type LocalSealedWrite,
} from "@/providers/shared/sealedProducts/localWrite";

import { DBS_JCC_PACK_ID, dbsJccCuratedDir } from "./pack";
import {
  DBZC_COLLECTION_IDC,
  dbzcAbsoluteUrl,
  dbzcCardInfoUrl,
  dbzcPackInfoUrl,
  dbzcSetListingUrl,
  parseDbzcCardDetail,
  parseDbzcollectionListing,
  parseDbzcPackDetail,
  type DbzcCardDetail,
  type DbzcCardTile,
  type DbzcPackDetail,
  type DbzcPackTile,
} from "./parseDbzcollection";
import {
  dbsjccPrintKey,
  dbsjccSetLabel,
  formatDbsjccReference,
  normalizeGrouping,
  parseDbsjccNumber,
} from "./printKey";

const LEDGER_FILE = "dbzcollection.json";
const STAGING_FOLDER = "dbzcollection";
const SOURCE_ID = "dbzcollection";
const DELAY_MS = 60;

export type DbzcSetSpec = {
  ids: string;
  setCode: string;
  label: string;
  listingPath: string;
  expectedCards?: number;
  cardsPerBooster?: number;
  cardsPerStarter?: number;
  releaseDate?: string;
  note?: string;
};

export type DbzcLedger = {
  source: string;
  sourceId: string;
  lang: string;
  origin: string;
  collectionIdc: string;
  sets: DbzcSetSpec[];
};

export function dbzcollectionLedgerPath(): string {
  return path.join(dbsJccCuratedDir(), "sources", LEDGER_FILE);
}

export function readDbzcollectionLedger(): DbzcLedger {
  return JSON.parse(readFileSync(dbzcollectionLedgerPath(), "utf8")) as DbzcLedger;
}

export function dbzcollectionStagingDir(): string {
  return path.join(packStagingDir(DBS_JCC_PACK_ID), STAGING_FOLDER);
}

function setStagingDir(setCode: string, root?: string): string {
  return path.join(root ?? dbzcollectionStagingDir(), setCode.trim().toLowerCase());
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function parseSeriesFilter(argv: readonly string[]): Set<string> | null {
  const raw = argv.find((a) => a.startsWith("--series="));
  if (!raw) return null;
  const parts = raw
    .slice("--series=".length)
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return parts.length ? new Set(parts) : null;
}

export function enabledDbzcSets(
  ledger: DbzcLedger,
  argv: readonly string[] = [],
): DbzcSetSpec[] {
  const filter = parseSeriesFilter(argv);
  return ledger.sets.filter((s) => {
    if (!filter) return true;
    return filter.has(s.setCode.trim().toLowerCase());
  });
}

/** Slugifies a power / scouter variant descriptor into a clean grouping segment. */
function powerToGroupingSlug(power: string): string {
  const clean = power
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
  if (clean.includes("kaio")) return "kaio";
  if (clean.includes("enfer")) return "enfer";
  if (clean.includes("main")) return "main";
  if (clean.includes("nc 7") || clean.includes("nc7")) return "nc7";
  if (clean.includes("pa 1000")) return "pa1000";
  if (clean.includes("pa 12000")) return "pa12000";
  return clean.replace(/[^a-z0-9]+/g, "");
}

function rarityToSlug(rarity: string | null): string {
  const lower = (rarity ?? "").trim().toLowerCase();
  if (lower.includes("prism")) return "prism";
  if (lower.includes("rare")) return "rare";
  if (lower.includes("holo")) return "holo";
  if (lower.includes("commune")) return "commune";
  return "";
}

/**
 * Attribue à chaque carte du set un `grouping` unique et déterministe.
 * Si le numéro est unique dans le set : grouping = null.
 * S'il y a des doublons : regroupe par pouvoir caché, rareté ou caractéristique.
 */
export function assignCardGroupings(
  cards: Array<DbzcCardTile & { detail?: DbzcCardDetail | null }>,
): Map<string, string | null> {
  const out = new Map<string, string | null>();
  const byNumber = new Map<
    string,
    Array<DbzcCardTile & { detail?: DbzcCardDetail | null }>
  >();

  for (const card of cards) {
    const parsed = parseDbsjccNumber(card.printed);
    const key = parsed ?? card.printed.trim().toLowerCase();
    const list = byNumber.get(key) ?? [];
    list.push(card);
    byNumber.set(key, list);
  }

  for (const [, group] of byNumber) {
    if (group.length === 1) {
      out.set(group[0]!.cardId, null);
      continue;
    }

    // Duplicate numbers exist within the set
    const candidates = new Map<string, string>();
    const seenSlugs = new Set<string>();

    for (const card of group) {
      const pc = card.detail?.pouvoirCache?.trim();
      const rarity = card.detail?.rarity?.trim() || card.rarityTile;
      const char = card.detail?.characteristics?.trim();

      let slug = pc ? powerToGroupingSlug(pc) : "";
      if (!slug || seenSlugs.has(slug)) {
        const rSlug = rarityToSlug(rarity);
        const combined = slug ? `${slug}${rSlug}` : rSlug;
        slug = combined;
      }
      if (!slug || seenSlugs.has(slug)) {
        const cSlug = char ? char.toLowerCase().replace(/[^a-z0-9]+/g, "") : "";
        slug = slug ? `${slug}${cSlug}` : cSlug;
      }

      // Final fallback if collision still occurs
      let finalSlug = normalizeGrouping(slug || `v${card.cardId}`);
      let counter = 1;
      while (!finalSlug || seenSlugs.has(finalSlug)) {
        counter += 1;
        finalSlug = normalizeGrouping(`${slug || "v"}${counter}`);
      }

      seenSlugs.add(finalSlug!);
      candidates.set(card.cardId, finalSlug);
    }

    for (const [cardId, slug] of candidates) {
      out.set(cardId, slug);
    }
  }

  return out;
}

export function cardFolderName(number: string, grouping: string | null): string {
  const num = number.trim().toLowerCase();
  return grouping ? `${num}-${grouping}` : num;
}

function packSlug(setCode: string, label: string, packId: string): string {
  const base = setCode.trim().toLowerCase();
  const slug = label
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${base}-${slug || "pack"}-${packId}`;
}

function packKind(label: string): { kind: SealedKind; category: string } {
  const lower = label.trim().toLowerCase();
  if (lower === "booster") return { kind: "booster", category: "booster" };
  if (lower.includes("booster box") || lower === "boosterbox") {
    return { kind: "display", category: "booster-box" };
  }
  if (lower.includes("starter box")) {
    return { kind: "display", category: "starter-box" };
  }
  if (lower.includes("starter")) return { kind: "deck", category: "starter-deck" };
  if (lower.includes("box")) return { kind: "collector_box", category: "tin-box" };
  if (lower.includes("scouter") || lower.includes("tecteur")) {
    return { kind: "ephemera", category: "scouter" };
  }
  return { kind: "ephemera", category: "sealed" };
}

export type DbzcHarvest = {
  sets: number;
  cards: number;
  packs: number;
  ok: number;
  skip: number;
  fail: number;
};

export async function harvestSet(
  set: DbzcSetSpec,
  ledger: DbzcLedger,
  opts: { force?: boolean; stagingRoot?: string },
): Promise<{ cards: number; packs: number; ok: number; skip: number; fail: number }> {
  const staging = setStagingDir(set.setCode, opts.stagingRoot);
  mkdirSync(staging, { recursive: true });
  const idc = ledger.collectionIdc || DBZC_COLLECTION_IDC;
  const listingUrl = dbzcSetListingUrl(set.ids, idc);
  const listingDest = path.join(staging, "listing.html");
  const html = await loadDbzcListingHtml({
    listingUrl,
    dest: listingDest,
    force: opts.force,
    delayMs: DELAY_MS,
  });
  if (!html) return { cards: 0, packs: 0, ok: 0, skip: 0, fail: 1 };

  const parsed = parseDbzcollectionListing(html);

  // 1. Fetch details for each card
  const cardsWithDetails: Array<
    DbzcCardTile & { detail?: DbzcCardDetail | null }
  > = [];

  for (const card of parsed.cards) {
    const detailDest = path.join(staging, `detail_${card.cardId}.json`);
    let detail: DbzcCardDetail | null = null;
    if (!opts.force && existsSync(detailDest)) {
      try {
        detail = JSON.parse(
          readFileSync(detailDest, "utf8"),
        ) as DbzcCardDetail;
      } catch {
        detail = null;
      }
    }
    if (!detail) {
      const ajaxHtml = await fetchDbzcText(dbzcCardInfoUrl(card.cardId), {
        minLength: 50,
      });
      await sleep(DELAY_MS);
      if (ajaxHtml) {
        detail = parseDbzcCardDetail(ajaxHtml, card.cardId);
        writeFileSync(
          detailDest,
          JSON.stringify(detail, null, 2) + "\n",
          "utf8",
        );
      }
    }
    cardsWithDetails.push({ ...card, detail });
  }

  // 2. Assign unique grouping to duplicate card numbers
  const groupings = assignCardGroupings(cardsWithDetails);

  // 3. Write cards manifest
  writeFileSync(
    path.join(staging, "cards.json"),
    JSON.stringify(
      {
        setCode: set.setCode,
        ids: set.ids,
        idc,
        lang: "fr",
        listingUrl,
        cards: cardsWithDetails.map((c) => ({
          cardId: c.cardId,
          printed: c.printed,
          normalizedNumber: parseDbsjccNumber(c.printed),
          grouping: groupings.get(c.cardId) ?? null,
          name: c.detail?.name ?? null,
          rarity: c.detail?.rarity ?? c.rarityTile,
          pouvoirCache: c.detail?.pouvoirCache ?? null,
        })),
        packs: parsed.packs,
        harvestedAt: new Date().toISOString(),
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );

  let ok = 0;
  let skip = 0;
  let fail = 0;

  // 4. Download images and write per-card manifest
  for (const card of cardsWithDetails) {
    const normalizedNumber =
      parseDbsjccNumber(card.printed) ?? card.printed.trim().toLowerCase();
    const grouping = groupings.get(card.cardId) ?? null;
    const folder = cardFolderName(normalizedNumber, grouping);
    const dest = path.join(staging, `${folder}.jpg`);
    const manifestDest = path.join(staging, `${folder}.json`);

    const hasFace = existsSync(dest);
    if (!opts.force && hasFace && existsSync(manifestDest)) {
      skip += 1;
      continue;
    }

    let buf: Buffer | null = null;
    let chosenFacePath = card.hdFacePath;

    if (opts.force || !hasFace) {
      // Try HD version first
      const hdUrl = card.detail?.hdPath
        ? dbzcAbsoluteUrl(card.detail.hdPath)
        : dbzcAbsoluteUrl(card.hdFacePath);
      buf = await downloadDbzcImage(hdUrl, listingUrl);
      if (!buf) {
        // Fallback to standard 400px version
        chosenFacePath = card.facePath;
        buf = await downloadDbzcImage(
          dbzcAbsoluteUrl(card.facePath),
          listingUrl,
        );
      }
      if (!buf) {
        fail += 1;
        continue;
      }
      writeFileSync(dest, buf);
      await sleep(DELAY_MS);
    }

    const characterName = card.detail?.name?.trim() || "";
    const rarity = card.detail?.rarity?.trim() || card.rarityTile;
    const pouvoirCache = card.detail?.pouvoirCache?.trim() || null;
    const title = characterName
      ? characterName
      : formatDbsjccReference(set.setCode, card.printed, rarity, pouvoirCache);

    writeFileSync(
      manifestDest,
      JSON.stringify(
        {
          setCode: set.setCode,
          lang: "fr",
          cardId: card.cardId,
          printed: card.printed,
          normalizedNumber,
          grouping,
          rarity,
          name: characterName || null,
          title,
          cost: card.detail?.cost ?? null,
          characteristics: card.detail?.characteristics ?? null,
          power: card.detail?.power ?? null,
          pouvoirCache,
          nature: card.detail?.nature ?? null,
          otherInfo: card.detail?.otherInfo ?? null,
          faceUrl: dbzcAbsoluteUrl(chosenFacePath),
          listingUrl,
        },
        null,
        2,
      ) + "\n",
      "utf8",
    );
    ok += 1;
  }

  // 5. Download packagings
  const packsDir = path.join(staging, "packs");
  mkdirSync(packsDir, { recursive: true });

  for (const pack of parsed.packs) {
    const slug = packSlug(set.setCode, pack.label, pack.packId);
    const dest = path.join(packsDir, `${slug}.jpg`);
    const packManifestDest = path.join(packsDir, `${slug}.json`);

    if (!opts.force && existsSync(dest) && existsSync(packManifestDest)) {
      skip += 1;
      continue;
    }

    let detail: DbzcPackDetail | null = null;
    const packAjax = await fetchDbzcText(dbzcPackInfoUrl(pack.packId), {
      minLength: 30,
    });
    await sleep(DELAY_MS);
    if (packAjax) {
      detail = parseDbzcPackDetail(packAjax, pack.packId);
    }

    let buf: Buffer | null = null;
    let chosenPath = pack.hdFacePath;

    const hdUrl = detail?.hdPath
      ? dbzcAbsoluteUrl(detail.hdPath)
      : dbzcAbsoluteUrl(pack.hdFacePath);
    buf = await downloadDbzcImage(hdUrl, listingUrl);
    if (!buf) {
      chosenPath = pack.facePath;
      buf = await downloadDbzcImage(dbzcAbsoluteUrl(pack.facePath), listingUrl);
    }

    if (!buf) {
      fail += 1;
      continue;
    }

    writeFileSync(dest, buf);
    writeFileSync(
      packManifestDest,
      JSON.stringify(
        {
          setCode: set.setCode,
          lang: "fr",
          slug,
          packId: pack.packId,
          label: pack.label,
          otherInfo: detail?.otherInfo ?? null,
          faceUrl: dbzcAbsoluteUrl(chosenPath),
          listingUrl,
        },
        null,
        2,
      ) + "\n",
      "utf8",
    );
    ok += 1;
    await sleep(DELAY_MS);
  }

  return {
    cards: parsed.cards.length,
    packs: parsed.packs.length,
    ok,
    skip,
    fail,
  };
}

export async function harvestDbzcollection(
  opts: {
    force?: boolean;
    stagingDir?: string;
    argv?: readonly string[];
  } = {},
): Promise<DbzcHarvest> {
  const ledger = readDbzcollectionLedger();
  const sets = enabledDbzcSets(ledger, opts.argv ?? []);
  const stagingRoot = opts.stagingDir ?? dbzcollectionStagingDir();
  mkdirSync(stagingRoot, { recursive: true });

  let cards = 0;
  let packs = 0;
  let ok = 0;
  let skip = 0;
  let fail = 0;

  for (const set of sets) {
    console.log(`── dbzc ${set.setCode} — ${set.label}`);
    const report = await harvestSet(set, ledger, {
      force: opts.force,
      stagingRoot,
    });
    cards += report.cards;
    packs += report.packs;
    ok += report.ok;
    skip += report.skip;
    fail += report.fail;
    console.log(
      `── dbzc ${set.setCode} — ${report.cards} carte(s), ${report.packs} SKU : ${report.ok} DL, ${report.skip} déjà là, ${report.fail} manqué${report.fail === 1 ? "" : "s"}`,
    );
  }

  return { sets: sets.length, cards, packs, ok, skip, fail };
}

type CardManifest = {
  setCode: string;
  lang: string;
  cardId: string;
  printed: string;
  normalizedNumber: string;
  grouping: string | null;
  rarity: string | null;
  name: string | null;
  title: string;
  pouvoirCache: string | null;
  faceUrl: string;
};

function readCardManifests(staging: string): CardManifest[] {
  if (!existsSync(staging)) return [];
  const out: CardManifest[] = [];
  for (const name of readdirSync(staging)) {
    if (
      !name.endsWith(".json") ||
      name === "cards.json" ||
      name.startsWith("detail_")
    ) {
      continue;
    }
    try {
      out.push(
        JSON.parse(
          readFileSync(path.join(staging, name), "utf8"),
        ) as CardManifest,
      );
    } catch {
      /* skip */
    }
  }
  return out;
}

export type DbzcFaceInstall = {
  prints: number;
  titles: number;
  faces: number;
  dumps: number;
  missing: string[];
};

export function installDbzcollectionFaces(
  index: LocalPrintsIndex,
  opts: { stagingDir?: string; argv?: readonly string[] } = {},
): DbzcFaceInstall {
  const ledger = readDbzcollectionLedger();
  const sets = enabledDbzcSets(ledger, opts.argv ?? []);
  const stagingRoot = opts.stagingDir ?? dbzcollectionStagingDir();

  let prints = 0;
  let titles = 0;
  let faces = 0;
  let dumps = 0;
  const missingList: string[] = [];
  const assets: {
    printKey: string;
    lang: string;
    art: string;
    sourceUrl: string;
  }[] = [];

  for (const set of sets) {
    const lang = "fr";
    const staging = setStagingDir(set.setCode, stagingRoot);
    const manifests = readCardManifests(staging);
    const printRows: LocalPrintWrite[] = [];

    for (const row of manifests) {
      const printKey = dbsjccPrintKey(
        row.setCode,
        row.printed,
        row.grouping,
      );
      if (!printKey) {
        missingList.push(`${row.setCode}:${row.printed}`);
        continue;
      }
      const folder = cardFolderName(row.normalizedNumber, row.grouping);
      const src = path.join(staging, `${folder}.jpg`);
      if (!existsSync(src)) {
        missingList.push(`${row.setCode}:${folder}`);
        continue;
      }

      const fullName =
        row.name?.trim() ||
        formatDbsjccReference(
          row.setCode,
          row.printed,
          row.rarity,
          row.pouvoirCache,
        );

      printRows.push({
        printKey,
        setCode: row.setCode.trim().toLowerCase(),
        number: row.normalizedNumber,
        cardType: row.setCode.trim().toLowerCase(),
        grouping: row.grouping ?? null,
        sourceUrl: row.faceUrl,
        titles: [
          {
            lang,
            fullName,
            rarity: row.rarity ?? null,
          },
        ],
      });

      const destDir = path.join(
        packCardsDir(DBS_JCC_PACK_ID),
        row.setCode.trim().toLowerCase(),
        lang,
        folder,
      );
      mkdirSync(destDir, { recursive: true });
      const artName = `art.${SOURCE_ID}.jpg`;
      copyFileSync(src, path.join(destDir, artName));
      dumps += 1;

      assets.push({
        printKey,
        lang,
        art: artName,
        sourceUrl: row.faceUrl,
      });
      faces += 1;
    }

    if (printRows.length) {
      const written = index.writePrints(printRows);
      prints += written.prints;
      titles += written.titles;
    }
  }

  if (assets.length) index.writeAssets(assets);
  return { prints, titles, faces, dumps, missing: missingList };
}

type PackManifest = {
  setCode: string;
  lang: string;
  slug: string;
  packId: string;
  label: string;
  otherInfo: string | null;
  faceUrl: string;
  listingUrl: string;
};

export function ingestDbzcollectionSealedProducts(
  opts: { stagingDir?: string; argv?: readonly string[] } = {},
): { written: number; skipped: number } {
  const ledger = readDbzcollectionLedger();
  const sets = enabledDbzcSets(ledger, opts.argv ?? []);
  const stagingRoot = opts.stagingDir ?? dbzcollectionStagingDir();
  const products: LocalSealedWrite[] = [];

  for (const set of sets) {
    const packsDir = path.join(setStagingDir(set.setCode, stagingRoot), "packs");
    if (!existsSync(packsDir)) continue;

    for (const name of readdirSync(packsDir)) {
      if (!name.endsWith(".json")) continue;
      let row: PackManifest;
      try {
        row = JSON.parse(
          readFileSync(path.join(packsDir, name), "utf8"),
        ) as PackManifest;
      } catch {
        continue;
      }
      const artPath = path.join(packsDir, `${row.slug}.jpg`);
      if (!existsSync(artPath)) continue;

      const { kind, category } = packKind(row.label);
      const cardsPerPack =
        kind === "booster"
          ? (set.cardsPerBooster ?? 8)
          : kind === "deck"
            ? (set.cardsPerStarter ?? 32)
            : null;

      products.push({
        slug: row.slug,
        kind,
        category,
        name: `${set.label} — ${row.label}`,
        source: SOURCE_ID,
        setCode: set.setCode,
        lang: "fr",
        releaseDate: set.releaseDate ?? null,
        declaredCardCount: null,
        cardsPerPack,
        path: row.listingUrl || dbzcSetListingUrl(set.ids, ledger.collectionIdc),
        artPath,
      });
    }
  }

  if (!products.length) return { written: 0, skipped: 0 };
  return writeLocalSealedProducts({
    packId: DBS_JCC_PACK_ID,
    source: SOURCE_ID,
    products,
  });
}
