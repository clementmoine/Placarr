#!/usr/bin/env tsx
/**
 * Naruto — one command builds the whole pack, like `foil:lorcana` does.
 *
 * Catalogue: data/naruto/carddass/cards/{family}/{ni0001|n0001}/{lang}/
 * Curated tree: src/providers/narutoccg/curated/cards/ (mirrors data cards/)
 *
 *   pnpm naruto:cards
 *   pnpm naruto:cards -- --only index
 *   pnpm naruto:cards -- --only scrape --locale colekafr
 *   pnpm naruto:cards -- --only scrape --locale drive
 *   pnpm naruto:cards -- --only scrape --locale drive --staging-only
 *   pnpm naruto:cards -- --only scrape --locale drive --drive-local ~/Downloads/Naruto\ CCG
 *   # After local unzip into staging hub, drive skips HTTP harvest automatically.
 *   pnpm naruto:cards -- --only scrape --locale drive --sets s1,s2
 *   pnpm naruto:cards -- --only scrape --locale en --cdx-only
 *   pnpm naruto:cards -- --only products  # packshots → products-index.json
 *   pnpm naruto:cards -- --offline
 *
 * Curated (back + reconstructed) is always synced at the start of any run
 * (mtime) — not only with `--only reconstruct`.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

import "dotenv/config";

import { runNarutoChecklistCli } from "./buildCoverageChecklist";
import { runNarutoSourcesCli } from "./buildApacheIndex";
import { runNarutoFixThumbsCli } from "./fixThumbs";
import { ensureNarutoCuratedAssets } from "./installReconstructed";
import { runNarutoKnownCardsCli } from "./knownCards";
import { scrapeNarutoEnCards } from "./scrapeBandaicgCards";
import { scrapeNarutoJpCards } from "./scrapeCarddasJp";
import { scrapeNarutoCards } from "./scrapeCards";
import { scrapeNarutoColekaCarddassFrCards } from "./scrapeColekaCarddassFr";
import { scrapeNarutoColekaS6ItCards } from "./scrapeColekaS6It";
import { scrapeNarutoColekaStorm3Cards } from "./scrapeColekaStorm3";
import { scrapeNarutoStorm3Cards } from "./scrapeStorm3";
import { scrapeCardgameclubItFaces } from "./scrapeCardgameclubIt";
import { scrapeGoatEnCcgTitles } from "./scrapeGoatEnCcg";
import { scrapeNarutoCardsCaTitles } from "./scrapeNarutoCardsCa";
import { scrapeNarutoZabuzaPromo } from "./scrapeNarutoZabuza";
import { scrapeNikitaNrtCards } from "./scrapeNikitaNrt";
import { scrapeSurugaCarddassCards } from "./scrapeSurugaCarddass";
import { scrapeUltrajeuxS5Holes } from "./scrapeUltrajeuxS5";
import { scrapeVintageNarutoCcgFaces } from "./scrapeVintageNarutoCcg";
import { installCarddasJpStagingFaces } from "./installCarddasJpStagingFaces";
import { harvestCarddasVol1Faces } from "./harvestCarddasVol1Faces";
import { probeSurugaVol1Listings } from "./probeSurugaVol1Listings";
import { probeSurugaMissingVol1 } from "./probeSurugaMissingVol1";
import {
  harvestNarutoCcgDriveStaging,
  driveStagingHubFileCount,
  driveStagingHubPopulated,
} from "./harvestNarutoCcgDriveStaging";
import { ingestNarutoCcgDriveLocalExport } from "./ingestNarutoCcgDriveLocalExport";
import {
  installNarutoCcgDriveCardBack,
  installNarutoCcgDriveFaces,
  installNarutoCcgDriveFansetFallbacks,
} from "./installNarutoCcgDriveFaces";
import { installCardgameclubPackshots } from "./installCardgameclubPackshots";
import { installEbayPackshots } from "./installEbayPackshots";
import { installEbayFaces } from "./installEbayFaces";
import { scrapeAvalonNarutoFaces } from "./scrapeAvalonShop";
import { writeNarutoCompleteness } from "./buildCompleteness";
import { scrapeFrilNarutoFaces } from "./scrapeFrilShop";
import {
  scrapeNikitaCardlistFacts,
  scrapeNikitaShippudenFaces,
} from "./scrapeNikitaCardlist";
import { installGoatPackshots } from "./installGoatPackshots";
import { installGradedcardcenterPackshots } from "./installGradedcardcenterPackshots";
import { installMartinaPackshots } from "./installMartinaPackshots";
import { installScifiUniversePackshots } from "./installScifiUniversePackshots";
import { installTrictracPackshots } from "./installTrictracPackshots";
import { installVialudibundaPackshots } from "./installVialudibunda";
import { ingestNarutoSealedProducts } from "./sealedProducts";

const STEPS = [
  "scrape",
  "reconstruct",
  "index",
  "products",
  "thumbs",
  "checklist",
  "known",
  "sources",
] as const;
type Step = (typeof STEPS)[number];

const ONLINE: ReadonlySet<Step> = new Set<Step>(["scrape", "checklist"]);
/** Not part of a normal pack build — regenerate curated ledgers on demand. */
const OFF_BY_DEFAULT: ReadonlySet<Step> = new Set<Step>(["sources"]);

function argValueFrom(
  argv: readonly string[],
  name: string,
): string | undefined {
  const idx = argv.indexOf(name);
  if (idx < 0) return undefined;
  return argv[idx + 1];
}

function argListFrom(argv: readonly string[], name: string): string[] {
  return (argValueFrom(argv, name) ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function unknown(list: string[]): string[] {
  return list.filter((s) => !(STEPS as readonly string[]).includes(s));
}

/** Which steps to run, from --only / --skip / --offline. */
export function selectSteps(argv: readonly string[]): Step[] {
  const only = argListFrom(argv, "--only");
  const skip = new Set(argListFrom(argv, "--skip"));
  const offline = argv.includes("--offline");
  const base = only.length ? STEPS.filter((s) => only.includes(s)) : [...STEPS];
  return base.filter(
    (s) =>
      !skip.has(s) &&
      !(offline && ONLINE.has(s)) &&
      !(only.length === 0 && OFF_BY_DEFAULT.has(s)),
  );
}

async function runScrape(argv: readonly string[]): Promise<void> {
  const shared = {
    force: argv.includes("--force"),
    cdxOnly: argv.includes("--cdx-only"),
    cardsOnly: argv.includes("--cards-only"),
    limit: argValueFrom(argv, "--limit")
      ? Number(argValueFrom(argv, "--limit"))
      : undefined,
    concurrency: argValueFrom(argv, "--concurrency")
      ? Number(argValueFrom(argv, "--concurrency"))
      : undefined,
    delayMs: argValueFrom(argv, "--delay")
      ? Number(argValueFrom(argv, "--delay"))
      : undefined,
  };
  const raw =
    argValueFrom(argv, "--locale") ?? argValueFrom(argv, "--lang") ?? "fr";
  const locales = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  for (const locale of locales) {
    if (locale === "fr") await scrapeNarutoCards(shared);
    else if (locale === "en") await scrapeNarutoEnCards(shared);
    else if (locale === "jap" || locale === "ja" || locale === "jp") {
      await scrapeNarutoJpCards(shared);
      if (!shared.cdxOnly) {
        await harvestCarddasVol1Faces({
          force: shared.force,
          delayMs: shared.delayMs,
          limit: shared.limit,
        });
      }
    } else if (locale === "storm3" || locale === "s28" || locale === "uns3") {
      // Storm 3 runs after this loop (not a Wayback locale).
    } else if (locale === "s6it" || locale === "ita" || locale === "rivalita") {
      // Italian S6 runs after this loop (Coleka, not Wayback).
    } else if (locale === "colekafr" || locale === "coleka-fr") {
      // French Carddass Coleka leaves run after this loop.
    } else if (locale === "ultrajeux") {
      // S5 hole JPEGs run after this loop.
    } else if (locale === "drive" || locale === "drive-enhanced") {
      // Drive Enhanced runs after this loop.
    } else {
      throw new Error(
        `Unknown --locale ${locale} (expected fr | en | jap | storm3 | s6it | colekafr | ultrajeux | drive).`,
      );
    }
  }
  if (!argv.includes("--cdx-only")) {
    const wayback = locales.some((locale) =>
      ["fr", "en", "jap", "ja", "jp"].includes(locale),
    );
    const storm3 = locales.some((locale) =>
      ["storm3", "s28", "uns3"].includes(locale),
    );
    const s6it = locales.some((locale) =>
      ["s6it", "ita", "rivalita"].includes(locale),
    );
    const colekafr = locales.some((locale) =>
      ["colekafr", "coleka-fr"].includes(locale),
    );
    const ultrajeux = locales.some((locale) => locale === "ultrajeux");
    const drive = locales.some((locale) =>
      ["drive", "drive-enhanced"].includes(locale),
    );
    // Default `--locale fr` still finishes Storm 3 + S6 IT after Wayback.
    if (wayback || storm3) {
      await scrapeNarutoStorm3Cards(shared);
      await scrapeNarutoColekaStorm3Cards(shared);
    }
    if (wayback || s6it) {
      await scrapeNarutoColekaS6ItCards(shared);
      await scrapeCardgameclubItFaces({
        force: shared.force,
        delayMs: shared.delayMs,
        limit: shared.limit,
      });
    }
    if (wayback || colekafr) {
      await scrapeNarutoColekaCarddassFrCards(shared);
    }
    if (wayback || ultrajeux) {
      await scrapeUltrajeuxS5Holes({ force: shared.force });
    }
    if (wayback || storm3) {
      await scrapeGoatEnCcgTitles({
        force: shared.force,
        delayMs: shared.delayMs,
        concurrency: shared.concurrency,
        limit: shared.limit,
      });
      await scrapeNarutoCardsCaTitles({
        force: shared.force,
        delayMs: shared.delayMs,
      });
      await scrapeVintageNarutoCcgFaces({
        force: shared.force,
        delayMs: shared.delayMs,
        concurrency: shared.concurrency,
        limit: shared.limit,
      });
    }
    if (wayback || drive) {
      const stagingOnly = argv.includes("--staging-only");
      const driveLocal =
        argValueFrom(argv, "--drive-local") ??
        process.env.NARUTO_DRIVE_EXPORT_DIR;
      if (driveLocal) {
        const local = await ingestNarutoCcgDriveLocalExport({
          sourceDir: driveLocal.replace(/^~/, process.env.HOME ?? ""),
          force: shared.force,
        });
        console.log(
          `── Drive local : ${local.extracted || local.skipped} fichiers dans ${local.hubRel}/ (${local.zips.length} zip)`,
        );
      } else if (!shared.force && driveStagingHubPopulated()) {
        console.log(
          `── Drive hub déjà en staging (${driveStagingHubFileCount()} fichiers) — skip harvest HTTP (--force pour re-télécharger)`,
        );
      } else {
        const harvest = await harvestNarutoCcgDriveStaging({
          force: shared.force,
          delayMs: shared.delayMs,
          concurrency: shared.concurrency,
          limit: shared.limit,
        });
        if (
          harvest.downloaded.length ||
          harvest.skipped.length ||
          harvest.failed.length
        ) {
          console.log(
            `── Drive staging : ${harvest.downloaded.length} DL, ${harvest.skipped.length} déjà là, ${harvest.failed.length} échecs`,
          );
        }
      }
      if (!stagingOnly) {
        const driveFaces = await installNarutoCcgDriveFaces({
          force: shared.force,
          limit: shared.limit,
          sets: argListFrom(argv, "--sets"),
        });
        if (
          driveFaces.written.length ||
          driveFaces.skipped.length ||
          driveFaces.failed.length
        ) {
          console.log(
            `── Drive → cards : ${driveFaces.written.length} écrits, ${driveFaces.skipped.length} sautés, ${driveFaces.failed.length} échecs`,
          );
        }
        const fansetFaces = await installNarutoCcgDriveFansetFallbacks({
          force: shared.force,
          limit: shared.limit,
        });
        if (
          fansetFaces.written.length ||
          fansetFaces.skipped.length ||
          fansetFaces.failed.length
        ) {
          console.log(
            `── Drive fanset fallback : ${fansetFaces.written.length} écrits, ${fansetFaces.skipped.length} sautés, ${fansetFaces.failed.length} échecs`,
          );
        }
        const driveBack = await installNarutoCcgDriveCardBack({
          force: shared.force,
        });
        if (driveBack === "ok") {
          console.log("── Drive EN card back → back.en.webp");
        }
      }
    }
    if (wayback) {
      await scrapeNikitaNrtCards({
        force: shared.force,
        delayMs: shared.delayMs,
        concurrency: shared.concurrency,
        limit: shared.limit,
      });
      await probeSurugaVol1Listings({
        force: shared.force,
        delayMs: shared.delayMs,
      });
      await probeSurugaMissingVol1({
        force: shared.force,
        delayMs: shared.delayMs,
      });
      await scrapeSurugaCarddassCards({
        force: shared.force,
        delayMs: shared.delayMs,
        concurrency: shared.concurrency,
        limit: shared.limit,
      });
      await scrapeNikitaCardlistFacts({});
      await scrapeNikitaShippudenFaces({});
      await scrapeFrilNarutoFaces({
        force: shared.force,
        delayMs: shared.delayMs,
      });
      await scrapeAvalonNarutoFaces({
        force: shared.force,
        delayMs: shared.delayMs,
        limit: shared.limit,
      });
      await scrapeNarutoZabuzaPromo({ force: shared.force });
      await installEbayFaces({ force: shared.force });
      await installCarddasJpStagingFaces({ force: shared.force });
    }
  }
}

/** Programmatic entry (Catalogue refresh / worker) — same steps as CLI. */
export async function runNarutoPackPipeline(
  argv: readonly string[] = process.argv,
): Promise<void> {
  const bad = unknown([
    ...argListFrom(argv, "--only"),
    ...argListFrom(argv, "--skip"),
  ]);
  if (bad.length) {
    throw new Error(
      `Unknown step(s): ${bad.join(", ")}. Expected: ${STEPS.join(" | ")}`,
    );
  }

  const dryRun = argv.includes("--dry-run");
  const force = argv.includes("--force");
  const steps = selectSteps(argv);
  console.log(`── Naruto pack — étapes : ${steps.join(" → ") || "(aucune)"}`);

  // Always sync curated → data first (mtime), even for `--only index`.
  // Edits under curated/cards/ must not wait for `--only reconstruct`.
  console.log(`── curated sync${dryRun ? " (dry run)" : ""}`);
  await ensureNarutoCuratedAssets({ dryRun, force });

  for (const step of steps) {
    switch (step) {
      case "scrape":
        await runScrape(argv);
        break;
      case "reconstruct":
        // Already handled by curated sync above; keep step for `--only reconstruct`.
        break;
      case "thumbs":
        await runNarutoFixThumbsCli({ dryRun });
        break;
      case "index":
        await scrapeNarutoCards({ indexOnly: true });
        break;
      case "products": {
        const trictrac = await installTrictracPackshots({ force });
        if (trictrac.written.length || trictrac.skipped.length) {
          console.log(
            `── Tric Trac : ${trictrac.written.length} écrits, ${trictrac.skipped.length} sautés`,
          );
        }
        const shop = await installVialudibundaPackshots({ force });
        if (shop.written.length || shop.skipped.length) {
          console.log(
            `── Via Ludibunda : ${shop.written.length} écrits, ${shop.skipped.length} sautés`,
          );
        }
        const ebay = await installEbayPackshots({ force });
        if (ebay.written.length || ebay.skipped.length) {
          console.log(
            `── eBay packshots : ${ebay.written.length} écrits, ${ebay.skipped.length} sautés`,
          );
        }
        const ebayFaces = await installEbayFaces({ force });
        if (
          ebayFaces.written.length ||
          ebayFaces.skipped.length ||
          ebayFaces.failed.length
        ) {
          console.log(
            `── eBay faces : ${ebayFaces.written.length} écrits, ${ebayFaces.skipped.length} sautés, ${ebayFaces.failed.length} échecs`,
          );
        }
        const cgc = await installCardgameclubPackshots({ force });
        if (cgc.written.length || cgc.skipped.length) {
          console.log(
            `── CardGameClub : ${cgc.written.length} écrits, ${cgc.skipped.length} sautés`,
          );
        }
        const martina = await installMartinaPackshots({ force });
        if (martina.written.length || martina.skipped.length) {
          console.log(
            `── Martina : ${martina.written.length} écrits, ${martina.skipped.length} sautés`,
          );
        }
        const gcc = await installGradedcardcenterPackshots({ force });
        if (gcc.written.length || gcc.skipped.length) {
          console.log(
            `── Graded Card Center : ${gcc.written.length} écrits, ${gcc.skipped.length} sautés`,
          );
        }
        const goat = await installGoatPackshots({ force });
        if (goat.written.length || goat.skipped.length) {
          console.log(
            `── Goat EN boxes : ${goat.written.length} écrits, ${goat.skipped.length} sautés`,
          );
        }
        const scifi = await installScifiUniversePackshots({ force });
        if (scifi.written.length || scifi.skipped.length) {
          console.log(
            `── SciFi-Universe : ${scifi.written.length} écrits, ${scifi.skipped.length} sautés`,
          );
        }
        const result = await ingestNarutoSealedProducts();
        console.log(
          `── products : ${result.written} SKU (${result.skipped} sans packshot)`,
        );
        break;
      }
      case "checklist":
        await runNarutoChecklistCli({
          forceFetch: force,
        });
        break;
      case "known": {
        runNarutoKnownCardsCli();
        const completeness = writeNarutoCompleteness();
        const ja = completeness.report.locales.ja;
        console.log(
          `── complétude → ${path.basename(completeness.mdPath)} (JA image ${ja?.image.pct ?? "—"}, titre ${ja?.title.pct ?? "—"}, détail ${ja?.detail.pct ?? "—"})`,
        );
        break;
      }
      case "sources":
        runNarutoSourcesCli({ dryRun });
        break;
    }
  }
}

const thisFile = fileURLToPath(import.meta.url);
/** Absolute path to this CLI — admin extract spawns it without quoting provider id. */
export const NARUTO_CCG_CLI_PATH = thisFile;
const invoked = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invoked === thisFile) {
  runNarutoPackPipeline(process.argv).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
