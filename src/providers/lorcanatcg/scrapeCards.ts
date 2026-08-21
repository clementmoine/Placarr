#!/usr/bin/env node
/**
 * Scrape Lorcana catalogue media (masks + art) as published bytes into
 * data/lorcana/cards/{set}/{lang}/{card}/ — all LorcanaJSON languages
 * (fr, en, de, it).
 *
 *   pnpm foil:lorcana:cards
 *   pnpm foil:lorcana -- --providers lorcanacards
 *   pnpm foil:lorcana:cards -- --force
 */
import fs from "node:fs";
import path from "node:path";

import {
  isLorcanaLanguage,
  loadLorcanaIndex,
  LORCANA_LANGUAGES,
  type LorcanaCard,
  type LorcanaLanguage,
} from "@/providers/lorcanajson/fetch";
import {
  LORCAST_LANGUAGE,
  LORCAST_SOURCE,
} from "@/providers/lorcast/catalogue";
import { cardDiskIdFromPrintKey } from "@/lib/packPaths";
import { dataRoot } from "@/lib/runtimeData";
import {
  exportLorcanaCardsIndexJson,
  writeLorcanaTcgIndex,
  type LorcanaTcgAssetRow,
  type LorcanaTcgPrintRow,
  type LorcanaTcgTitleRow,
} from "./indexStore";
import {
  loadLorcastFill,
  lorcanaGapKey,
  type LorcastFillPrint,
} from "./lorcastFill";
import { resolveAttestedFinishes } from "./curated/attestedFinishes";

export type ScrapeLorcanaCardsOptions = {
  force?: boolean;
  root?: string;
};

const CONCURRENCY = 6;
/** Same languages as LorcanaJSON — keep local sqlite + pack faces in sync. */
const SCRAPE_LANGUAGES = LORCANA_LANGUAGES;

/** Old flat layout `cards/{printKey}/art.jpg` — superseded by `{printKey}/{lang}/`. */
const LEGACY_ROOT_ASSET_NAMES = [
  "art.jpg",
  "art.jpeg",
  "art.png",
  "art.webp",
  "thumb.jpg",
  "thumb.jpeg",
  "thumb.png",
  "thumb.webp",
  "foil_mask.jpg",
  "foil_mask.jpeg",
  "foil_mask.png",
  "foil_mask.webp",
  "varnish_mask.jpg",
  "varnish_mask.jpeg",
  "varnish_mask.png",
  "varnish_mask.webp",
  "second_varnish_mask.jpg",
  "second_varnish_mask.jpeg",
  "second_varnish_mask.png",
  "second_varnish_mask.webp",
] as const;

type LangFiles = {
  foilMask?: string;
  varnishMask?: string;
  secondVarnishMask?: string;
  art?: string;
  thumb?: string;
};

type Job = {
  printKey: string;
  language: LorcanaLanguage;
  field: keyof LangFiles;
  file: string;
  url: string;
  dest: string;
};

function extFromUrl(url: string): string {
  try {
    const ext = path.extname(new URL(url).pathname).toLowerCase();
    // `.avif` : le seul format que Lorcast publie pour ses faces.
    if ([".jpg", ".jpeg", ".png", ".webp", ".avif"].includes(ext)) {
      return ext === ".jpeg" ? ".jpg" : ext;
    }
  } catch {
    /* ignore */
  }
  return ".jpg";
}

async function downloadRaw(
  url: string,
  destPath: string,
  skipExisting: boolean,
): Promise<"ok" | "skip"> {
  if (skipExisting && fs.existsSync(destPath)) return "skip";
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} ${url}`);
  const buf = Buffer.from(await response.arrayBuffer());
  await fs.promises.mkdir(path.dirname(destPath), { recursive: true });
  await fs.promises.writeFile(destPath, buf);
  return "ok";
}

async function runPool<T>(
  items: readonly T[],
  worker: (item: T, index: number) => Promise<void>,
): Promise<unknown[]> {
  let i = 0;
  const errors: unknown[] = [];
  const runners = Array.from(
    { length: Math.min(CONCURRENCY, items.length || 1) },
    async () => {
      while (i < items.length) {
        const idx = i;
        i += 1;
        try {
          await worker(items[idx]!, idx);
        } catch (error) {
          errors.push(error);
        }
      }
    },
  );
  await Promise.all(runners);
  return errors;
}

/**
 * Remove legacy flat files under `cards/{printKey}/` when a lang folder exists.
 * Current scrape only writes `cards/{printKey}/{lang}/…`.
 */
export function cleanupLegacyPrintRootAssets(cardsDir: string): {
  removed: number;
  bytes: number;
} {
  if (!fs.existsSync(cardsDir)) return { removed: 0, bytes: 0 };
  let removed = 0;
  let bytes = 0;
  for (const name of fs.readdirSync(cardsDir)) {
    const printDir = path.join(cardsDir, name);
    if (!fs.statSync(printDir).isDirectory()) continue;
    const hasLang = SCRAPE_LANGUAGES.some((lang) =>
      fs.existsSync(path.join(printDir, lang)),
    );
    if (!hasLang) continue;
    for (const file of LEGACY_ROOT_ASSET_NAMES) {
      const target = path.join(printDir, file);
      if (!fs.existsSync(target) || !fs.statSync(target).isFile()) continue;
      bytes += fs.statSync(target).size;
      fs.unlinkSync(target);
      removed += 1;
    }
  }
  return { removed, bytes };
}

/** Drop flat art/mask keys once per-lang folders are indexed. */
export function stripLegacyFlatIndexKeys(
  cards: Record<string, Record<string, unknown>>,
): number {
  const flatKeys = [
    "art",
    "thumb",
    "foilMask",
    "varnishMask",
    "secondVarnishMask",
  ] as const;
  let stripped = 0;
  for (const entry of Object.values(cards)) {
    const hasLang = SCRAPE_LANGUAGES.some((lang) => {
      const files = entry[lang];
      return Boolean(files && typeof files === "object");
    });
    if (!hasLang) continue;
    for (const key of flatKeys) {
      if (key in entry) {
        delete entry[key];
        stripped += 1;
      }
    }
  }
  return stripped;
}

function collectJobsForCard(card: LorcanaCard, cardsDir: string): Job[] {
  const language = card.language;
  const disk = cardDiskIdFromPrintKey(card.printKey, language);
  if (!disk) return [];
  const dir = path.join(cardsDir, disk.set, disk.lang, disk.card);
  const jobs: Job[] = [];

  const add = (field: keyof LangFiles, fileStem: string, url: string) => {
    const file = `${fileStem}${extFromUrl(url)}`;
    jobs.push({
      printKey: card.printKey,
      language,
      field,
      file,
      url,
      dest: path.join(dir, file),
    });
  };

  if (card.foilMaskUrl) add("foilMask", "mask", card.foilMaskUrl);
  if (card.varnishMaskUrl)
    add("varnishMask", "varnish_mask", card.varnishMaskUrl);
  if (card.secondVarnishMaskUrl) {
    add("secondVarnishMask", "second_varnish_mask", card.secondVarnishMaskUrl);
  }
  const artUrl = card.fullFoilUrl ?? card.imageUrl;
  if (artUrl) add("art", "art", artUrl);
  if (card.thumbnailUrl && card.thumbnailUrl !== artUrl) {
    add("thumb", "thumb", card.thumbnailUrl);
  }
  return jobs;
}

/**
 * Les faces venues de Lorcast, nommées `art.lorcast.avif`.
 *
 * Le contrat des packs prévoyait `<rôle>.<source>.<ext>` « le jour où Lorcana
 * gagne une seconde source d'images » : c'est ce jour. Le nom est une donnée
 * comme une autre, rangée telle quelle dans `cards-index.json` — mais il est la
 * seule chose qui dise, une fois le fichier sur le disque, d'où viennent ses
 * octets.
 */
function collectJobsForLorcastPrint(
  print: LorcastFillPrint,
  cardsDir: string,
): Job[] {
  const disk = cardDiskIdFromPrintKey(print.printKey, LORCAST_LANGUAGE);
  if (!disk) return [];
  const dir = path.join(cardsDir, disk.set, disk.lang, disk.card);
  const jobs: Job[] = [];

  const add = (field: keyof LangFiles, fileStem: string, url: string) => {
    const file = `${fileStem}.${LORCAST_SOURCE}${extFromUrl(url)}`;
    jobs.push({
      printKey: print.printKey,
      language: LORCAST_LANGUAGE,
      field,
      file,
      url,
      dest: path.join(dir, file),
    });
  };

  if (print.imageUrl) add("art", "art", print.imageUrl);
  if (print.thumbnailUrl && print.thumbnailUrl !== print.imageUrl) {
    add("thumb", "thumb", print.thumbnailUrl);
  }
  return jobs;
}

export async function scrapeLorcanaCards(
  opts: ScrapeLorcanaCardsOptions = {},
): Promise<{
  ok: number;
  skip: number;
  fail: number;
  prints: number;
  sqlite: string;
}> {
  const root = opts.root ?? path.resolve(dataRoot(), "..");
  const skipExisting = !opts.force;
  const cardsDir = path.join(root, "data/lorcana/cards");
  const indexPath = path.join(root, "data/lorcana/cards-index.json");
  const dbPath = path.join(root, "data/lorcana/catalog.sqlite");

  console.log(`Loading Lorcana indexes (${SCRAPE_LANGUAGES.join(" + ")})…`);

  const jobs: Job[] = [];
  const prints = new Map<string, LorcanaTcgPrintRow>();
  const titles: LorcanaTcgTitleRow[] = [];
  const assetsByKey = new Map<string, LorcanaTcgAssetRow>();
  /** Les {@link lorcanaGapKey} que LorcanaJSON couvre — le reste est un trou. */
  const covered = new Set<string>();

  // Seed assets from previous sqlite so --skip keeps paths for untouched files.
  const prior = exportLorcanaCardsIndexJson(dbPath);
  if (prior) {
    for (const [printKey, entry] of Object.entries(prior.cards)) {
      for (const lang of SCRAPE_LANGUAGES) {
        const files = entry.langs[lang];
        if (!files || typeof files !== "object") continue;
        assetsByKey.set(`${printKey}\0${lang}`, {
          printKey,
          lang,
          art: files.art ?? null,
          thumb: files.thumb ?? null,
          foilMask: files.mask ?? null,
          varnishMask: files.varnishMask ?? null,
          secondVarnishMask: files.secondVarnishMask ?? null,
        });
      }
    }
  }

  for (const language of SCRAPE_LANGUAGES) {
    const index = await loadLorcanaIndex(language);
    console.log(`  ${language}: ${index.cards.length} cards`);
    for (const card of index.cards) {
      if (!isLorcanaLanguage(card.language)) continue;
      // Language-agnostic print facts: last write wins (FR then EN); cost /
      // foilTypes / artists are stable across locales in LorcanaJSON.
      prints.set(card.printKey, {
        printKey: card.printKey,
        setCode: card.setCode,
        number: String(card.number),
        variant: card.variant,
        promoGrouping: card.promoGrouping,
        providerId: card.providerId,
        cost: card.cost,
        artists: card.artists.length ? card.artists : null,
        foilTypes: card.foilTypes.length ? card.foilTypes : null,
        varnishType: card.varnishType,
        cardmarketUrl: card.cardmarketUrl,
        lore: card.lore,
        strength: card.strength,
        willpower: card.willpower,
        inkwell: card.inkwell,
        setCardCount: card.setCardCount,
        // Rien d'autre ne prédit la teinte du vernis : la perdre ici la perd
        // pour de bon côté base locale.
        foilEffectColors: card.foilEffectColors.length
          ? card.foilEffectColors
          : null,
      });
      titles.push({
        printKey: card.printKey,
        lang: language,
        fullName: card.fullName,
        name: card.name,
        version: card.version,
        setName: card.setName,
        rarity: card.rarity,
        cardType: card.cardType,
        color: card.color,
        story: card.story,
        flavorText: card.flavorText,
        subtypes: card.subtypes.length ? card.subtypes : null,
        searchName: card.searchName,
        imageUrl: card.imageUrl,
        thumbnailUrl: card.thumbnailUrl,
        fullFoilUrl: card.fullFoilUrl,
        foilMaskUrl: card.foilMaskUrl,
        varnishMaskUrl: card.varnishMaskUrl,
        secondVarnishMaskUrl: card.secondVarnishMaskUrl,
      });
      jobs.push(...collectJobsForCard(card, cardsDir));
      const gap = lorcanaGapKey(card);
      if (gap) covered.add(gap);
    }
  }

  const fill = await loadLorcastFill(covered);
  for (const note of fill.notes) console.log(`  lorcast: ${note}`);
  for (const print of fill.prints) {
    prints.set(print.printKey, {
      printKey: print.printKey,
      setCode: print.setCode,
      number: print.baseNumber,
      variant: print.variant,
      promoGrouping: print.promoGrouping,
      providerId: print.providerId,
      cost: print.cost,
      artists: print.artists.length ? print.artists : null,
      // Lorcast ne dit rien des finitions : les inventer serait pire que le
      // vide. Seule une carte en main tranche — voir `curated/attestedFinishes`,
      // appliqué plus bas.
      foilTypes: null,
      varnishType: null,
      cardmarketUrl: null,
      lore: print.lore,
      strength: print.strength,
      willpower: print.willpower,
      inkwell: print.inkwell,
      setCardCount: null,
      foilEffectColors: null,
    });
    titles.push({
      printKey: print.printKey,
      lang: LORCAST_LANGUAGE,
      fullName: print.fullName,
      name: print.name,
      version: print.version,
      setName: print.setName,
      rarity: print.rarity,
      cardType: print.cardType,
      color: print.color,
      story: null,
      flavorText: print.flavorText,
      subtypes: print.subtypes.length ? print.subtypes : null,
      searchName: print.searchName,
      imageUrl: print.imageUrl,
      thumbnailUrl: print.thumbnailUrl,
      fullFoilUrl: null,
      foilMaskUrl: null,
      varnishMaskUrl: null,
      secondVarnishMaskUrl: null,
    });
    jobs.push(...collectJobsForLorcastPrint(print, cardsDir));
  }

  // Ce que ni LorcanaJSON ni Lorcast ne disent, un exemplaire en main peut le
  // dire. Appliqué en dernier, et seulement sur un tirage sans finition.
  const attested = resolveAttestedFinishes((printKey) => {
    const print = prints.get(printKey);
    if (!print) return undefined;
    return {
      foilTypes: print.foilTypes ?? null,
      varnishType: print.varnishType ?? null,
      foilEffectColors: print.foilEffectColors ?? null,
    };
  });
  for (const note of attested.notes) console.log(`  attesté: ${note}`);
  for (const [printKey, finish] of attested.finishes) {
    const print = prints.get(printKey);
    if (!print) continue;
    prints.set(printKey, { ...print, ...finish });
  }

  console.log(
    `Jobs ${jobs.length} (prints ${prints.size}, skip_existing=${skipExisting})`,
  );

  let ok = 0;
  let skip = 0;
  let fail = 0;
  const errors = await runPool(jobs, async (job) => {
    try {
      const result = await downloadRaw(job.url, job.dest, skipExisting);
      if (result === "skip") skip += 1;
      else ok += 1;
      const key = `${job.printKey}\0${job.language}`;
      const row = assetsByKey.get(key) ?? {
        printKey: job.printKey,
        lang: job.language,
      };
      row[job.field] = job.file;
      assetsByKey.set(key, row);
    } catch (error) {
      fail += 1;
      throw error;
    }
  });

  const written = writeLorcanaTcgIndex({
    dbPath,
    languages: [...SCRAPE_LANGUAGES],
    prints: [...prints.values()],
    titles,
    assets: [...assetsByKey.values()],
  });
  const payload = exportLorcanaCardsIndexJson(dbPath);
  if (!payload) {
    throw new Error("Failed to export cards-index from sqlite");
  }

  const legacy = cleanupLegacyPrintRootAssets(cardsDir);

  await fs.promises.mkdir(path.dirname(indexPath), { recursive: true });
  await fs.promises.writeFile(
    indexPath,
    `${JSON.stringify(payload, null, 2)}\n`,
  );

  console.log(
    JSON.stringify(
      {
        ok,
        skip,
        fail,
        prints: written.printCount,
        sqlite: path.relative(root, dbPath),
        languages: [...SCRAPE_LANGUAGES],
        legacyRootRemoved: legacy.removed,
        legacyRootBytes: legacy.bytes,
        errorSample: errors
          .slice(0, 5)
          .map((e) => (e instanceof Error ? e.message : String(e))),
      },
      null,
      2,
    ),
  );
  if (fail > 0 && ok === 0) {
    throw new Error(`All ${fail} download jobs failed`);
  }
  return {
    ok,
    skip,
    fail,
    prints: written.printCount,
    sqlite: path.relative(root, dbPath),
  };
}
