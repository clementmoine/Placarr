/**
 * Dragon Ball Super Masters pack extract — Catalogue Sync / worker (in-process).
 */
import { fetchDbsCgFaces } from "./disk/fetchFaces";
import { buildDbsCgFacts } from "./harvest/buildMastersFacts";
import { ensureArenaClone, installArenaFaces } from "./install/arena";
import { ensureDbsCgCuratedAssets } from "./install/curated";
import type { DbsCardlistLocaleId } from "./parse/cardlist";
import {
  mergeDbscardsTokensIntoCatalog,
  scrapeDbsCgCardlist,
} from "./scrape/cardlist";
import { scrapeDbscardsIndex } from "@/providers/shared/tcgcards/scrapeList";
import { scrapeTcgCardsProducts } from "@/providers/shared/tcgcards/scrapeProducts";
import { logCatalogueCheckpoint } from "@/lib/admin/catalogueExtractCheckpoint";

import { DBS_CG_PACK_ID } from "./indexStore";

const STEPS = ["scrape", "dbscards", "products", "arena", "faces"] as const;
type Step = (typeof STEPS)[number];
const ONLINE = new Set<Step>(["scrape", "dbscards", "faces"]);

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

export function selectDbsCgSteps(argv: readonly string[]): Step[] {
  const only = argListFrom(argv, "--only");
  const skip = new Set(argListFrom(argv, "--skip"));
  const offline = argv.includes("--offline");
  const base = only.length
    ? STEPS.filter((step) => only.includes(step))
    : [...STEPS];
  return base.filter(
    (step) => !skip.has(step) && !(offline && ONLINE.has(step)),
  );
}

/** `--langs fr,en` (default both). Unknown tokens are dropped. */
export function dbsCgScrapeLangs(
  argv: readonly string[],
): DbsCardlistLocaleId[] {
  const picked = argListFrom(argv, "--langs").filter(
    (value): value is DbsCardlistLocaleId => value === "fr" || value === "en",
  );
  return picked.length ? picked : ["fr", "en"];
}

function optionalNumber(
  argv: readonly string[],
  name: string,
): number | undefined {
  const raw = argValueFrom(argv, name);
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * `--limit` on a full run caps Bandai series, not individual faces.
 * Print cap only applies to `--only faces`.
 */
export function dbsCgFaceDownloadLimit(
  argv: readonly string[],
  steps: readonly string[],
): number | undefined {
  if (steps.includes("scrape")) return undefined;
  return optionalNumber(argv, "--limit");
}

/** Print cap for `--only arena`. A full run ranges the whole dump. */
export function dbsCgArenaLimit(
  argv: readonly string[],
  steps: readonly string[],
): number | undefined {
  if (steps.length !== 1 || steps[0] !== "arena") return undefined;
  return optionalNumber(argv, "--limit");
}

export async function runDbsCgPackPipeline(
  argv: readonly string[] = [],
): Promise<void> {
  const dryRun = argv.includes("--dry-run");
  const force = argv.includes("--force");
  const offline = argv.includes("--offline");
  const langs = dbsCgScrapeLangs(argv);
  const steps = selectDbsCgSteps(argv);
  console.log(
    `── DBS Masters — étapes : ${steps.join(" → ") || "(curated only)"} [${langs.join(",")}]`,
  );

  console.log(`── curated sync${dryRun ? " (dry run)" : ""}`);
  await ensureDbsCgCuratedAssets({ dryRun, force });

  for (const step of steps) {
    if (step === "scrape") {
      await scrapeDbsCgCardlist({
        force,
        langs,
        limit: optionalNumber(argv, "--limit"),
        delayMs: optionalNumber(argv, "--delay"),
      });
    }
    if (step === "dbscards") {
      /*
        Their list before the faces pass, which reads it: one request per
        thirty cards, giving real URLs instead of slugs built from printed
        names. `--langs` picks which locales' lists to read.
      */
      for (const lang of langs) {
        const result = await scrapeDbscardsIndex({
          packId: DBS_CG_PACK_ID,
          lang,
          delayMs: optionalNumber(argv, "--delay"),
          onProgress: (page, total) => {
            if (page % 20 === 0) {
              console.log(
                `   dbscards ${lang} — page ${page}, ${total} cartes`,
              );
            }
          },
        });
        console.log(
          `── dbscards ${lang} : ${result.cards} cartes sur ${result.pages} pages ` +
            `(${result.priced} cotées, ${result.withBack} avec verso)`,
        );
      }
      const tokens = mergeDbscardsTokensIntoCatalog();
      if (tokens.added) {
        console.log(
          `── jetons TK : +${tokens.added} → ${tokens.printCount} prints`,
        );
      }
    }
    if (step === "products") {
      const result = await scrapeTcgCardsProducts("masters", {
        force,
        offline,
        delayMs: optionalNumber(argv, "--delay"),
        limit: optionalNumber(argv, "--limit"),
        onProgress: (message) => console.log(`   products — ${message}`),
      });
      console.log(
        `── products : ${result.listed} SKU, ${result.detail} fiches, ` +
          `${result.printsLinked} liens carte (${result.fetched} GET, ` +
          `${result.catalogCompleted} complétés catalogue)`,
      );
    }
    if (step === "arena") {
      const ready = ensureArenaClone({ offline });
      if (!ready) {
        console.warn("── arena : rien à ranger");
      } else {
        await installArenaFaces({
          force,
          limit: dbsCgArenaLimit(argv, steps),
        });
        // Le clone porte aussi `masters_superset.json` : texte des cartes,
        // traits, ère, coûts, verso, statut tournoi et errata. Les visuels
        // seuls laissaient tout ça sur le disque sans jamais l'ouvrir.
        buildDbsCgFacts();
        const {
          packCatalogIngestLedgerPath,
          recordCatalogPromoteAndPurgeStaging,
        } = await import("@/providers/shared/catalogIngestLedger");
        const { arenaStagingDir } = await import("./install/arena");
        const staging = arenaStagingDir();
        // Prefer git HEAD (stable across re-install); fallback to prior ledger.
        let contentHash: string | null = null;
        try {
          const { execFileSync } = await import("node:child_process");
          contentHash = execFileSync("git", ["-C", staging, "rev-parse", "HEAD"], {
            encoding: "utf8",
          }).trim();
        } catch {
          const prior = (
            await import("@/providers/shared/catalogIngestLedger")
          ).readCatalogIngestLedger(
            packCatalogIngestLedgerPath(DBS_CG_PACK_ID),
          ).entries["dbs-cg:arena-clone"]?.contentHash;
          contentHash = prior ?? null;
        }
        if (contentHash) {
          recordCatalogPromoteAndPurgeStaging({
            ledgerPath: packCatalogIngestLedgerPath(DBS_CG_PACK_ID),
            artefactId: "dbs-cg:arena-clone",
            contentHash,
            stagingPath: staging,
          });
          console.log("── arena staging — purgé (faces + facts promus)");
        }
      }
    }
    if (step === "faces") {
      await fetchDbsCgFaces({
        force,
        langs,
        limit: dbsCgFaceDownloadLimit(argv, steps),
        delayMs: optionalNumber(argv, "--delay"),
        concurrency: optionalNumber(argv, "--concurrency"),
      });
    }
    logCatalogueCheckpoint(step);
  }
}

