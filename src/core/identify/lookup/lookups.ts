import {
  enrichGameBarcodeLookups,
  fetchTmdbForMovieTitle,
  pickMovieTitleFromListings,
  type NamedListing,
} from "@/core/identify/gameLookup";
import {
  buildBarcodeRecordEnrichmentDeps,
  isBarcodeRecordSlimMode,
  resolveBarcodeLookupTasks,
} from "@/core/identify/lookup/recordMode";
import {
  asLeDenicheurHit,
  asMetadataHit,
  asNamedListings,
  asPriceChartingHit,
  asScanDexHit,
  asICollectHit,
  catalogIceBarcodeHit,
  collectRetailerBarcodeHits,
  createEmptyBarcodeLookupPayload,
  type BarcodeLookupPayload,
} from "@/core/identify/lookup/payload";
import type { PriceChartingMetadata } from "@/core/identify/lookup/providerTypes";
import type { BarcodeLookupTaskBuilder } from "@/core/catalog/barcode";
import type { BarcodeLookupType } from "@/types/providerModule";

type BarcodeLookupTaskBuilders = Record<
  BarcodeLookupType,
  BarcodeLookupTaskBuilder
>;

export async function runBarcodeLookups(params: {
  cleanedBarcode: string;
  type: string | null;
  contextPlatformKey: string | null;
  taskBuilders: BarcodeLookupTaskBuilders;
}): Promise<BarcodeLookupPayload> {
  const { cleanedBarcode, type, contextPlatformKey, taskBuilders } = params;
  const payload = createEmptyBarcodeLookupPayload();

  if (type === "games") {
    const lookups = await resolveBarcodeLookupTasks(
      taskBuilders.games({
        barcode: cleanedBarcode,
        platformKey: contextPlatformKey,
      }),
    );
    if (process.env.RECORD) {
      console.log("[record step] lookups:tasks-settled");
    }
    payload.pc = asPriceChartingHit(lookups.pc);
    const iceCatalog = catalogIceBarcodeHit(
      asICollectHit(lookups.ice),
      contextPlatformKey,
    );
    payload.ice = iceCatalog.ice;
    payload.calJeuxVideo = asNamedListings(lookups.cal);
    payload.sd = asScanDexHit(lookups.sd);
    payload.amc = asNamedListings(lookups.amc);
    payload.freakxy = asNamedListings(lookups.freakxy);
    payload.ebay = asNamedListings(lookups.ebay);
    payload.leDenicheur = asLeDenicheurHit(lookups.leDenicheur);
    payload.retailers = collectRetailerBarcodeHits(lookups);

    const enriched = await enrichGameBarcodeLookups({
      cleanedBarcode,
      contextPlatformKey,
      pc: payload.pc,
      searchLabel: "games",
      inputs: buildGameLookupInputs(
        payload,
        payload.calJeuxVideo,
        contextPlatformKey,
        iceCatalog.catalogTitleHint,
      ),
      enrichmentDeps: buildBarcodeRecordEnrichmentDeps(),
    });
    payload.pc = enriched.pc as PriceChartingMetadata | null;
    if (!isBarcodeRecordSlimMode()) {
      payload.ss = asMetadataHit(enriched.ss);
    }
    return payload;
  }

  if (type === "books") {
    const lookups = await resolveBarcodeLookupTasks(
      taskBuilders.books({ barcode: cleanedBarcode }),
    );
    payload.ol = asMetadataHit(lookups.ol);
    payload.calFr = asNamedListings(lookups.cal);
    payload.amc = asNamedListings(lookups.amc);
    payload.ebay = asNamedListings(lookups.ebay);
    payload.leDenicheur = asLeDenicheurHit(lookups.leDenicheur);
    return payload;
  }

  if (type === "musics") {
    const lookups = await resolveBarcodeLookupTasks(
      taskBuilders.musics({ barcode: cleanedBarcode }),
    );
    payload.mb = asMetadataHit(lookups.mb);
    payload.discogs = asMetadataHit(lookups.discogs);
    payload.deezer = asMetadataHit(lookups.deezer);
    payload.calMusic = asNamedListings(lookups.cal);
    payload.amc = asNamedListings(lookups.amc);
    payload.leDenicheur = asLeDenicheurHit(lookups.leDenicheur);
    return payload;
  }

  if (type === "movies") {
    const lookups = await resolveBarcodeLookupTasks(
      taskBuilders.movies({ barcode: cleanedBarcode }),
    );
    payload.calDvd = asNamedListings(lookups.cal);
    payload.amc = asNamedListings(lookups.amc);
    payload.ebay = asNamedListings(lookups.ebay);
    payload.leDenicheur = asLeDenicheurHit(lookups.leDenicheur);
    payload.tmdb = asMetadataHit(
      isBarcodeRecordSlimMode()
        ? null
        : await fetchTmdbForMovieTitle(
            pickMovieTitleFromListings(
              payload.ebay,
              payload.amc,
              payload.calDvd,
            ),
            "Movie Lookup",
          ),
    );
    return payload;
  }

  if (type === "boardgames") {
    const lookups = await resolveBarcodeLookupTasks(
      taskBuilders.boardgames({ barcode: cleanedBarcode }),
    );
    payload.sd = asScanDexHit(lookups.sd);
    payload.calToys = asNamedListings(lookups.cal);
    payload.amc = asNamedListings(lookups.amc);
    payload.ebay = asNamedListings(lookups.ebay);
    payload.leDenicheur = asLeDenicheurHit(lookups.leDenicheur);
    payload.philibert = asMetadataHit(lookups.philibert);
    payload.okkazeo = asMetadataHit(lookups.okkazeo);
    payload.espritjeu = asMetadataHit(lookups.espritjeu);
    payload.playin = asMetadataHit(lookups.playin);
    payload.myludo = asMetadataHit(lookups.myludo);
    payload.retailers = collectRetailerBarcodeHits(lookups);
    return payload;
  }

  if (type === "hardware") {
    const lookups = await resolveBarcodeLookupTasks(
      taskBuilders.hardware({ barcode: cleanedBarcode }),
    );
    payload.pc = asPriceChartingHit(lookups.pc);
    // Collector catalog can name console SKUs ("… Console …"); keep the hit so
    // catalogTitleAnchor can confirm hardware when PriceCharting misses the UPC.
    const iceCatalog = catalogIceBarcodeHit(
      asICollectHit(lookups.ice),
      contextPlatformKey,
    );
    payload.ice = iceCatalog.ice;
    payload.calJeuxVideo = asNamedListings(lookups.cal);
    payload.amc = asNamedListings(lookups.amc);
    payload.freakxy = asNamedListings(lookups.freakxy);
    payload.ebay = asNamedListings(lookups.ebay);
    payload.leDenicheur = asLeDenicheurHit(lookups.leDenicheur);
    payload.retailers = collectRetailerBarcodeHits(lookups);
    return payload;
  }

  // tcg / toys: no specialist barcode path yet — honest empty (UI blocked).
  if (type === "tcg" || type === "toys") {
    return payload;
  }

  const lookups = await resolveBarcodeLookupTasks(
    taskBuilders.generic({ barcode: cleanedBarcode }),
  );
  payload.ol = asMetadataHit(lookups.ol);
  payload.deezer = asMetadataHit(lookups.deezer);
  payload.pc = asPriceChartingHit(lookups.pc);
  const iceCatalog = catalogIceBarcodeHit(
    asICollectHit(lookups.ice),
    contextPlatformKey,
  );
  payload.ice = iceCatalog.ice;
  payload.calGeneric = asNamedListings(lookups.cal);
  payload.sd = asScanDexHit(lookups.sd);
  payload.amc = asNamedListings(lookups.amc);
  payload.freakxy = asNamedListings(lookups.freakxy);
  payload.ebay = asNamedListings(lookups.ebay);
  payload.leDenicheur = asLeDenicheurHit(lookups.leDenicheur);
  // Board-game anchors (Okkazeo + Philibert + retailers), in parity with the
  // video-game stack above, so a board game scanned without a type has a trusted
  // source and is not misclassified as "games". Retailers are routed by their
  // declared types (a games shop feeds game sources, a board-game shop board-game
  // sources).
  payload.philibert = asMetadataHit(lookups.philibert);
  payload.okkazeo = asMetadataHit(lookups.okkazeo);
  payload.espritjeu = asMetadataHit(lookups.espritjeu);
  payload.playin = asMetadataHit(lookups.playin);
  payload.myludo = asMetadataHit(lookups.myludo);
  payload.retailers = collectRetailerBarcodeHits(lookups);

  const enriched = await enrichGameBarcodeLookups({
    cleanedBarcode,
    contextPlatformKey,
    pc: payload.pc,
    searchLabel: "generic",
    inputs: buildGameLookupInputs(
      payload,
      payload.calGeneric,
      contextPlatformKey,
      iceCatalog.catalogTitleHint,
    ),
    enrichmentDeps: buildBarcodeRecordEnrichmentDeps(),
  });
  payload.pc = enriched.pc as PriceChartingMetadata | null;
  if (isBarcodeRecordSlimMode()) {
    payload.ss = null;
    payload.tmdb = null;
  } else {
    payload.ss = asMetadataHit(enriched.ss);
    payload.tmdb = asMetadataHit(
      await fetchTmdbForMovieTitle(
        pickMovieTitleFromListings(
          payload.ebay,
          payload.amc,
          payload.calGeneric,
        ),
        "Generic Lookup",
      ),
    );
  }
  return payload;
}

function buildGameLookupInputs(
  payload: BarcodeLookupPayload,
  calListings: NamedListing[],
  contextPlatformKey: string | null,
  catalogTitleHint: string | null = null,
) {
  return {
    pc: payload.pc,
    sd: payload.sd,
    ice: payload.ice,
    catalogTitleHint,
    calListings,
    amc: payload.amc,
    freakxy: payload.freakxy,
    ebay: payload.ebay,
    contextPlatformKey,
  };
}
