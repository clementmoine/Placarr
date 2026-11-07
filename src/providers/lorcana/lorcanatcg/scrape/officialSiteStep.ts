/**
 * Official-site sealed discovery step — shared by Catalogue Extract
 * (`runOfficialSiteOnly`) and the Catalogue Sync pipeline.
 *
 * harvest (TTL-gated) → logos → upsert SKUs → [spoiler faces] → promote/purge.
 * No SKU↔set table: the join comes from set logos / slugs (`setLogos`).
 */
import {
  harvestOfficialLorcanaSite,
  promoteOfficialSiteAndPurgeStaging,
} from "./officialSite";
import {
  applyOfficialSiteLogos,
  upsertOfficialSiteProducts,
} from "./officialSiteApply";

export type OfficialSiteProductsStepResult = {
  pages: number;
  logos: number;
  packshots: number;
  spoilers: number;
  upserted: number;
  spoilerFaces: number;
  spoilerUnmatched: number;
  purged: boolean;
};

export async function runOfficialSiteProductsStep(
  opts: {
    force?: boolean;
    /** Apply spoiler faces (Extract). Sync discovery only needs SKUs. */
    spoilers?: boolean;
    packId?: string;
    log?: (message: string) => void;
  } = {},
): Promise<OfficialSiteProductsStepResult> {
  const log = opts.log ?? (() => {});
  const force = Boolean(opts.force);
  const harvested = await harvestOfficialLorcanaSite({
    force,
    packId: opts.packId,
    onProgress: (message) => log(`   official — ${message}`),
  });
  log(
    `── official site — ${harvested.pages} pages, ${harvested.logos} logos, ${harvested.packshots} packshots, ${harvested.spoilers} spoilers`,
  );
  const logos = applyOfficialSiteLogos({ packId: opts.packId });
  const upserted = upsertOfficialSiteProducts({
    packId: opts.packId,
    setLogoIndex: logos.index,
  });
  log(
    `── official upsert — logos +${logos.added}/${logos.updated}, produits ${upserted.written}`,
  );

  let spoilerFaces = 0;
  let spoilerUnmatched = 0;
  if (opts.spoilers) {
    const { applyOfficialSiteSpoilerFaces } = await import(
      "./officialSiteSpoilers"
    );
    const spoilers = await applyOfficialSiteSpoilerFaces({
      pages: harvested.pagesParsed,
      onProgress: (message) => log(`   spoiler — ${message}`),
    });
    spoilerFaces = spoilers.written;
    spoilerUnmatched = spoilers.unmatched;
    log(
      `── official spoilers — ${spoilers.written} faces, ${spoilers.matched} matchés, ${spoilers.unmatched} sans ancre`,
    );
    if (spoilers.unmatchedTitles.length) {
      log(
        `   (sans ancre) ${spoilers.unmatchedTitles.slice(0, 12).join(" · ")}`,
      );
    }
  }

  const purged = promoteOfficialSiteAndPurgeStaging({
    packId: opts.packId,
    pages: harvested.pagesParsed,
  });
  if (purged) log("── official site — staging purgé (ledger frais)");

  return {
    pages: harvested.pages,
    logos: harvested.logos,
    packshots: harvested.packshots,
    spoilers: harvested.spoilers,
    upserted: upserted.written,
    spoilerFaces,
    spoilerUnmatched,
    purged,
  };
}
