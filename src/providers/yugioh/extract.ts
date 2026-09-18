/**
 * Yu-Gi-Oh! pack extract — Catalogue Sync / worker (in-process).
 *
 * Sources:
 * - YGOPRODeck API — EN (+ FR names) TCG printings (LOB-EN…) + images
 * - ScanFlip FR (`scanflip.fr/fr/yugioh/cards`) — regional FR codes (LDD-F…)
 *
 * Full catalogue is large — use `--max-cards` / `--max-pages` / `--skip-faces` /
 * `--limit` for smoke runs. Konami Neuron has no public API.
 */
import { runLocalTcgPipeline } from "@/providers/shared/cardCatalogue/localTcgLinePipeline";

import { YUGIOH_PACK_ID, yugiohCuratedDir } from "./pack";
import {
  applyYugiohScanflipArtUrls,
  harvestYugiohScanflip,
  installYugiohScanflip,
} from "./install/scanflip";
import {
  harvestYugiohYgoprodeck,
  installYugiohYgoprodeck,
} from "./ygoprodeck";

function argValue(argv: readonly string[], flag: string): string | null {
  const i = argv.indexOf(flag);
  if (i < 0) return null;
  return argv[i + 1] ?? null;
}

export async function runYugiohPackPipeline(
  argv: readonly string[] = [],
): Promise<{ cards: number; products: number }> {
  const skipFaces = argv.includes("--skip-faces");
  const skipScanflip = argv.includes("--skip-scanflip");
  const skipYgoprodeck = argv.includes("--skip-ygoprodeck");
  const maxPagesRaw = argValue(argv, "--max-pages");
  const maxCardsRaw = argValue(argv, "--max-cards");
  const limitRaw = argValue(argv, "--limit");
  const maxPages = maxPagesRaw ? Number(maxPagesRaw) : undefined;
  const maxCards = maxCardsRaw ? Number(maxCardsRaw) : undefined;
  const limit = limitRaw ? Number(limitRaw) : undefined;

  if (!skipYgoprodeck) {
    try {
      const harvested = await harvestYugiohYgoprodeck({
        maxCards: Number.isFinite(maxCards) ? maxCards : undefined,
      });
      console.log(
        `── YGOPRODeck — EN ${harvested.en}, FR ${harvested.fr}, prints ${harvested.prints} → ${harvested.path}`,
      );
    } catch (err) {
      console.warn(
        `── YGOPRODeck — échec : ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  if (!skipScanflip) {
    try {
      const harvested = await harvestYugiohScanflip({
        maxPages: Number.isFinite(maxPages) ? maxPages : undefined,
      });
      console.log(
        `── ScanFlip YGO FR — ${harvested.cards}/${harvested.totalCount} → ${harvested.path}`,
      );
    } catch (err) {
      console.warn(
        `── ScanFlip YGO FR — échec : ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  const result = await runLocalTcgPipeline({
    packId: YUGIOH_PACK_ID,
    curatedDir: yugiohCuratedDir(),
    label: "Yu-Gi-Oh!",
    seed: async (index) => {
      let prints = 0;
      let titles = 0;
      let faces = 0;

      if (!skipYgoprodeck) {
        const installed = await installYugiohYgoprodeck(index, {
          downloadFaces: !skipFaces,
          limit: Number.isFinite(limit) ? limit : undefined,
        });
        prints += installed.prints;
        titles += installed.titles;
        faces += installed.faces;
        console.log(
          `── YGO YGOPRODeck — ${installed.prints} prints, ${installed.titles} titres, ${installed.faces} faces`,
        );
      }

      if (!skipScanflip) {
        const installed = await installYugiohScanflip(index, {
          // Prefer CDN artUrl when faces are skipped; still seed titles.
          downloadFaces: !skipFaces,
          limit: Number.isFinite(limit) ? limit : undefined,
        });
        prints += installed.prints;
        titles += installed.titles;
        faces += installed.faces;
        console.log(
          `── YGO ScanFlip — ${installed.prints} prints, ${installed.titles} titres, ${installed.faces} faces`,
        );
      }

      console.log(
        `── YGO seed — ${prints} prints, ${titles} titres, ${faces} faces`,
      );
      return { prints, titles };
    },
  });

  const arts = applyYugiohScanflipArtUrls();
  console.log(`── ScanFlip artUrl — ${arts.patched} injecté${arts.patched === 1 ? "" : "s"}`);
  return result;
}
