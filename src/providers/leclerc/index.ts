/**
 * E.Leclerc — une ligne catalogue par opération (Marvel / Disney / Star Wars),
 * printKeys partagés `leclerc:…`.
 */
import { createEmptyLocalTcgProvider } from "@/providers/shared/cardCatalogue/createEmptyLocalTcgProvider";
import type { ProviderModule } from "@/types/providerModule";

import {
  LECLERC_ACTIVE_OPS,
  LECLERC_PRINT_GAME,
  type LeclercOpSpec,
} from "./pack";
import {
  formatLeclercReference,
  leclercSetLabel,
  leclercSetSortKey,
} from "./printKey";

export {
  LECLERC_ACTIVE_OPS,
  LECLERC_DISNEY_EFFECT_PACK_ID,
  LECLERC_DISNEY_PACK_ID,
  LECLERC_DISNEY_PROVIDER_ID,
  LECLERC_MARVEL_EFFECT_PACK_ID,
  LECLERC_MARVEL_PACK_ID,
  LECLERC_MARVEL_PROVIDER_ID,
  LECLERC_OPS,
  LECLERC_PRINT_GAME,
  leclercFamilyMeta,
  leclercOpForExtractTarget,
  leclercOpForPackId,
  leclercOpForSetCode,
  type LeclercFamilyId,
  type LeclercOpSpec,
} from "./pack";

export { leclercCuratedDir } from "./curatedPaths";

function buildOpModule(op: LeclercOpSpec) {
  const label = leclercSetLabel(op.setCode);
  return createEmptyLocalTcgProvider({
    lineSpec: {
      providerId: op.providerId,
      providerLabel: `E.Leclerc — ${label}`,
      catalogueLabel: label,
      factLabel: label,
      packId: op.packId,
      effectPackId: op.effectPackId,
      printGame: LECLERC_PRINT_GAME,
      defaultLanguage: "fr",
      syncHint: `Catalogue Sync (admin) — ${label}`,
      websiteUrl: "https://www.e.leclerc/",
      notes: `Opération collector E.Leclerc « ${label} » → \`data/${op.packId}/\`. Checklist curated. Catalogue-only, pas de foil.`,
      setLabel: leclercSetLabel,
      setSortKey: leclercSetSortKey,
      formatReference: formatLeclercReference,
    },
    runPipeline: async (argv) => {
      const { runLeclercOpPipeline } = await import(
        /* webpackIgnore: true */
        "./extract"
      );
      return runLeclercOpPipeline(op, argv);
    },
  });
}

const builtBySet = Object.fromEntries(
  LECLERC_ACTIVE_OPS.map((op) => [op.setCode, buildOpModule(op)]),
) as Record<string, ReturnType<typeof buildOpModule>>;

export const leclercModules: ProviderModule[] = LECLERC_ACTIVE_OPS.map(
  (op) => builtBySet[op.setCode]!.module,
);

export const leclercMarvel21Module = builtBySet.marvel21!.module;
export const leclercMarvel22Module = builtBySet.marvel22!.module;
export const leclercMarvel23Module = builtBySet.marvel23!.module;
export const leclercMarvel24Module = builtBySet.marvel24!.module;
export const leclercDisney25Module = builtBySet.disney25!.module;

/** @deprecated Prefer {@link leclercMarvel21Module}. */
export const leclercMarvelModule = leclercMarvel21Module;
/** @deprecated Prefer {@link leclercDisney25Module}. */
export const leclercDisneyModule = leclercDisney25Module;
