/**
 * One Piece Card Game pack extract — Catalogue Sync / worker (in-process).
 *
 * 1. punk-records (FR+EN) → titres + printKeys
 * 2. faces Bandai (img_url) → art.bandai.webp
 * 3. opecards.fr → produits scellés
 */
import { scrapeTcgCardsProducts } from "@/providers/shared/dbscards/scrapeProducts";
import { runLocalTcgPipeline } from "@/providers/shared/cardCatalogue/localTcgLinePipeline";

import { harvestOpecardsDistinctBacks } from "./opecardsBacks";
import { ONEPIECE_PACK_ID, onepieceCuratedDir } from "./pack";
import {
  harvestPunkRecords,
  installOnepieceBandaiFaces,
  seedOnepieceFromPunkRecords,
} from "./punkRecords";

export async function runOnepiecePackPipeline(
  argv: readonly string[] = [],
): Promise<{ cards: number; products: number }> {
  const force = argv.includes("--force");
  const offline = argv.includes("--offline");
  const skipFaces =
    argv.includes("--skip-faces") || skipToken(argv, "faces");
  const skipProducts =
    argv.includes("--skip-products") || skipToken(argv, "products");
  const skipBacks =
    argv.includes("--skip-backs") || skipToken(argv, "backs");

  if (!offline) {
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
      const seeded = seedOnepieceFromPunkRecords(index);
      console.log(
        `── punk-records seed — ${seeded.prints} tirage${seeded.prints === 1 ? "" : "s"}, ${seeded.titles} titre${seeded.titles === 1 ? "" : "s"}`,
      );
      if (!skipFaces) {
        console.log("── faces Bandai — téléchargement / pose en cours…");
        const faces = await installOnepieceBandaiFaces(index, {
          force,
          // offline : on pose seulement les fichiers déjà téléchargés / skip
        });
        console.log(
          `── faces Bandai — ${faces.faces} écrites, ${faces.skip} déjà là, ${faces.fail} manquée${faces.fail === 1 ? "" : "s"}`,
        );
      }
      return seeded;
    },
    seedProducts: async () => {
      if (skipProducts) return { written: 0, skipped: 0 };
      const products = await scrapeTcgCardsProducts("opecards", {
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
}

/** `--skip products,faces` from shared catalogue refresh argv. */
function skipToken(argv: readonly string[], token: string): boolean {
  const idx = argv.indexOf("--skip");
  if (idx < 0) return false;
  const csv = argv[idx + 1] ?? "";
  return csv
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .includes(token);
}
