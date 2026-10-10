/**
 * Dragon Ball Fusion World pack extract — Catalogue Sync / worker (in-process).
 */
import { DBSCARDS_SITES } from "@/providers/shared/tcgcards/list";
import { scrapeDbscardsIndex } from "@/providers/shared/tcgcards/scrapeList";
import { scrapeTcgCardsProducts } from "@/providers/shared/tcgcards/scrapeProducts";
import { logCatalogueCheckpoint } from "@/lib/admin/catalogueExtractCheckpoint";
import {
  catalogueArgList,
  catalogueArgValue,
  selectCatalogueSteps,
} from "@/providers/shared/cardCatalogue/catalogueSteps";

import { DBS_FW_FACE_LANGS, fetchDbsFwFaces } from "./disk/fetchFaces";
import { DBS_FW_PACK_ID } from "./indexStore";

import { ensureDbsFwCuratedAssets } from "./install/curated";
import { scrapeDbsFwCardDetails } from "./scrape/cardDetails";
import { scrapeDbsFwCardlist } from "./scrape/cardlist";

const STEPS = ["scrape", "dbscards", "products", "faces", "details"] as const;
type Step = (typeof STEPS)[number];
/** Everything but a local re-range needs the network. */
const ONLINE = new Set<Step>(["scrape", "dbscards", "faces", "details"]);

export function selectDbsFwSteps(argv: readonly string[]): Step[] {
  return selectCatalogueSteps(argv, STEPS, { online: ONLINE });
}

export async function runDbsFwPackPipeline(
  argv: readonly string[] = [],
): Promise<void> {
  const dryRun = argv.includes("--dry-run");
  const force = argv.includes("--force");
  const steps = selectDbsFwSteps(argv);
  console.log(
    `── DBS Fusion World — étapes : ${steps.join(" → ") || "(curated only)"}`,
  );

  console.log(`── curated sync${dryRun ? " (dry run)" : ""}`);
  await ensureDbsFwCuratedAssets({ dryRun, force });

  const langs = catalogueArgList(argv, "--langs").filter((l) =>
    (DBS_FW_FACE_LANGS as readonly string[]).includes(l),
  );

  for (const step of steps) {
    if (step === "dbscards") {
      /*
        Fusion World lives on `fw.dbscards.fr`, same software as Masters. One
        request per thirty cards gives the real face URLs this pack has never
        had — it shipped with no local image at all.
      */
      for (const lang of langs.length ? langs : DBS_FW_FACE_LANGS) {
        const result = await scrapeDbscardsIndex({
          packId: DBS_FW_PACK_ID,
          site: DBSCARDS_SITES.fusion,
          lang,
          delayMs: catalogueArgValue(argv, "--delay")
            ? Number(catalogueArgValue(argv, "--delay"))
            : undefined,
          onProgress: (page, total) => {
            if (page % 20 === 0) {
              console.log(
                `   dbscards fw ${lang} — page ${page}, ${total} cartes`,
              );
            }
          },
        });
        console.log(
          `── dbscards fw ${lang} : ${result.cards} cartes sur ${result.pages} pages ` +
            `(${result.withBack} avec verso)`,
        );
      }
    }
    if (step === "products") {
      const result = await scrapeTcgCardsProducts("fusion", {
        force,
        offline: argv.includes("--offline"),
        delayMs: catalogueArgValue(argv, "--delay")
          ? Number(catalogueArgValue(argv, "--delay"))
          : undefined,
        limit: catalogueArgValue(argv, "--limit")
          ? Number(catalogueArgValue(argv, "--limit"))
          : undefined,
        onProgress: (message) => console.log(`   products — ${message}`),
      });
      console.log(
        `── products : ${result.listed} SKU, ${result.detail} fiches, ` +
          `${result.printsLinked} liens carte (${result.fetched} GET, ` +
          `${result.catalogCompleted} complétés catalogue)`,
      );
    }
    if (step === "faces") {
      const result = await fetchDbsFwFaces({
        force,
        ...(langs.length ? { langs } : {}),
        ...(catalogueArgValue(argv, "--limit")
          ? { limit: Number(catalogueArgValue(argv, "--limit")) }
          : {}),
        ...(catalogueArgValue(argv, "--delay")
          ? { delayMs: Number(catalogueArgValue(argv, "--delay")) }
          : {}),
      });
      console.log(
        `── fw faces : ok=${result.ok} skip=${result.skip} miss=${result.miss} fail=${result.fail}`,
      );
    }
    if (step === "details") {
      /*
        La liste de cartes ne donne qu'un numéro, un nom et une image : 3 962
        tirages sans une seule rareté. La fiche détaillée porte le reste, et
        une seule fiche sert toutes les illustrations d'un numéro — 1 927
        requêtes au lieu de 3 962. Les fiches déjà tenues ne sont pas relues.
      */
      await scrapeDbsFwCardDetails({
        force,
        limit: catalogueArgValue(argv, "--limit")
          ? Number(catalogueArgValue(argv, "--limit"))
          : undefined,
        delayMs: catalogueArgValue(argv, "--delay")
          ? Number(catalogueArgValue(argv, "--delay"))
          : undefined,
      });
    }
    if (step === "scrape") {
      await scrapeDbsFwCardlist({
        force,
        limit: catalogueArgValue(argv, "--limit")
          ? Number(catalogueArgValue(argv, "--limit"))
          : undefined,
        delayMs: catalogueArgValue(argv, "--delay")
          ? Number(catalogueArgValue(argv, "--delay"))
          : undefined,
      });
    }
    logCatalogueCheckpoint(step);
  }
}

