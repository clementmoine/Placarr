export type BarcodeLookupType =
  | "games"
  | "books"
  | "musics"
  | "movies"
  | "boardgames"
  | "generic";

type BarcodeLookupContext = {
  barcode: string;
  platformKey?: string | null;
};

type BarcodeLookupTaskBuilder = (
  context: BarcodeLookupContext,
) => Record<string, Promise<unknown>>;

type BarcodeLookupDeps = {
  fetchMetadataFromPriceCharting: (
    barcode: string,
    searchName?: string,
    preferredPlatform?: string,
    isPal?: boolean,
    isClassics?: boolean,
  ) => Promise<unknown>;
  fetchFromChasseAuxLivres: (barcode: string, category: string) => Promise<unknown>;
  fetchFromScanDex: (barcode: string) => Promise<unknown>;
  fetchFromAchatMoinsCher: (barcode: string) => Promise<unknown>;
  fetchFromFreakxy: (barcode: string) => Promise<unknown>;
  fetchFromApriloshop: (barcode: string) => Promise<unknown>;
  fetchFromPicClick: (barcode: string) => Promise<unknown>;
  fetchPricesFromLeDenicheur: (barcode: string) => Promise<unknown>;
  fetchFromOpenLibrary: (
    name: string,
    barcode?: string | null,
  ) => Promise<unknown>;
  fetchFromDeezer: (name: string, barcode?: string | null) => Promise<unknown>;
  fetchFromMusicBrainz: (barcode: string) => Promise<unknown>;
  fetchFromDiscogs: (barcode: string) => Promise<unknown>;
};

export function createBarcodeLookupTaskBuilders(
  deps: BarcodeLookupDeps,
): Record<BarcodeLookupType, BarcodeLookupTaskBuilder> {
  return {
    games: ({ barcode, platformKey }) => ({
      pc: deps.fetchMetadataFromPriceCharting(
        barcode,
        undefined,
        platformKey || undefined,
        barcode.length === 13 && !barcode.startsWith("0"),
      ),
      cal: deps.fetchFromChasseAuxLivres(barcode, "jeuxvideo"),
      sd: deps.fetchFromScanDex(barcode),
      amc: deps.fetchFromAchatMoinsCher(barcode),
      freakxy: deps.fetchFromFreakxy(barcode),
      aprilo: deps.fetchFromApriloshop(barcode),
      picclick: deps.fetchFromPicClick(barcode),
      leDenicheur: deps.fetchPricesFromLeDenicheur(barcode),
    }),
    books: ({ barcode }) => ({
      ol: deps.fetchFromOpenLibrary("", barcode),
      cal: deps.fetchFromChasseAuxLivres(barcode, "fr"),
      amc: deps.fetchFromAchatMoinsCher(barcode),
      leDenicheur: deps.fetchPricesFromLeDenicheur(barcode),
    }),
    musics: ({ barcode }) => ({
      mb: deps.fetchFromMusicBrainz(barcode),
      discogs: deps.fetchFromDiscogs(barcode),
      deezer: deps.fetchFromDeezer("", barcode),
      cal: deps.fetchFromChasseAuxLivres(barcode, "music"),
      amc: deps.fetchFromAchatMoinsCher(barcode),
      picclick: deps.fetchFromPicClick(barcode),
      leDenicheur: deps.fetchPricesFromLeDenicheur(barcode),
    }),
    movies: ({ barcode }) => ({
      cal: deps.fetchFromChasseAuxLivres(barcode, "dvd"),
      amc: deps.fetchFromAchatMoinsCher(barcode),
      picclick: deps.fetchFromPicClick(barcode),
      leDenicheur: deps.fetchPricesFromLeDenicheur(barcode),
    }),
    boardgames: ({ barcode }) => ({
      cal: deps.fetchFromChasseAuxLivres(barcode, "toys"),
      amc: deps.fetchFromAchatMoinsCher(barcode),
      picclick: deps.fetchFromPicClick(barcode),
      leDenicheur: deps.fetchPricesFromLeDenicheur(barcode),
    }),
    generic: ({ barcode }) => ({
      ol: deps.fetchFromOpenLibrary("", barcode),
      deezer: deps.fetchFromDeezer("", barcode),
      pc: deps.fetchMetadataFromPriceCharting(
        barcode,
        undefined,
        undefined,
        barcode.length === 13 && !barcode.startsWith("0"),
      ),
      cal: deps.fetchFromChasseAuxLivres(barcode, ""),
      sd: deps.fetchFromScanDex(barcode),
      amc: deps.fetchFromAchatMoinsCher(barcode),
      freakxy: deps.fetchFromFreakxy(barcode),
      aprilo: deps.fetchFromApriloshop(barcode),
      picclick: deps.fetchFromPicClick(barcode),
      leDenicheur: deps.fetchPricesFromLeDenicheur(barcode),
    }),
  };
}
