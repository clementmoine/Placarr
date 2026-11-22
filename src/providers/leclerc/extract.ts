/**
 * Leclerc promo packs — Catalogue Sync / worker (in-process), one opération at a time.
 */
import { selectCatalogueSteps } from "@/providers/shared/cardCatalogue/catalogueSteps";
import { runLocalTcgPipeline } from "@/providers/shared/cardCatalogue/localTcgLinePipeline";

import {
  buildLeclercFromLedgers,
  leclercNameDensifyGate,
} from "./buildFromLedgers";
import {
  harvestColekaLeclercFacesForSet,
  installColekaLeclercFaces,
} from "./colekaLeclercFaces";
import {
  harvestEbayDisney25Faces,
  installEbayDisney25Faces,
  readEbayDisney25AllLedgers,
} from "./ebayDisney25Faces";
import {
  harvestEbayDisney26Faces,
  installEbayDisney26Faces,
  readEbayDisney26AllLedgers,
} from "./ebayDisney26Faces";
import { leclercCuratedDir } from "./curatedPaths";
import {
  leclercOpForExtractTarget,
  leclercOpForSetCode,
  type LeclercOpSpec,
} from "./pack";
import {
  harvestCollexLeclercFaces,
  installCollexLeclercFaces,
} from "./collexFaces";
import { colekaLeclercListingForSet } from "./parseColekaLeclerc";
import { leclercSetLabel } from "./printKey";
import { ingestLeclercSealedProducts } from "./sealed";

/**
 * Ledger seed (offline) + faces Coleka/eBay/ColleX (online) + scellés
 * (offline) + documents de l'opération (online).
 */
export const LECLERC_STEPS = [
  "seed",
  "faces",
  "products",
  "documents",
] as const;
export type LeclercStep = (typeof LECLERC_STEPS)[number];
const LECLERC_ONLINE = new Set<LeclercStep>(["faces", "documents"]);

export function selectLeclercSteps(argv: readonly string[]): LeclercStep[] {
  return selectCatalogueSteps(argv, LECLERC_STEPS, { online: LECLERC_ONLINE });
}

export async function runLeclercOpPipeline(
  op: LeclercOpSpec,
  argv: readonly string[] = [],
): Promise<{ cards: number; products: number }> {
  const label = leclercSetLabel(op.setCode);
  const steps = selectLeclercSteps(argv);
  console.log(
    `── ${label} — étapes : ${steps.join(" → ") || "(curated only)"}`,
  );
  const result = await runLocalTcgPipeline({
    packId: op.packId,
    curatedDir: leclercCuratedDir(),
    label,
    curatedIncludeSetCodes: [op.setCode],
    seed: async (index) => {
      let prints = 0;
      let titles = 0;
      if (steps.includes("seed")) {
        const built = buildLeclercFromLedgers({ setCode: op.setCode, index });
        prints = built.prints;
        titles = built.titles;
        if (built.skipped.length) {
          console.log(
            `── ${label} — ${built.skipped.length} écartée(s) : ${built.skipped.slice(0, 8).join(", ")}`,
          );
        }
        console.log(
          `── ${label} — ${built.prints} print(s), ${built.placeholders} placeholder(s)`,
        );
      }

      if (!steps.includes("faces")) {
        return { prints, titles };
      }

      const hasListing = Boolean(colekaLeclercListingForSet(op.setCode));
      const harvest = await harvestColekaLeclercFacesForSet(op.setCode, {
        packId: op.packId,
      });
      if (harvest) {
        console.log(
          `── ${label} — Coleka faces harvest cards=${harvest.cards} pages=${harvest.pages} ok=${harvest.ok} skip=${harvest.skip} fail=${harvest.fail}`,
        );
      }
      // Always try install: staging dumps / CDN may exist when live listing is walled.
      const installed = installColekaLeclercFaces(index, op.setCode, {
        packId: op.packId,
      });
      if (installed.faces || installed.missing.length) {
        console.log(
          `── ${label} — Coleka faces install ${installed.faces} (missing ${installed.missing.length})`,
        );
      } else if (!hasListing) {
        const gate = leclercNameDensifyGate(op.setCode);
        console.log(
          `── ${label} — pas de faces Coleka (listing / CDN) pour cette op` +
            (gate.ready
              ? ""
              : ` — densify noms bloqué (${gate.reasons.join("; ")})`),
        );
      } else if (!harvest?.cards) {
        console.log(
          `── ${label} — Coleka listing murée / vide (dump ?nbpp=240 puis Sync)`,
        );
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

      if (op.setCode === "disney26") {
        const ebayHarvest = await harvestEbayDisney26Faces({
          packId: op.packId,
        });
        if (ebayHarvest) {
          console.log(
            `── ${label} — eBay faces harvest cards=${ebayHarvest.cards} ok=${ebayHarvest.ok} skip=${ebayHarvest.skip} fail=${ebayHarvest.fail}`,
          );
        }
        if (readEbayDisney26AllLedgers().length) {
          const ebayInstalled = await installEbayDisney26Faces(index, {
            packId: op.packId,
          });
          console.log(
            `── ${label} — eBay faces install ${ebayInstalled.faces} (missing ${ebayInstalled.missing.length})`,
          );
        } else {
          console.log(
            `── ${label} — eBay faces: ledger vide (Browse item group ${"237160946134"} / Fixeez ${"237152960926"} puis Sync)`,
          );
        }
      }

      // En dernier : le moteur compare ColleX à toutes les faces déjà posées
      // (Coleka, eBay…) et l'index pointe sur la gagnante.
      const collexHarvest = await harvestCollexLeclercFaces(op.setCode);
      if (collexHarvest) {
        const collexInstalled = await installCollexLeclercFaces(
          index,
          op.setCode,
        );
        console.log(
          `── ${label} — ColleX faces ${collexHarvest.items} objet(s) (dl ${collexHarvest.downloaded}, skip ${collexHarvest.skipped}, fail ${collexHarvest.failed}) → affichées ${collexInstalled.faces}, candidates gardées ${collexInstalled.kept}, sans correspondance ${collexInstalled.unmatched.length}`,
        );
      }

      return { prints, titles };
    },
    seedProducts: () => {
      if (!steps.includes("products")) return { written: 0, skipped: 0 };
      const sealed = ingestLeclercSealedProducts(op.setCode);
      if (sealed.written || sealed.skipped) {
        console.log(
          `── ${label} — scellés ${sealed.written} écrit(s), ${sealed.skipped} sauté(s)` +
            (sealed.file ? ` → ${sealed.file}` : ""),
        );
      }
      return { written: sealed.written, skipped: sealed.skipped };
    },
  });

  if (steps.includes("documents")) {
    const { loadLeclercCuratedDocuments } = await import("./curated/documents");
    const curated = loadLeclercCuratedDocuments(op.setCode);
    if (curated.length) {
      const { harvestPackDocuments } =
        await import("@/providers/shared/documents/harvestPackDocuments");
      const docs = await harvestPackDocuments({ packId: op.packId, curated });
      console.log(
        `── ${label} — documents : ${docs.fetched} téléchargé(s), ${docs.skipped} déjà là, ${docs.urlOnly} lien(s) seul(s), ${docs.failed} échec(s) / ${docs.total}`,
      );
    }
  }
  return result;
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
