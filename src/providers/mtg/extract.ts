/**
 * Magic: The Gathering pack extract — Scryfall bulk → local catalogue.
 *
 * 1. Download `all_cards` bulk (cached under staging/scryfall/)
 * 2. Seed printKeys + **every paper lang** titles + finishes + per-lang artUrl
 * 3. Classic card back → curated/cards/back.webp
 * 4. mtgcards.fr sealed SKUs + optional FR shop faces (TCG Cards family)
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { httpGet, HTTP_DEFAULT_USER_AGENT } from "@/lib/http/httpClient";
import { runLocalTcgPipeline } from "@/providers/shared/cardCatalogue/localTcgLinePipeline";
import { ensureCardsFrListDump } from "@/providers/shared/tcgcards/ensureListDump";
import { fillMtgcardsFaces } from "@/providers/shared/tcgcards/fillCardsFrFaces";
import {
  MTGCARDS_CARD_SITE,
  mtgcardsIndexPath,
} from "@/providers/shared/tcgcards/scrapeList";

import { MTG_PACK_ID, mtgCuratedDir } from "./pack";
import { ensureScryfallBulkFile, recordScryfallBulkPromotedAndPurge } from "./harvest/scryfallBulk";
import {
  applyMtgScryfallArtUrls,
  seedMtgFromScryfallBulk,
} from "./harvest/seedFromScryfall";
import { scrapeMtgcardsProducts } from "./sources/mtgcards";

/** Classic Magic sleeve — Scryfall card_back_id 0aeebaf5-… */
const MAGIC_CARD_BACK_URL =
  "https://backs.scryfall.io/large/0/a/0aeebaf5-8c7d-4636-9e82-8c27447861f7.jpg";

const BULK_TYPE = "all_cards" as const;

async function ensureClassicCardBack(force: boolean): Promise<boolean> {
  const curatedCards = path.join(mtgCuratedDir(), "cards");
  const destJpg = path.join(curatedCards, "back.jpg");
  if (!force && existsSync(destJpg)) return false;
  mkdirSync(curatedCards, { recursive: true });
  const res = await httpGet<ArrayBuffer>(MAGIC_CARD_BACK_URL, {
    headers: {
      "User-Agent": `${HTTP_DEFAULT_USER_AGENT} Scryfall-back`,
      Accept: "image/*",
    },
    responseType: "arraybuffer",
    timeout: 60_000,
    hostProfile: "api",
  });
  writeFileSync(destJpg, Buffer.from(res.data));
  return true;
}

async function findOfflineBulk(): Promise<string | null> {
  const { scryfallStagingDir } = await import("./harvest/scryfallBulk");
  const { readdirSync } = await import("node:fs");
  const dir = scryfallStagingDir();
  if (!existsSync(dir)) return null;
  const prefer = readdirSync(dir)
    .filter(
      (f) =>
        f.startsWith(`${BULK_TYPE}-`) &&
        (f.endsWith(".json") || f.endsWith(".jsonl")),
    )
    .sort()
    .reverse();
  if (prefer[0]) return path.join(dir, prefer[0]);
  // Legacy EN-only dump still usable for offline smoke.
  const legacy = readdirSync(dir)
    .filter(
      (f) =>
        f.startsWith("default_cards-") &&
        (f.endsWith(".json") || f.endsWith(".jsonl")),
    )
    .sort()
    .reverse();
  return legacy[0] ? path.join(dir, legacy[0]) : null;
}

export async function runMtgPackPipeline(
  argv: readonly string[] = [],
): Promise<{ cards: number; products: number }> {
  const force = argv.includes("--force");
  const offline = argv.includes("--offline");
  const skipProducts =
    argv.includes("--skip-products") || skipToken(argv, "products");
  const skipBacks =
    argv.includes("--skip-backs") || skipToken(argv, "backs");
  const skipMtgcardsFaces = !argv.includes("--mtgcards-faces");
  const skipMtgcardsList =
    argv.includes("--skip-mtgcards-list") || skipToken(argv, "mtgcards-list");
  const maxPagesRaw = (() => {
    const i = argv.indexOf("--max-pages");
    return i >= 0 ? Number(argv[i + 1]) : undefined;
  })();
  const faceLimitRaw = (() => {
    const i = argv.indexOf("--limit");
    return i >= 0 ? Number(argv[i + 1]) : undefined;
  })();

  let bulkPath: string | null = null;
  let bulkUpdatedAt: string | null = null;
  let skipScryfallSeed = false;
  if (!offline) {
    console.log(`── Scryfall — bulk ${BULK_TYPE} (en original + fr, exclusives hors EN/FR)…`);
    const bulk = await ensureScryfallBulkFile(BULK_TYPE, { force });
    bulkUpdatedAt = bulk.updatedAt;
    if (bulk.skippedFresh && !bulk.path) {
      skipScryfallSeed = true;
      console.log(
        `── Scryfall — ledger frais (${bulk.updatedAt}) ; staging purgé, seed sauté`,
      );
    } else if (!bulk.path) {
      throw new Error(`Scryfall bulk ${BULK_TYPE} : chemin absent`);
    } else {
      bulkPath = bulk.path;
      console.log(`── Scryfall — ${bulk.path} (updated ${bulk.updatedAt})`);
    }
    if (!skipBacks) {
      const wrote = await ensureClassicCardBack(force);
      console.log(
        wrote
          ? "── Scryfall — dos classique posé (curated/cards/back.jpg)"
          : "── Scryfall — dos déjà présent",
      );
    }
  } else {
    bulkPath = await findOfflineBulk();
    if (!bulkPath) {
      throw new Error(
        `Mode --offline : aucun bulk ${BULK_TYPE} (ni default_cards) en staging/scryfall/`,
      );
    }
  }

  const result = await runLocalTcgPipeline({
    packId: MTG_PACK_ID,
    curatedDir: mtgCuratedDir(),
    label: "Magic: The Gathering",
    seed: async (index) => {
      if (skipScryfallSeed) {
        console.log("── Scryfall seed — skip (catalogue déjà à jour)");
        return { prints: 0, titles: 0, langs: 0, artUrls: 0, skipped: 0 };
      }
      const seeded = await seedMtgFromScryfallBulk(index, bulkPath!);
      console.log(
        `── Scryfall seed — ${seeded.prints} tirages, ${seeded.titles} titres, ${seeded.langs} langues, ${seeded.artUrls} artUrl, ${seeded.skipped} ignorés`,
      );
      if (bulkPath && bulkUpdatedAt) {
        recordScryfallBulkPromotedAndPurge({
          type: BULK_TYPE,
          updatedAt: bulkUpdatedAt,
          stagingPath: bulkPath,
        });
        console.log(
          `── Scryfall — ledger + purge staging (${bulkUpdatedAt})`,
        );
      }
      if (!skipMtgcardsList && !offline) {
        const list = await ensureCardsFrListDump({
          packId: MTG_PACK_ID,
          site: MTGCARDS_CARD_SITE,
          indexPath: mtgcardsIndexPath("fr"),
          force,
          maxPages: Number.isFinite(maxPagesRaw) ? maxPagesRaw : undefined,
          label: "mtgcards.fr",
        });
        console.log(
          `── mtgcards.fr list — ${list.cards} tuiles, ${list.priced} cotes, ${list.pages} pages → ${list.file}`,
        );
      }
      if (!skipMtgcardsFaces && !offline) {
        const shop = await fillMtgcardsFaces({
          index,
          force,
          refreshIndex: false,
          maxPages: Number.isFinite(maxPagesRaw) ? maxPagesRaw : undefined,
          limit: Number.isFinite(faceLimitRaw) ? faceLimitRaw : undefined,
        });
        console.log(
          `── mtgcards.fr faces — ${shop.written} écrites, ${shop.skipped} déjà là, ${shop.unmapped} sans clé, ${shop.unknownPrint} hors catalogue, ${shop.failed} échecs (${shop.indexCards} tuiles)`,
        );
      }
      return seeded;
    },
    seedProducts: async () => {
      if (skipProducts) return { written: 0, skipped: 0 };
      const products = await scrapeMtgcardsProducts({
        force,
        offline,
        onProgress: (message) => console.log(`   products — ${message}`),
      });
      return {
        written: products.detail || products.listed,
        skipped: 0,
      };
    },
  });

  const arts = applyMtgScryfallArtUrls();
  console.log(
    `── Scryfall — ${arts.patched} artUrl CDN dans curated/art-urls.json (browse join)`,
  );

  return result;
}

function skipToken(argv: readonly string[], token: string): boolean {
  const idx = argv.indexOf("--skip");
  if (idx < 0) return false;
  const csv = argv[idx + 1] ?? "";
  return csv
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .includes(token);
}
