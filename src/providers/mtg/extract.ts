/**
 * Magic: The Gathering pack extract — Scryfall bulk → local catalogue.
 *
 * 1. Download `all_cards` bulk (cached under staging/scryfall/)
 * 2. Seed printKeys + **every paper lang** titles + finishes + per-lang artUrl
 * 3. Classic card back → curated/cards/back.webp
 * 4. Optional mtgcards.fr sealed (`--skip-products` by default on auto)
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { httpGet, HTTP_DEFAULT_USER_AGENT } from "@/lib/http/httpClient";
import { scrapeTcgCardsProducts } from "@/providers/dragonball/shared/dbscards/scrapeProducts";
import { runLocalTcgPipeline } from "@/providers/shared/cardCatalogue/localTcgLinePipeline";

import { MTG_PACK_ID, mtgCuratedDir } from "./pack";
import { ensureScryfallBulkFile } from "./harvest/scryfallBulk";
import {
  applyMtgScryfallArtUrls,
  seedMtgFromScryfallBulk,
} from "./harvest/seedFromScryfall";

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

  let bulkPath: string | null = null;
  if (!offline) {
    console.log(`── Scryfall — bulk ${BULK_TYPE} (en original + fr, exclusives hors EN/FR)…`);
    const bulk = await ensureScryfallBulkFile(BULK_TYPE, { force });
    bulkPath = bulk.path;
    console.log(`── Scryfall — ${bulk.path} (updated ${bulk.updatedAt})`);
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
      const seeded = await seedMtgFromScryfallBulk(index, bulkPath!);
      console.log(
        `── Scryfall seed — ${seeded.prints} tirages, ${seeded.titles} titres, ${seeded.langs} langues, ${seeded.artUrls} artUrl, ${seeded.skipped} ignorés`,
      );
      return seeded;
    },
    seedProducts: async () => {
      if (skipProducts) return { written: 0, skipped: 0 };
      const products = await scrapeTcgCardsProducts("mtgcards", {
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
  console.log(`── Scryfall — ${arts.patched} artUrl CDN injectés dans cards-index`);

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
