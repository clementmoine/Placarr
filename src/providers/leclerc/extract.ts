/**
 * Leclerc promo packs — Catalogue Sync / worker (in-process), one opération at a time.
 */
import { runLocalTcgPipeline } from "@/providers/shared/cardCatalogue/localTcgLinePipeline";

import { buildLeclercFromLedgers } from "./buildFromLedgers";
import {
  harvestColekaLeclercFacesForSet,
  installColekaLeclercFaces,
} from "./colekaLeclercFaces";
import {
  harvestEbayDisney25Faces,
  installEbayDisney25Faces,
  readEbayDisney25AllLedgers,
} from "./ebayDisney25Faces";
import { leclercCuratedDir } from "./curatedPaths";
import {
  leclercOpForExtractTarget,
  leclercOpForSetCode,
  type LeclercOpSpec,
} from "./pack";
import { colekaLeclercListingForSet } from "./parseColekaLeclerc";
import { leclercSetLabel } from "./printKey";

export async function runLeclercOpPipeline(
  op: LeclercOpSpec,
  _argv: readonly string[] = [],
): Promise<{ cards: number; products: number }> {
  const label = leclercSetLabel(op.setCode);
  return runLocalTcgPipeline({
    packId: op.packId,
    curatedDir: leclercCuratedDir(),
    label,
    curatedIncludeSetCodes: [op.setCode],
    seed: async (index) => {
      const built = buildLeclercFromLedgers({ setCode: op.setCode, index });
      if (built.skipped.length) {
        console.log(
          `── ${label} — ${built.skipped.length} écartée(s) : ${built.skipped.slice(0, 8).join(", ")}`,
        );
      }
      console.log(
        `── ${label} — ${built.prints} print(s), ${built.placeholders} placeholder(s)`,
      );

      const hasListing = Boolean(colekaLeclercListingForSet(op.setCode));
      const harvest = await harvestColekaLeclercFacesForSet(op.setCode, {
        packId: op.packId,
      });
      if (harvest && harvest.cards > 0) {
        console.log(
          `── ${label} — Coleka faces harvest cards=${harvest.cards} pages=${harvest.pages} ok=${harvest.ok} skip=${harvest.skip} fail=${harvest.fail}`,
        );
        const installed = installColekaLeclercFaces(index, op.setCode, {
          packId: op.packId,
        });
        console.log(
          `── ${label} — Coleka faces install ${installed.faces} (missing ${installed.missing.length})`,
        );
      } else if (!hasListing) {
        console.log(
          `── ${label} — pas de faces Coleka (listing / CDN) pour cette op`,
        );
      } else {
        console.log(`── ${label} — Coleka listing murée / vide (retry plus tard)`);
      }

      if (op.setCode === "disney25") {
        const ebayLedgers = readEbayDisney25AllLedgers();
        const ebayRows = ebayLedgers.reduce(
          (n, ledger) => n + ledger.variations.length,
          0,
        );
        if (ebayRows) {
          const ebayHarvest = await harvestEbayDisney25Faces({
            packId: op.packId,
          });
          if (ebayHarvest) {
            console.log(
              `── ${label} — eBay faces harvest cards=${ebayHarvest.cards} ok=${ebayHarvest.ok} skip=${ebayHarvest.skip} fail=${ebayHarvest.fail}`,
            );
          }
          const ebayInstalled = await installEbayDisney25Faces(index, {
            packId: op.packId,
          });
          console.log(
            `── ${label} — eBay faces install ${ebayInstalled.faces} (missing ${ebayInstalled.missing.length})`,
          );
        }
      }

      return { prints: built.prints, titles: built.titles };
    },
  });
}

export async function runLeclercSetPipeline(
  setCode: string,
  argv: readonly string[] = [],
): Promise<{ cards: number; products: number }> {
  const op = leclercOpForSetCode(setCode);
  if (!op) throw new Error(`Unknown Leclerc set: ${setCode}`);
  return runLeclercOpPipeline(op, argv);
}

export async function runLeclercExtractTargetPipeline(
  extractTarget: string,
  argv: readonly string[] = [],
): Promise<{ cards: number; products: number }> {
  const op = leclercOpForExtractTarget(extractTarget);
  if (!op) throw new Error(`Unknown Leclerc extract target: ${extractTarget}`);
  return runLeclercOpPipeline(op, argv);
}

/** @deprecated Prefer per-op runners. */
export async function runLeclercMarvelPackPipeline(
  argv: readonly string[] = [],
): Promise<{ cards: number; products: number }> {
  return runLeclercSetPipeline("marvel21", argv);
}

/** @deprecated Prefer per-op runners. */
export async function runLeclercDisneyPackPipeline(
  argv: readonly string[] = [],
): Promise<{ cards: number; products: number }> {
  return runLeclercSetPipeline("disney25", argv);
}

/** @deprecated Prefer per-op runners. */
export async function runLeclercPackPipeline(
  argv: readonly string[] = [],
): Promise<{ cards: number; products: number }> {
  return runLeclercSetPipeline("marvel21", argv);
}
