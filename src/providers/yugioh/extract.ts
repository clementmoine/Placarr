/**
 * Yu-Gi-Oh! pack extract — Catalogue Sync / worker (in-process).
 *
 * Sources:
 * - YGOPRODeck API — EN (+ FR names) TCG printings (LOB-EN…) + images
 * - ScanFlip FR (`scanflip.fr/fr/yugioh/cards`) — regional FR codes (LDD-F…)
 * - ygocards.fr — pack sleeve (`cards/original/back.webp`), sealed SKUs,
 *   optional FR shop faces (`--ygocards-faces`)
 *
 * STEPS (`--only` / `--skip` / `--offline`) : `seed` · `faces` · `products`.
 * `--skip-faces` remains an alias for `--skip faces`. Shop faces stay opt-in
 * via `--ygocards-faces`. Konami Neuron has no public API.
 */
import {
  catalogueArgList,
  selectCatalogueSteps,
} from "@/providers/shared/cardCatalogue/catalogueSteps";
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

export const YUGIOH_STEPS = ["seed", "faces", "products"] as const;
export type YugiohStep = (typeof YUGIOH_STEPS)[number];
/** Seed harvest + face CDN need the network; products accept `--offline`. */
const YUGIOH_ONLINE = new Set<YugiohStep>(["seed", "faces"]);

export function selectYugiohSteps(argv: readonly string[]): YugiohStep[] {
  const effective = withSkipFacesAlias(argv);
  return selectCatalogueSteps(effective, YUGIOH_STEPS, {
    online: YUGIOH_ONLINE,
  });
}

/** `--skip-faces` → `--skip faces` (legacy smoke flag). */
function withSkipFacesAlias(argv: readonly string[]): readonly string[] {
  if (!argv.includes("--skip-faces")) return argv;
  const skip = catalogueArgList(argv, "--skip");
  if (skip.includes("faces")) return argv;
  const withoutSkipPair: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--skip-faces") continue;
    if (argv[i] === "--skip") {
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        withoutSkipPair.push("--skip", `${next},faces`);
        i += 1;
        continue;
      }
    }
    withoutSkipPair.push(argv[i]!);
  }
  if (!withoutSkipPair.includes("--skip")) {
    withoutSkipPair.push("--skip", "faces");
  }
  return withoutSkipPair;
}

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
  const steps = selectYugiohSteps(argv);
  console.log(
    `── Yu-Gi-Oh! — étapes : ${steps.join(" → ") || "(curated only)"}`,
  );

  const skipScanflip = argv.includes("--skip-scanflip");
  const skipYgoprodeck = argv.includes("--skip-ygoprodeck");
  const wantShopFaces = argv.includes("--ygocards-faces");
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
  const downloadFaces = steps.includes("faces");

  if (steps.includes("seed") && !offline && !skipBacks) {
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

  if (steps.includes("seed") && !skipYgoprodeck) {
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

  if (steps.includes("seed") && !skipScanflip) {
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

      if (steps.includes("seed") || downloadFaces) {
        if (!skipYgoprodeck && (steps.includes("seed") || downloadFaces)) {
          const installed = await installYugiohYgoprodeck(index, {
            downloadFaces,
            limit: Number.isFinite(limit) ? limit : undefined,
          });
          if (steps.includes("seed")) {
            prints += installed.prints;
            titles += installed.titles;
          }
          faces += installed.faces;
          console.log(
            `── YGO YGOPRODeck — ${installed.prints} prints, ${installed.titles} titres, ${installed.faces} faces`,
          );
        }

        if (!skipScanflip && (steps.includes("seed") || downloadFaces)) {
          const installed = await installYugiohScanflip(index, {
            downloadFaces,
            limit: Number.isFinite(limit) ? limit : undefined,
          });
          if (steps.includes("seed")) {
            prints += installed.prints;
            titles += installed.titles;
          }
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
      }

      if (steps.includes("seed") && !skipYgocardsList && !offline) {
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

      if (downloadFaces && wantShopFaces && !offline) {
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
    seedProducts: steps.includes("products")
      ? async () => {
          const products = await scrapeYgocardsProducts({
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

  if (steps.includes("seed")) {
    const arts = applyYugiohScanflipArtUrls();
    console.log(
      `── ScanFlip artUrl — ${arts.patched} injecté${arts.patched === 1 ? "" : "s"}`,
    );
  }
  return result;
}
