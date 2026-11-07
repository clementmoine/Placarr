/**
 * One Piece Card Game pack extract — Catalogue Sync / worker (in-process).
 *
 * 1. punk-records (JA original + FR + EN) → titres + printKeys
 * 2. don-cardlist.pdf extract → DON!! printKeys + art.don-cardlist.webp
 * 3. faces Bandai (img_url) → art.bandai.webp ; opecards.fr → art.opecards.webp
 * 4. opecards.fr → produits scellés
 *
 * STEPS (`--only` / `--skip` / `--offline`) : `seed` · `faces` · `products` · `documents`.
 */
import { scrapeTcgCardsProducts } from "@/providers/shared/tcgcards/scrapeProducts";
import { selectCatalogueSteps } from "@/providers/shared/cardCatalogue/catalogueSteps";
import { runLocalTcgPipeline } from "@/providers/shared/cardCatalogue/localTcgLinePipeline";
import { installProviderProductsContents } from "@/providers/shared/sealedProducts/curatedContents";
import { ensureCardsFrListDump } from "@/providers/shared/tcgcards/ensureListDump";
import { fillOpecardsFaces } from "@/providers/shared/tcgcards/fillCardsFrFaces";
import {
  OPECARDS_CARD_SITE,
  opecardsIndexPath,
} from "@/providers/shared/tcgcards/scrapeList";
import path from "node:path";

import {
  installOnepieceDonCardlistFaces,
  seedOnepieceDonFromCardlist,
} from "./donCardlist";
import { harvestOpecardsDistinctBacks } from "./opecardsBacks";
import { ONEPIECE_PACK_ID, onepieceCuratedDir } from "./pack";
import {
  harvestPunkRecords,
  installOnepieceBandaiFaces,
  promoteAndPurgePunkRecordsStaging,
  seedOnepieceFromPunkRecords,
} from "./punkRecords";

const ONEPIECE_PRODUCTS_CONTENTS = path.join(
  onepieceCuratedDir(),
  "products-contents.json",
);

export const ONEPIECE_STEPS = [
  "seed",
  "faces",
  "products",
  "documents",
] as const;
export type OnepieceStep = (typeof ONEPIECE_STEPS)[number];
/*
  Documents need the network. `--offline` skips punk-records / backs harvest
  (gated below) and documents; seed from local staging, Bandai install, and
  products (`offline: true`) still run.
*/
const ONEPIECE_ONLINE = new Set<OnepieceStep>(["documents"]);

export function selectOnepieceSteps(argv: readonly string[]): OnepieceStep[] {
  return selectCatalogueSteps(argv, ONEPIECE_STEPS, { online: ONEPIECE_ONLINE });
}

export async function runOnepiecePackPipeline(
  argv: readonly string[] = [],
): Promise<{ cards: number; products: number }> {
  const force = argv.includes("--force");
  const offline = argv.includes("--offline");
  const steps = selectOnepieceSteps(argv);
  console.log(
    `── One Piece Card Game — étapes : ${steps.join(" → ") || "(curated only)"}`,
  );

  if (steps.includes("documents")) {
    try {
      const { loadOnepieceCuratedDocuments } = await import(
        "@/providers/onepiece/curated/documents"
      );
      const { harvestPackDocuments } = await import(
        "@/providers/shared/documents/harvestPackDocuments"
      );
      const docs = await harvestPackDocuments({
        packId: ONEPIECE_PACK_ID,
        curated: loadOnepieceCuratedDocuments(),
        force,
      });
      console.log(
        `── documents : ${docs.fetched} fetched, ${docs.skipped} skipped, ` +
          `${docs.urlOnly} url-only, ${docs.failed} failed / ${docs.total}`,
      );
    } catch (err) {
      console.warn(
        `── documents — ${err instanceof Error ? err.message : err}`,
      );
    }
    if (steps.length === 1) return { cards: 0, products: 0 };
  }

  const skipBacks =
    argv.includes("--skip-backs") || skipToken(argv, "backs");
  const skipOpecardsList =
    argv.includes("--skip-opecards-list") || skipToken(argv, "opecards-list");
  const maxPagesRaw = (() => {
    const i = argv.indexOf("--max-pages");
    return i >= 0 ? Number(argv[i + 1]) : undefined;
  })();
  const faceLimitRaw = (() => {
    const i = argv.indexOf("--face-limit");
    return i >= 0 ? Number(argv[i + 1]) : undefined;
  })();

  if (steps.includes("seed") && !offline) {
    const harvested = await harvestPunkRecords({ force });
    console.log(
      `── punk-records — ${harvested.ok} mis à jour, ${harvested.skip} inchangé${harvested.skip === 1 ? "" : "s"}, ${harvested.fail} manqué${harvested.fail === 1 ? "" : "s"} (${harvested.cards} cartes brutes)`,
    );
    if (!skipBacks) {
      const backs = await harvestOpecardsDistinctBacks({ force });
      console.log(
        `── opecards backs — observés ${backs.observedCount}, défaut=${backs.defaultSlug ?? "—"}, installés [${backs.installed.join(", ") || "—"}], skip défaut [${backs.skippedDefault.join(", ") || "—"}], CDN miss [${backs.missing.join(", ") || "—"}]`,
      );
    }
  }

  return runLocalTcgPipeline({
    packId: ONEPIECE_PACK_ID,
    curatedDir: onepieceCuratedDir(),
    label: "One Piece Card Game",
    seed: async (index) => {
      let seeded = { prints: 0, titles: 0 };
      if (steps.includes("seed")) {
        seeded = seedOnepieceFromPunkRecords(index);
        console.log(
          `── punk-records seed — ${seeded.prints} tirage${seeded.prints === 1 ? "" : "s"}, ${seeded.titles} titre${seeded.titles === 1 ? "" : "s"}`,
        );
        if (seeded.prints > 0) {
          const purged = promoteAndPurgePunkRecordsStaging();
          if (purged.purged) {
            console.log("── punk-records staging — purgé (indexes → logs/)");
          }
        }
        const don = seedOnepieceDonFromCardlist(index);
        if (don.skipped) {
          console.log(
            "── don-cardlist seed — skip (pas d'extract staging/don-cardlist-extract)",
          );
        } else {
          console.log(
            `── don-cardlist seed — ${don.prints} tirage${don.prints === 1 ? "" : "s"}, ${don.titles} titre${don.titles === 1 ? "" : "s"}`,
          );
          seeded = {
            prints: seeded.prints + don.prints,
            titles: seeded.titles + don.titles,
          };
        }
        if (!skipOpecardsList && !offline) {
          const list = await ensureCardsFrListDump({
            packId: ONEPIECE_PACK_ID,
            site: OPECARDS_CARD_SITE,
            indexPath: opecardsIndexPath("fr"),
            force,
            maxPages: Number.isFinite(maxPagesRaw) ? maxPagesRaw : undefined,
            label: "opecards.fr",
          });
          console.log(
            `── opecards.fr list — ${list.cards} tuiles, ${list.priced} cotes, ${list.pages} pages → ${list.file}`,
          );
        }
      }

      if (steps.includes("faces")) {
        console.log("── faces Bandai — téléchargement / pose en cours…");
        const faces = await installOnepieceBandaiFaces(index, {
          force,
          // offline : on pose seulement les fichiers déjà téléchargés / skip
        });
        console.log(
          `── faces Bandai — ${faces.faces} écrites, ${faces.skip} déjà là, ${faces.fail} manquée${faces.fail === 1 ? "" : "s"}`,
        );
        const donFaces = await installOnepieceDonCardlistFaces(index, {
          force,
        });
        console.log(
          `── faces don-cardlist — ${donFaces.faces} écrites, ${donFaces.skip} déjà là, ${donFaces.fail} manquée${donFaces.fail === 1 ? "" : "s"}`,
        );
        if (!offline) {
          const shop = await fillOpecardsFaces({
            index,
            force,
            refreshIndex: false,
            maxPages: Number.isFinite(maxPagesRaw) ? maxPagesRaw : undefined,
            limit: Number.isFinite(faceLimitRaw) ? faceLimitRaw : undefined,
          });
          console.log(
            `── opecards.fr faces — ${shop.written} écrites, ${shop.skipped} déjà là, ${shop.unmapped} sans clé, ${shop.unknownPrint} hors catalogue, ${shop.failed} échecs (${shop.indexCards} tuiles)`,
          );
        }
      }

      return seeded;
    },
    seedProducts: steps.includes("products")
      ? async () => {
          installProviderProductsContents(
            ONEPIECE_PACK_ID,
            ONEPIECE_PRODUCTS_CONTENTS,
          );
          const products = await scrapeTcgCardsProducts("opecards", {
            force,
            offline,
            onProgress: (message) => console.log(`   products — ${message}`),
          });
          return {
            written: products.detail || products.listed,
            skipped: 0,
          };
        }
      : undefined,
  });
}

/** `--skip faces,backs,…` from shared catalogue refresh argv. */
function skipToken(argv: readonly string[], token: string): boolean {
  const idx = argv.indexOf("--skip");
  if (idx < 0) return false;
  const csv = argv[idx + 1] ?? "";
  return csv
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .includes(token);
}
