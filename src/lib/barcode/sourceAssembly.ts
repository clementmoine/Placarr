import type { NamedListing } from "@/lib/barcode/gameLookup";
import type { BarcodeLookupPayload } from "@/lib/barcode/lookupPayload";
import {
  compileResultForType,
  type CompiledResult,
  type SourceProduct,
} from "@/lib/barcode/evidence";
import { detectPlatformKey } from "@/lib/barcode/query";
import type { LeDenicheurPrices } from "@/services/providers/ledenicheur/fetch";

type EvidenceSource = {
  providerName: string;
  products: SourceProduct[];
};

export function sourceProductsFromLeDenicheur(
  result: LeDenicheurPrices | null,
): SourceProduct[] {
  const name =
    typeof result?.productName === "string" && result.productName.trim()
      ? result.productName.trim()
      : null;
  if (!name) return [];
  return [
    {
      name,
      coverUrl: result?.coverUrl || null,
    },
  ];
}

function sourceProductsFromMetadataHit(
  hit: { title?: string; imageUrl?: string | null } | null,
): SourceProduct[] {
  if (!hit?.title?.trim()) return [];
  return [{ name: hit.title.trim(), coverUrl: hit.imageUrl || null }];
}

function pushSource(
  sources: EvidenceSource[],
  providerName: string,
  products: SourceProduct[] | NamedListing[],
) {
  if (products.length === 0) return;
  sources.push({ providerName, products });
}

function buildScreenScraperProducts(
  ss: NonNullable<BarcodeLookupPayload["ss"]>,
): SourceProduct[] {
  const ssProducts: SourceProduct[] = [
    {
      name: ss.title!,
      coverUrl: ss.imageUrl,
      platformKey: ss.platformKey,
    },
  ];

  for (const regionalTitle of ss.regionalTitles || []) {
    ssProducts.push({
      name: regionalTitle.text,
      coverUrl: ss.imageUrl,
      region: regionalTitle.region,
      platformKey: ss.platformKey,
      isAlias:
        regionalTitle.text.toLowerCase().trim() !==
        ss.title?.toLowerCase().trim(),
    });
  }

  for (const alias of ss.aliases || []) {
    const regional = ss.regionalTitles?.find(
      (title) => title.text.toLowerCase().trim() === alias.toLowerCase().trim(),
    );
    ssProducts.push({
      name: alias,
      coverUrl: ss.imageUrl,
      region: regional?.region,
      platformKey: ss.platformKey,
      isAlias: true,
    });
  }

  return ssProducts;
}

function pickProductsForScope(
  explicit: NamedListing[],
  generic: NamedListing[],
  type: string | null,
  shelfType: string,
  isBook: boolean,
): NamedListing[] {
  if (type === shelfType) return explicit;
  if (!type && !isBook) return generic;
  if (!type && shelfType === "books" && isBook) return generic;
  return [];
}

export async function compileAllBarcodeTypeResults(params: {
  cleanedBarcode: string;
  type: string | null;
  payload: BarcodeLookupPayload;
}): Promise<Record<string, CompiledResult | null>> {
  const { cleanedBarcode, type, payload } = params;
  const leDenicheurProducts = sourceProductsFromLeDenicheur(
    payload.leDenicheur,
  );
  const isBook =
    cleanedBarcode.startsWith("978") || cleanedBarcode.startsWith("979");

  const bookSources: EvidenceSource[] = [];
  if (payload.ol?.title) {
    pushSource(bookSources, "OpenLibrary", [
      { name: payload.ol.title, coverUrl: payload.ol.imageUrl },
    ]);
  }
  if (
    leDenicheurProducts.length > 0 &&
    (type === "books" || (!type && isBook))
  ) {
    pushSource(bookSources, "LeDenicheur", leDenicheurProducts);
  }
  pushSource(
    bookSources,
    "ChasseAuxLivres",
    pickProductsForScope(
      payload.calFr,
      payload.calGeneric,
      type,
      "books",
      isBook,
    ),
  );
  pushSource(
    bookSources,
    "AchatMoinsCher",
    type === "books" ? payload.amc : !type && isBook ? payload.amc : [],
  );

  const gameSources: EvidenceSource[] = [];
  if (payload.ss?.title) {
    pushSource(
      gameSources,
      "ScreenScraper",
      buildScreenScraperProducts(payload.ss),
    );
  }
  if (payload.pc?.title) {
    const pcTitle = payload.pc.platform
      ? `${payload.pc.title} (${payload.pc.platform})`
      : payload.pc.title;
    pushSource(gameSources, "PriceCharting", [
      {
        name: pcTitle,
        coverUrl: payload.pc.coverUrl,
        platformKey: payload.pc.platform
          ? detectPlatformKey(payload.pc.platform)
          : null,
      },
    ]);
  }
  if (payload.sd?.igdb_metadata?.name) {
    const sdName = payload.sd.igdb_metadata.name;
    const sdPlatform = payload.sd.igdb_metadata.platform?.name;
    const sdTitle = sdPlatform ? `${sdName} (${sdPlatform})` : sdName;
    pushSource(gameSources, "ScanDex", [
      {
        name: sdTitle,
        platformKey: sdPlatform ? detectPlatformKey(sdPlatform) : null,
      },
    ]);
  }
  if (
    leDenicheurProducts.length > 0 &&
    (type === "games" || (!type && !isBook))
  ) {
    pushSource(gameSources, "LeDenicheur", leDenicheurProducts);
  }
  pushSource(
    gameSources,
    "ChasseAuxLivres",
    pickProductsForScope(
      payload.calJeuxVideo,
      payload.calGeneric,
      type,
      "games",
      isBook,
    ),
  );
  pushSource(
    gameSources,
    "AchatMoinsCher",
    type === "games" ? payload.amc : !isBook ? payload.amc : [],
  );
  pushSource(
    gameSources,
    "Freakxy",
    type === "games" ? payload.freakxy : !isBook ? payload.freakxy : [],
  );
  pushSource(
    gameSources,
    "Apriloshop",
    type === "games" ? payload.aprilo : !isBook ? payload.aprilo : [],
  );
  pushSource(
    gameSources,
    "PicClick",
    type === "games" ? payload.picclick : !isBook ? payload.picclick : [],
  );

  const musicSources: EvidenceSource[] = [];
  if (payload.mb?.title) {
    pushSource(musicSources, "MusicBrainz", [
      { name: payload.mb.title, coverUrl: payload.mb.imageUrl },
    ]);
  }
  if (payload.discogs?.title) {
    pushSource(musicSources, "Discogs", [
      { name: payload.discogs.title, coverUrl: payload.discogs.imageUrl },
    ]);
  }
  if (payload.deezer?.title) {
    pushSource(musicSources, "Deezer", [
      { name: payload.deezer.title, coverUrl: payload.deezer.imageUrl },
    ]);
  }
  if (
    leDenicheurProducts.length > 0 &&
    (type === "musics" || (!type && !isBook))
  ) {
    pushSource(musicSources, "LeDenicheur", leDenicheurProducts);
  }
  pushSource(
    musicSources,
    "ChasseAuxLivres",
    pickProductsForScope(
      payload.calMusic,
      payload.calGeneric,
      type,
      "musics",
      isBook,
    ),
  );
  pushSource(
    musicSources,
    "AchatMoinsCher",
    type === "musics" ? payload.amc : !isBook ? payload.amc : [],
  );
  pushSource(
    musicSources,
    "PicClick",
    type === "musics" ? payload.picclick : !isBook ? payload.picclick : [],
  );

  const movieSources: EvidenceSource[] = [];
  if (payload.tmdb?.title) {
    pushSource(movieSources, "TMDB", [
      { name: payload.tmdb.title, coverUrl: payload.tmdb.imageUrl },
      ...(payload.tmdb.aliases || []).map((alias) => ({
        name: alias,
        coverUrl: payload.tmdb?.imageUrl,
        isAlias: true,
      })),
    ]);
  }
  if (
    leDenicheurProducts.length > 0 &&
    (type === "movies" || (!type && !isBook))
  ) {
    pushSource(movieSources, "LeDenicheur", leDenicheurProducts);
  }
  pushSource(
    movieSources,
    "ChasseAuxLivres",
    pickProductsForScope(
      payload.calDvd,
      payload.calGeneric,
      type,
      "movies",
      isBook,
    ),
  );
  pushSource(
    movieSources,
    "AchatMoinsCher",
    type === "movies" ? payload.amc : !isBook ? payload.amc : [],
  );
  pushSource(
    movieSources,
    "PicClick",
    type === "movies" ? payload.picclick : !isBook ? payload.picclick : [],
  );

  const boardgameSources: EvidenceSource[] = [];
  if (payload.sd?.igdb_metadata?.name) {
    const sdName = payload.sd.igdb_metadata.name;
    const sdPlatform = payload.sd.igdb_metadata.platform?.name;
    const sdTitle = sdPlatform ? `${sdName} (${sdPlatform})` : sdName;
    pushSource(boardgameSources, "ScanDex", [
      {
        name: sdTitle,
        platformKey: sdPlatform ? detectPlatformKey(sdPlatform) : null,
      },
    ]);
  }
  if (
    leDenicheurProducts.length > 0 &&
    (type === "boardgames" || (!type && !isBook))
  ) {
    pushSource(boardgameSources, "LeDenicheur", leDenicheurProducts);
  }
  pushSource(
    boardgameSources,
    "Philibert",
    sourceProductsFromMetadataHit(payload.philibert),
  );
  pushSource(
    boardgameSources,
    "Okkazeo",
    sourceProductsFromMetadataHit(payload.okkazeo),
  );
  for (const retailer of payload.boardRetailers) {
    pushSource(
      boardgameSources,
      retailer.providerName,
      sourceProductsFromMetadataHit(retailer),
    );
  }
  pushSource(
    boardgameSources,
    "ChasseAuxLivres",
    pickProductsForScope(
      payload.calToys,
      payload.calGeneric,
      type,
      "boardgames",
      isBook,
    ),
  );
  pushSource(
    boardgameSources,
    "AchatMoinsCher",
    type === "boardgames" ? payload.amc : !isBook ? payload.amc : [],
  );
  pushSource(
    boardgameSources,
    "PicClick",
    type === "boardgames" ? payload.picclick : !isBook ? payload.picclick : [],
  );

  const [books, games, musics, movies, boardgames] = await Promise.all([
    compileResultForType("books", bookSources, cleanedBarcode),
    compileResultForType("games", gameSources, cleanedBarcode),
    compileResultForType("musics", musicSources, cleanedBarcode),
    compileResultForType("movies", movieSources, cleanedBarcode),
    compileResultForType("boardgames", boardgameSources, cleanedBarcode),
  ]);

  return { books, games, musics, movies, boardgames };
}
