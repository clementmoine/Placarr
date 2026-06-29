import {
  enrichGameBarcodeLookups,
  fetchTmdbForMovieTitle,
  pickMovieTitleFromListings,
  type NamedListing,
} from "@/lib/barcode/gameLookup";
import {
  filterBarcodeLookupTasksForRecord,
  isBarcodeRecordSlimMode,
} from "@/lib/barcode/lookup/recordMode";
import {
  asLeDenicheurHit,
  asMetadataHit,
  asNamedListings,
  asPriceChartingHit,
  asScanDexHit,
  collectRetailerBarcodeHits,
  createEmptyBarcodeLookupPayload,
  resolveSettledLookups,
  type BarcodeLookupPayload,
} from "@/lib/barcode/lookup/payload";
import type { PriceChartingMetadata } from "@/lib/barcode/lookup/providerTypes";
import type { BarcodeLookupTaskBuilder } from "@/services/provider/barcode";
import { createGameBarcodeEnrichmentDeps } from "@/services/provider/barcode";
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
    const lookups = await resolveSettledLookups(
      filterBarcodeLookupTasksForRecord(
        taskBuilders.games({
          barcode: cleanedBarcode,
          platformKey: contextPlatformKey,
        }),
      ),
    );
    payload.pc = asPriceChartingHit(lookups.pc);
    payload.calJeuxVideo = asNamedListings(lookups.cal);
    payload.sd = asScanDexHit(lookups.sd);
    payload.amc = asNamedListings(lookups.amc);
    payload.freakxy = asNamedListings(lookups.freakxy);
    payload.picclick = asNamedListings(lookups.picclick);
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
      ),
      enrichmentDeps: isBarcodeRecordSlimMode()
        ? {
            ...createGameBarcodeEnrichmentDeps(),
            fetchReferencePriceByBarcode: undefined,
          }
        : undefined,
    });
    payload.pc = enriched.pc as PriceChartingMetadata | null;
    payload.ss = asMetadataHit(enriched.ss);
    return payload;
  }

  if (type === "books") {
    const lookups = await resolveSettledLookups(
      filterBarcodeLookupTasksForRecord(
        taskBuilders.books({ barcode: cleanedBarcode }),
      ),
    );
    payload.ol = asMetadataHit(lookups.ol);
    payload.calFr = asNamedListings(lookups.cal);
    payload.amc = asNamedListings(lookups.amc);
    payload.leDenicheur = asLeDenicheurHit(lookups.leDenicheur);
    return payload;
  }

  if (type === "musics") {
    const lookups = await resolveSettledLookups(
      filterBarcodeLookupTasksForRecord(
        taskBuilders.musics({ barcode: cleanedBarcode }),
      ),
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
    const lookups = await resolveSettledLookups(
      filterBarcodeLookupTasksForRecord(
        taskBuilders.movies({ barcode: cleanedBarcode }),
      ),
    );
    payload.calDvd = asNamedListings(lookups.cal);
    payload.amc = asNamedListings(lookups.amc);
    payload.picclick = asNamedListings(lookups.picclick);
    payload.leDenicheur = asLeDenicheurHit(lookups.leDenicheur);
    payload.tmdb = asMetadataHit(
      isBarcodeRecordSlimMode()
        ? null
        : await fetchTmdbForMovieTitle(
            pickMovieTitleFromListings(
              payload.picclick,
              payload.amc,
              payload.calDvd,
            ),
            "Movie Lookup",
          ),
    );
    return payload;
  }

  if (type === "boardgames") {
    const lookups = await resolveSettledLookups(
      filterBarcodeLookupTasksForRecord(
        taskBuilders.boardgames({ barcode: cleanedBarcode }),
      ),
    );
    payload.sd = asScanDexHit(lookups.sd);
    payload.calToys = asNamedListings(lookups.cal);
    payload.amc = asNamedListings(lookups.amc);
    payload.picclick = asNamedListings(lookups.picclick);
    payload.leDenicheur = asLeDenicheurHit(lookups.leDenicheur);
    payload.philibert = asMetadataHit(lookups.philibert);
    payload.okkazeo = asMetadataHit(lookups.okkazeo);
    payload.retailers = collectRetailerBarcodeHits(lookups);
    return payload;
  }

  const lookups = await resolveSettledLookups(
    filterBarcodeLookupTasksForRecord(
      taskBuilders.generic({ barcode: cleanedBarcode }),
    ),
  );
  payload.ol = asMetadataHit(lookups.ol);
  payload.deezer = asMetadataHit(lookups.deezer);
  payload.pc = asPriceChartingHit(lookups.pc);
  payload.calGeneric = asNamedListings(lookups.cal);
  payload.sd = asScanDexHit(lookups.sd);
  payload.amc = asNamedListings(lookups.amc);
  payload.freakxy = asNamedListings(lookups.freakxy);
  payload.picclick = asNamedListings(lookups.picclick);
  payload.leDenicheur = asLeDenicheurHit(lookups.leDenicheur);
  // Board-game anchors (Okkazeo + Philibert + retailers), in parity with the
  // video-game stack above, so a board game scanned without a type has a trusted
  // source and is not misclassified as "games". Retailers are routed by their
  // declared types (a games shop feeds game sources, a board-game shop board-game
  // sources).
  payload.philibert = asMetadataHit(lookups.philibert);
  payload.okkazeo = asMetadataHit(lookups.okkazeo);
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
    ),
    enrichmentDeps: isBarcodeRecordSlimMode()
      ? {
          ...createGameBarcodeEnrichmentDeps(),
          fetchReferencePriceByBarcode: undefined,
        }
      : undefined,
  });
  payload.pc = enriched.pc as PriceChartingMetadata | null;
  payload.ss = asMetadataHit(enriched.ss);
  payload.tmdb = asMetadataHit(
    isBarcodeRecordSlimMode()
      ? null
      : await fetchTmdbForMovieTitle(
          pickMovieTitleFromListings(
            payload.picclick,
            payload.amc,
            payload.calGeneric,
          ),
          "Generic Lookup",
        ),
  );
  return payload;
}

function buildGameLookupInputs(
  payload: BarcodeLookupPayload,
  calListings: NamedListing[],
  contextPlatformKey: string | null,
) {
  return {
    pc: payload.pc,
    sd: payload.sd,
    calListings,
    amc: payload.amc,
    freakxy: payload.freakxy,
    picclick: payload.picclick,
    contextPlatformKey,
  };
}
