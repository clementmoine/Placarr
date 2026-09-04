/**
 * Naruto Carddass pack extract — Catalogue Sync / worker (in-process).
 *
 * Catalogue: data/naruto/carddass/cards/{family}/{ni0001|n0001}/{lang}/
 * Curated tree: src/providers/narutocarddass/curated/cards/
 * Steps: scrape → reconstruct → index → products → thumbs → checklist → known → sources
 * (resume via --skip / --only from the admin extract plan).
 */
import path from "node:path";
import "dotenv/config";

import { logCatalogueCheckpoint } from "@/lib/admin/catalogueExtractCheckpoint";
import { runNarutoChecklist } from "./buildCoverageChecklist";
import { runNarutoSources } from "./buildApacheIndex";
import { runNarutoFixThumbs } from "./fixThumbs";
import { ensureNarutoCuratedAssets } from "./install/installReconstructed";
import { runNarutoKnownCards } from "./knownCards";
import { scrapeNarutoEnCards } from "./scrape/scrapeBandaicgCards";
import { scrapeNarutoJpCards } from "./scrape/scrapeCarddasJp";
import { scrapeNarutoCards } from "./scrape/scrapeCards";
import { scrapeNarutoColekaCarddassFrCards } from "./scrape/scrapeColekaCarddassFr";
import { scrapeNarutoColekaS6ItCards } from "./scrape/scrapeColekaS6It";
import {
  scrapeNarutoColekaSagesLegacyCards,
  scrapeNarutoColekaStorm3Cards,
} from "./scrape/scrapeColekaStorm3";
import { scrapeNarutoStorm3Cards } from "./scrape/scrapeStorm3";
import { scrapeCardgameclubItFaces } from "./scrape/scrapeCardgameclubIt";
import { scrapePrimegameIt } from "./scrape/scrapePrimegameIt";
import { scrapeGoatEnCcgTitles } from "./scrape/scrapeGoatEnCcg";
import { scrapeNarutoCardsCaTitles } from "./scrape/scrapeNarutoCardsCa";
import { scrapeNarutoCardsNetTitles } from "./scrape/scrapeNarutoCardsNet";
import { scrapeCollectorsCometTitles } from "./scrape/scrapeCollectorsCometTitles";
import { scrapeNarutoZabuzaPromo } from "./scrape/scrapeNarutoZabuza";
import { scrapeNikitaNrtCards } from "./scrape/scrapeNikitaNrt";
import { scrapeSurugaCarddassCards } from "./scrape/scrapeSurugaCarddass";
import { scrapeNarutoChitoroshopCards } from "./scrape/scrapeChitoroshop";
import { scrapeUltrajeuxS5Holes } from "./scrape/scrapeUltrajeuxS5";
import { scrapeVintageNarutoCcgFaces } from "./scrape/scrapeVintageNarutoCcg";
import { installCarddasJpStagingFaces } from "./install/installCarddasJpStagingFaces";
import { installCarddasDoubleIllustrationFaces } from "./install/installCarddasDoubleIllustrationFaces";
import { installSlabzFaces } from "./install/installSlabzFaces";
import { scrapeNarutoCardGameGgCards } from "./scrape/scrapeNarutoCardGameGg";
import { harvestCarddasVol1Faces } from "./harvest/harvestCarddasVol1Faces";
import { probeSurugaVol1Listings } from "./probeSurugaVol1Listings";
import { probeSurugaMissingVol1 } from "./probeSurugaMissingVol1";
import {
  harvestNarutoCcgDriveStaging,
  driveStagingHubFileCount,
  driveStagingHubPopulated,
} from "./harvest/harvestNarutoCcgDriveStaging";
import { ingestNarutoCcgDriveLocalExport } from "./ingestNarutoCcgDriveLocalExport";
import {
  installNarutoCcgDriveCardBack,
  installNarutoCcgDriveFaces,
  installNarutoCcgDriveFansetFallbacks,
} from "./install/installNarutoCcgDriveFaces";
import { installCardgameclubPackshots } from "./install/installCardgameclubPackshots";
import { installEbayPackshots } from "./install/installEbayPackshots";
import { installEbayFaces } from "./install/installEbayFaces";
import { installLeboncoinFaces } from "./install/installLeboncoinFaces";
import { installRakutenFaces } from "./install/installRakutenFaces";
import { installGoatLocalePromoFaces } from "./install/installGoatLocalePromoFaces";
import { scrapeNarutoColekaUsPromoCards } from "./sources/colekaUsPromos";
import { scrapeAvalonNarutoFaces } from "./scrape/scrapeAvalonShop";
import { writeNarutoCompleteness } from "./buildCompleteness";
import { scrapeFrilNarutoFaces } from "./scrape/scrapeFrilShop";
import {
  scrapeNikitaCardlistFacts,
  scrapeNikitaShippudenFaces,
} from "./scrape/scrapeNikitaCardlist";
import { installGoatPackshots } from "./install/installGoatPackshots";
import { installGradedcardcenterPackshots } from "./install/installGradedcardcenterPackshots";
import { installMartinaPackshots } from "./install/installMartinaPackshots";
import { installMangaSanctuaryPackshots } from "./install/installMangaSanctuaryPackshots";
import { installVintedPackshots } from "./install/installVintedPackshots";
import { installLeboncoinPackshots } from "./install/installLeboncoinPackshots";
import { installKinkaiPackshots } from "./install/installKinkaiPackshots";
import { installSunnystorePackshots } from "./install/installSunnystorePackshots";
import { installScifiUniversePackshots } from "./install/installScifiUniversePackshots";
import { installTrictracPackshots } from "./install/installTrictracPackshots";
import { installVialudibundaPackshots } from "./install/installVialudibunda";
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
    } else if (
      locale === "s24" ||
      locale === "sages" ||
      locale === "sageslegacy" ||
      locale === "sage"
    ) {
      // Sage's Legacy FR runs after this loop (Coleka, not Wayback).
    } else if (locale === "s6it" || locale === "ita" || locale === "rivalita") {
      // Italian S6 runs after this loop (Coleka, not Wayback).
    } else if (locale === "colekafr" || locale === "coleka-fr") {
      // French Carddass Coleka leaves run after this loop.
    } else if (locale === "ultrajeux") {
      // S5 hole JPEGs run after this loop.
    } else if (locale === "drive" || locale === "drive-enhanced") {
      // Drive Enhanced runs after this loop.
    } else if (
      locale === "uspromos" ||
      locale === "us-promos" ||
      locale === "coleka-us-promos"
    ) {
      // Coleka EN CCG promos run after this loop.
    } else {
      throw new Error(
        `Unknown --locale ${locale} (expected fr | en | jap | storm3 | s24 | s6it | colekafr | ultrajeux | drive | uspromos).`,
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
    const sages = locales.some((locale) =>
      ["s24", "sages", "sageslegacy", "sage"].includes(locale),
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
    const uspromos = locales.some((locale) =>
      ["uspromos", "us-promos", "coleka-us-promos"].includes(locale),
    );
    // Default `--locale fr` still finishes Storm 3 + S6 IT after Wayback.
    if (wayback || storm3) {
      await scrapeNarutoStorm3Cards(shared);
      await scrapeNarutoColekaStorm3Cards(shared);
    }
    if (wayback || sages) {
      await scrapeNarutoColekaSagesLegacyCards(shared);
    }
    if (wayback || s6it) {
      await scrapeNarutoColekaS6ItCards(shared);
      await scrapeCardgameclubItFaces({
        force: shared.force,
        delayMs: shared.delayMs,
        limit: shared.limit,
      });
      await scrapePrimegameIt({
        force: shared.force,
        delayMs: shared.delayMs,
        limit: shared.limit,
        faces: true,
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
      await scrapeNarutoCardsNetTitles({
        force: shared.force,
      });
      await scrapeCollectorsCometTitles({
        force: shared.force,
        delayMs: shared.delayMs,
      });
      await scrapeVintageNarutoCcgFaces({
        force: shared.force,
        delayMs: shared.delayMs,
        concurrency: shared.concurrency,
        limit: shared.limit,
      });
      await scrapeNarutoCardGameGgCards({
        force: shared.force,
        delayMs: shared.delayMs,
        limit: shared.limit,
      });
    }
    if (wayback || uspromos) {
      await scrapeNarutoColekaUsPromoCards(shared);
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
      await scrapeNarutoChitoroshopCards({
        force: shared.force,
        delayMs: shared.delayMs,
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
      await installLeboncoinFaces({ force: shared.force });
      await installRakutenFaces({ force: shared.force });
      await installSlabzFaces({ force: shared.force });
      await installGoatLocalePromoFaces({ force: shared.force });
      await installCarddasJpStagingFaces({ force: shared.force });
      await installCarddasDoubleIllustrationFaces({ force: shared.force });
    }
  }
}

/** Programmatic entry (Catalogue refresh / worker) — same steps as CLI. */
export async function runNarutoPackPipeline(
  argv: readonly string[] = [],
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
        await runNarutoFixThumbs({ dryRun });
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
        const rakutenFaces = await installRakutenFaces({ force });
        if (
          rakutenFaces.written.length ||
          rakutenFaces.skipped.length ||
          rakutenFaces.failed.length
        ) {
          console.log(
            `── Rakuten faces : ${rakutenFaces.written.length} écrits, ${rakutenFaces.skipped.length} sautés, ${rakutenFaces.failed.length} échecs`,
          );
        }
        const slabzFaces = await installSlabzFaces({ force });
        if (
          slabzFaces.written.length ||
          slabzFaces.skipped.length ||
          slabzFaces.failed.length
        ) {
          console.log(
            `── Slabz faces : ${slabzFaces.written.length} écrits, ${slabzFaces.skipped.length} sautés, ${slabzFaces.failed.length} échecs`,
          );
        }
        const carddasDoubles = await installCarddasDoubleIllustrationFaces({
          force,
        });
        if (
          carddasDoubles.written.length ||
          carddasDoubles.skipped.length ||
          carddasDoubles.failed.length
        ) {
          console.log(
            `── Carddas doubles : ${carddasDoubles.written.length} écrits, ${carddasDoubles.skipped.length} sautés, ${carddasDoubles.failed.length} échecs`,
          );
        }
        const lbcFaces = await installLeboncoinFaces({ force });
        if (
          lbcFaces.written.length ||
          lbcFaces.skipped.length ||
          lbcFaces.failed.length
        ) {
          console.log(
            `── Leboncoin faces : ${lbcFaces.written.length} écrits, ${lbcFaces.skipped.length} sautés, ${lbcFaces.failed.length} échecs`,
          );
        }
        const goatLocaleFaces = await installGoatLocalePromoFaces({ force });
        if (
          goatLocaleFaces.written.length ||
          goatLocaleFaces.skipped.length ||
          goatLocaleFaces.failed.length
        ) {
          console.log(
            `── Goat locale promos : ${goatLocaleFaces.written.length} écrits, ${goatLocaleFaces.skipped.length} sautés, ${goatLocaleFaces.failed.length} échecs`,
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
        const mangaSanctuary = await installMangaSanctuaryPackshots({ force });
        if (mangaSanctuary.written.length || mangaSanctuary.skipped.length) {
          console.log(
            `── Manga Sanctuary : ${mangaSanctuary.written.length} écrits, ${mangaSanctuary.skipped.length} sautés`,
          );
        }
        const vinted = await installVintedPackshots({ force });
        if (vinted.written.length || vinted.skipped.length) {
          console.log(
            `── Vinted : ${vinted.written.length} écrits, ${vinted.skipped.length} sautés`,
          );
        }
        const lbcPack = await installLeboncoinPackshots({ force });
        if (lbcPack.written.length || lbcPack.skipped.length) {
          console.log(
            `── Leboncoin packshots : ${lbcPack.written.length} écrits, ${lbcPack.skipped.length} sautés`,
          );
        }
        const kinkai = await installKinkaiPackshots({ force });
        if (kinkai.written.length || kinkai.skipped.length) {
          console.log(
            `── Kinkai packshots : ${kinkai.written.length} écrits, ${kinkai.skipped.length} sautés`,
          );
        }
        const sunny = await installSunnystorePackshots({ force });
        if (sunny.written.length || sunny.skipped.length) {
          console.log(
            `── Sunny Store : ${sunny.written.length} écrits, ${sunny.skipped.length} sautés`,
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
        await runNarutoChecklist({
          forceFetch: force,
        });
        break;
      case "known": {
        runNarutoKnownCards();
        const completeness = writeNarutoCompleteness();
        const ja = completeness.report.locales.ja;
        console.log(
          `── complétude → ${path.basename(completeness.mdPath)} (JA image ${ja?.image.pct ?? "—"}, titre ${ja?.title.pct ?? "—"}, détail ${ja?.detail.pct ?? "—"})`,
        );
        break;
      }
      case "sources":
        runNarutoSources({ dryRun });
        break;
    }
    logCatalogueCheckpoint(step);
  }
}

