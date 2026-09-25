/**
 * Yu-Gi-Oh! pack extract — Catalogue Sync / worker (in-process).
 *
 * Sources:
 * - YGOPRODeck API — EN (+ FR names) TCG printings (LOB-EN…) + images
 * - ScanFlip FR (`scanflip.fr/fr/yugioh/cards`) — regional FR codes (LDD-F…)
 * - ygocards.fr — pack sleeve (`cards/original/back.webp`), sealed SKUs,
 *   optional FR shop faces (`--ygocards-faces`)
 *
 * Faces stay locale-specific (no cross-locale borrow). Full catalogue is large —
 * use `--max-cards` / `--max-pages` / `--skip-faces` / `--skip-backs` / `--limit`
 * for smoke runs. Konami Neuron has no public API.
 */
import { runLocalTcgPipeline } from "@/providers/shared/cardCatalogue/localTcgLinePipeline";
import { ensureCardsFrListDump } from "@/providers/shared/tcgcards/ensureListDump";
import { fillYgocardsFaces } from "@/providers/shared/tcgcards/fillCardsFrFaces";
import {
  YGOCARDS_CARD_SITE,
  ygocardsIndexPath,
} from "@/providers/shared/tcgcards/scrapeList";

import { YUGIOH_PACK_ID, yugiohCuratedDir } from "./pack";
import {
  applyYugiohScanflipArtUrls,
  harvestYugiohScanflip,
  installYugiohScanflip,
  promoteAndPurgeYugiohScanflipStaging,
} from "./install/scanflip";
import { scrapeYgocardsProducts } from "./sources/ygocards";
import { harvestYgocardsDistinctBacks } from "./ygocardsBacks";
import {
  harvestYugiohYgoprodeck,
  installYugiohYgoprodeck,
} from "./ygoprodeck";

function argValue(argv: readonly string[], flag: string): string | null {
  const i = argv.indexOf(flag);
  if (i < 0) return null;
  return argv[i + 1] ?? null;
}

function skipToken(argv: readonly string[], token: string): boolean {
  const idx = argv.indexOf("--skip");
  if (idx < 0) return false;
  const csv = argv[idx + 1] ?? "";
  return csv
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .includes(token);
}

export async function runYugiohPackPipeline(
  argv: readonly string[] = [],
): Promise<{ cards: number; products: number }> {
  const force = argv.includes("--force");
  const offline = argv.includes("--offline");
  const skipFaces = argv.includes("--skip-faces");
  const skipScanflip = argv.includes("--skip-scanflip");
  const skipYgoprodeck = argv.includes("--skip-ygoprodeck");
  const skipProducts =
    argv.includes("--skip-products") || skipToken(argv, "products");
  const skipYgocardsFaces = !argv.includes("--ygocards-faces");
  const skipYgocardsList =
    argv.includes("--skip-ygocards-list") || skipToken(argv, "ygocards-list");
  const skipBacks =
    argv.includes("--skip-backs") || skipToken(argv, "backs");
  const maxPagesRaw = argValue(argv, "--max-pages");
  const maxCardsRaw = argValue(argv, "--max-cards");
  const limitRaw = argValue(argv, "--limit");
  const maxPages = maxPagesRaw ? Number(maxPagesRaw) : undefined;
  const maxCards = maxCardsRaw ? Number(maxCardsRaw) : undefined;
  const limit = limitRaw ? Number(limitRaw) : undefined;

  if (!offline && !skipBacks) {
    try {
      const backs = await harvestYgocardsDistinctBacks({ force });
      console.log(
        `── ygocards backs — observés ${backs.observedCount}, défaut=${backs.defaultSlug ?? "—"}, installés [${backs.installed.join(", ") || "—"}], skip défaut [${backs.skippedDefault.join(", ") || "—"}], CDN miss [${backs.missing.join(", ") || "—"}]`,
      );
    } catch (err) {
      console.warn(
        `── ygocards backs — échec : ${err instanceof Error ? err.message : err}`,
      );
    }
  }

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
        if (installed.prints > 0) {
          const purged = promoteAndPurgeYugiohScanflipStaging();
          if (purged.purged) {
            console.log("── ScanFlip staging — purgé (ledger → logs/)");
          }
        }
      }

      if (!skipYgocardsList && !offline) {
        const list = await ensureCardsFrListDump({
          packId: YUGIOH_PACK_ID,
          site: YGOCARDS_CARD_SITE,
          indexPath: ygocardsIndexPath("fr"),
          force,
          maxPages: Number.isFinite(maxPages) ? maxPages : undefined,
          label: "ygocards.fr",
        });
        console.log(
          `── ygocards.fr list — ${list.cards} tuiles, ${list.priced} cotes, ${list.pages} pages → ${list.file}`,
        );
      }

      if (!skipFaces && !skipYgocardsFaces && !offline) {
        const shop = await fillYgocardsFaces({
          index,
          force,
          refreshIndex: false,
          maxPages: Number.isFinite(maxPages) ? maxPages : undefined,
          limit: Number.isFinite(limit) ? limit : undefined,
        });
        faces += shop.written;
        console.log(
          `── ygocards.fr faces — ${shop.written} écrites, ${shop.skipped} déjà là, ${shop.unmapped} sans clé, ${shop.unknownPrint} hors catalogue, ${shop.failed} échecs (${shop.indexCards} tuiles)`,
        );
      }

      console.log(
        `── YGO seed — ${prints} prints, ${titles} titres, ${faces} faces`,
      );
      return { prints, titles };
    },
    seedProducts: async () => {
      if (skipProducts) return { written: 0, skipped: 0 };
      const products = await scrapeYgocardsProducts({
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

  const arts = applyYugiohScanflipArtUrls();
  console.log(`── ScanFlip artUrl — ${arts.patched} injecté${arts.patched === 1 ? "" : "s"}`);
  return result;
}
