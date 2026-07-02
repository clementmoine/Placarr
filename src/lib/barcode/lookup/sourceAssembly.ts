import type { NamedListing } from "@/lib/barcode/gameLookup";
import type { BarcodeLookupPayload } from "@/lib/barcode/lookup/payload";
import { barcodeSourceFactsFromFields } from "@/lib/barcode/evidence/sourceFacts";
import {
  compileResultForType,
  type CompiledResult,
  type SourceProduct,
} from "@/lib/barcode/evidence";
import { PROVIDER_MODULES } from "@/services/provider/registry";

type EvidenceSource = {
  providerName: string;
  products: SourceProduct[];
};

function sourceProductsFromMetadataHit(
  hit: {
    title?: string;
    imageUrl?: string | null;
    platformKey?: string | null;
    players?: string | null;
    playtime?: string | null;
    ageRating?: string | null;
    mediaFormat?: string | null;
  } | null,
): SourceProduct[] {
  if (!hit?.title?.trim()) return [];
  return [
    {
      name: hit.title.trim(),
      coverUrl: hit.imageUrl || null,
      platformKey: hit.platformKey ?? null,
      facts: barcodeSourceFactsFromFields(hit),
    },
  ];
}

function pushSource(
  sources: EvidenceSource[],
  providerName: string,
  products: SourceProduct[] | NamedListing[],
) {
  if (products.length === 0) return;
  sources.push({ providerName, products });
}

export async function compileAllBarcodeTypeResults(params: {
  cleanedBarcode: string;
  type: string | null;
  payload: BarcodeLookupPayload;
}): Promise<Record<string, CompiledResult | null>> {
  const { cleanedBarcode, type, payload } = params;
  const isBook =
    cleanedBarcode.startsWith("978") || cleanedBarcode.startsWith("979");

  // Every typed evidence source is now declared by a provider module's
  // buildBarcodeSources (collected below). The only thing assembled here is the
  // generic retailers loop (PrestaShop/Shopify): already provider-blind, since
  // each retailer declares its own `types` and `providerName`.
  const bookSources: EvidenceSource[] = [];
  const gameSources: EvidenceSource[] = [];
  const musicSources: EvidenceSource[] = [];
  const movieSources: EvidenceSource[] = [];
  const boardgameSources: EvidenceSource[] = [];

  for (const retailer of payload.retailers) {
    const products = sourceProductsFromMetadataHit(retailer);
    if (retailer.types.includes("games")) {
      pushSource(gameSources, retailer.providerName, products);
    }
    if (retailer.types.includes("boardgames")) {
      pushSource(boardgameSources, retailer.providerName, products);
    }
  }

  // Plug-and-play contributions: each provider module maps its own payload slice
  // to evidence sources (see ProviderModule.buildBarcodeSources).
  const sourcesByType: Record<string, EvidenceSource[]> = {
    books: bookSources,
    games: gameSources,
    musics: musicSources,
    movies: movieSources,
    boardgames: boardgameSources,
  };
  const sourceContext = { type, isBook, cleanedBarcode };
  for (const module of PROVIDER_MODULES) {
    if (!module.buildBarcodeSources) continue;
    for (const contribution of module.buildBarcodeSources(
      payload,
      sourceContext,
    )) {
      const bucket = sourcesByType[contribution.mediaType];
      if (bucket) pushSource(bucket, contribution.label, contribution.products);
    }
  }

  const [books, games, musics, movies, boardgames] = await Promise.all([
    compileResultForType("books", bookSources, cleanedBarcode),
    compileResultForType("games", gameSources, cleanedBarcode),
    compileResultForType("musics", musicSources, cleanedBarcode),
    compileResultForType("movies", movieSources, cleanedBarcode),
    compileResultForType("boardgames", boardgameSources, cleanedBarcode),
  ]);

  return { books, games, musics, movies, boardgames };
}
