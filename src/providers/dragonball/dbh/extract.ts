/**
 * Dragon Ball Heroes pack extract — scrape carddass.com then seed index.
 *
 * STEPS (`--only` / `--skip` / `--offline`) : `scrape` · `seed` · `faces` · `products`.
 * `--skip-scrape` / `--skip-faces` remain aliases.
 */
import path from "node:path";

import {
  catalogueArgList,
  selectCatalogueSteps,
} from "@/providers/shared/cardCatalogue/catalogueSteps";
import { runLocalTcgPipeline } from "@/providers/shared/cardCatalogue/localTcgLinePipeline";
import { installProviderProductsContents } from "@/providers/shared/sealedProducts/curatedContents";

import { installDbhFromLedger } from "./install/fromLedgers";
import { DBH_PACK_ID, dbhCuratedDir } from "./pack";
import { scrapeDbhCardlists } from "./scrape/cardlist";
import { ingestDbhSealedProducts } from "./sealed";

export const DBH_STEPS = ["scrape", "seed", "faces", "products"] as const;
export type DbhStep = (typeof DBH_STEPS)[number];
const DBH_ONLINE = new Set<DbhStep>(["scrape", "faces"]);

export function selectDbhSteps(argv: readonly string[]): DbhStep[] {
  return selectCatalogueSteps(withLegacySkipAliases(argv), DBH_STEPS, {
    online: DBH_ONLINE,
  });
}

function withLegacySkipAliases(argv: readonly string[]): readonly string[] {
  let out = [...argv];
  if (argv.includes("--skip-scrape")) {
    out = injectSkipToken(out, "scrape");
  }
  if (argv.includes("--skip-faces")) {
    out = injectSkipToken(out, "faces");
  }
  return out.filter(
    (token) => token !== "--skip-scrape" && token !== "--skip-faces",
  );
}

function injectSkipToken(argv: string[], token: string): string[] {
  const skip = catalogueArgList(argv, "--skip");
  if (skip.includes(token)) return argv;
  const next: string[] = [];
  let injected = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--skip") {
      const csv = argv[i + 1];
      if (csv && !csv.startsWith("--")) {
        next.push("--skip", `${csv},${token}`);
        i += 1;
        injected = true;
        continue;
      }
    }
    next.push(argv[i]!);
  }
  if (!injected) next.push("--skip", token);
  return next;
}

export async function runDbhPackPipeline(
  argv: readonly string[] = [],
): Promise<{ cards: number; products: number }> {
  const steps = selectDbhSteps(argv);
  console.log(
    `── Dragon Ball Heroes — étapes : ${steps.join(" → ") || "(curated only)"}`,
  );

  const maxCatArg = argv.find((a) => a.startsWith("--max-categories="));
  const maxCategories = maxCatArg
    ? Number(maxCatArg.split("=")[1])
    : undefined;

  if (steps.includes("scrape")) {
    const scraped = await scrapeDbhCardlists({
      maxCategories:
        Number.isFinite(maxCategories) && (maxCategories ?? 0) > 0
          ? maxCategories
          : undefined,
    });
    console.log(
      `── DBH scrape — ${scraped.categories} catégories, ${scraped.cards.length} cartes → ${scraped.outPath}`,
    );
  }

  if (steps.includes("products")) {
    installProviderProductsContents(
      DBH_PACK_ID,
      path.join(dbhCuratedDir(), "products-contents.json"),
    );
  }

  return runLocalTcgPipeline({
    packId: DBH_PACK_ID,
    curatedDir: dbhCuratedDir(),
    label: "Dragon Ball Heroes",
    seed:
      steps.includes("seed") || steps.includes("faces")
        ? async (index) => {
            const installed = await installDbhFromLedger(index, {
              downloadFaces: steps.includes("faces"),
            });
            console.log(
              `── DBH seed — ${installed.prints} prints, ${installed.titles} titles, ${installed.faces} faces`,
            );
            return { prints: installed.prints, titles: installed.titles };
          }
        : undefined,
    seedProducts: steps.includes("products")
      ? () => ingestDbhSealedProducts()
      : undefined,
  });
}
