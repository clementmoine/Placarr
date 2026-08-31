/**
 * Dragon Ball Fusion World pack extract — Catalogue Sync / worker (in-process).
 */
import { DBSCARDS_SITES } from "@/providers/shared/dbscards/list";
import { scrapeDbscardsIndex } from "@/providers/shared/dbscards/scrapeList";
import { scrapeTcgCardsProducts } from "@/providers/shared/dbscards/scrapeProducts";
import { logCatalogueCheckpoint } from "@/lib/admin/catalogueExtractCheckpoint";

import { DBS_FW_FACE_LANGS, fetchDbsFwFaces } from "./fetchFaces";
import { DBS_FW_PACK_ID } from "./indexStore";

import { ensureDbsFwCuratedAssets } from "./installCurated";
import { scrapeDbsFwCardDetails } from "./scrapeCardDetails";
import { scrapeDbsFwCardlist } from "./scrapeCardlist";

const STEPS = ["scrape", "dbscards", "products", "faces", "details"] as const;
type Step = (typeof STEPS)[number];
/** Everything but a local re-range needs the network. */
const ONLINE = new Set<Step>(["scrape", "dbscards", "faces", "details"]);

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

export function selectDbsFwSteps(argv: readonly string[]): Step[] {
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

  const langs = argListFrom(argv, "--langs").filter((l) =>
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
          delayMs: argValueFrom(argv, "--delay")
            ? Number(argValueFrom(argv, "--delay"))
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
        delayMs: argValueFrom(argv, "--delay")
          ? Number(argValueFrom(argv, "--delay"))
          : undefined,
        limit: argValueFrom(argv, "--limit")
          ? Number(argValueFrom(argv, "--limit"))
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
        ...(argValueFrom(argv, "--limit")
          ? { limit: Number(argValueFrom(argv, "--limit")) }
          : {}),
        ...(argValueFrom(argv, "--delay")
          ? { delayMs: Number(argValueFrom(argv, "--delay")) }
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
        limit: argValueFrom(argv, "--limit")
          ? Number(argValueFrom(argv, "--limit"))
          : undefined,
        delayMs: argValueFrom(argv, "--delay")
          ? Number(argValueFrom(argv, "--delay"))
          : undefined,
      });
    }
    if (step === "scrape") {
      await scrapeDbsFwCardlist({
        force,
        limit: argValueFrom(argv, "--limit")
          ? Number(argValueFrom(argv, "--limit"))
          : undefined,
        delayMs: argValueFrom(argv, "--delay")
          ? Number(argValueFrom(argv, "--delay"))
          : undefined,
      });
    }
    logCatalogueCheckpoint(step);
  }
}

