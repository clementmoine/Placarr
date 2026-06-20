import {
  pickBestLocalizedDescription,
  pickBestRegionalTitle,
} from "@/lib/localePreference";
import { orderFallbackNamesForLocale } from "@/lib/metadataTitleMatching";
import {
  dedupeFacts,
  dedupeFieldEvidence,
  metadataFieldEvidence,
} from "@/services/metadataFacts";
import {
  pickBestMetadataTitle,
  preferRequestedDisplayTitle,
} from "@/services/metadataMerge";
import { metadataProviderResolverMap } from "@/services/metadataResolvers";
import type { MetadataResult } from "@/types/metadataProvider";

function buildOmdbFallbackNames(
  name: string,
  tmdb: MetadataResult | null | undefined,
) {
  return orderFallbackNamesForLocale(
    name,
    [
      ...(tmdb?.regionalTitles?.map((entry) => entry.text) || []),
      tmdb?.title,
      ...(tmdb?.aliases || []),
      name,
    ].filter((value): value is string => Boolean(value?.trim())),
  );
}

export async function fetchFromAllMovieSources(
  name: string,
  barcode?: string | null,
  platform?: string | null,
): Promise<MetadataResult | null> {
  const tmdb = await metadataProviderResolverMap
    .get("tmdb")
    ?.resolve({ name, barcode, platform });

  const omdb = await metadataProviderResolverMap.get("omdb")?.resolve({
    name,
    barcode,
    platform,
    imdbId: tmdb?.externalIds?.imdb,
    fallbackNames: buildOmdbFallbackNames(name, tmdb),
  });

  if (!tmdb && !omdb) return null;

  const base = tmdb || omdb!;
  const movieSources = [tmdb, omdb].filter(Boolean) as MetadataResult[];
  const merged: MetadataResult = {
    ...base,
    title:
      pickBestRegionalTitle(movieSources) ||
      pickBestMetadataTitle([tmdb?.title, omdb?.title]) ||
      base.title,
    description:
      pickBestLocalizedDescription([
        { text: tmdb?.description, language: "fr", source: "tmdb" },
        { text: omdb?.description, source: "omdb" },
      ]) || base.description,
    facts: dedupeFacts([...(tmdb?.facts || []), ...(omdb?.facts || [])]),
    fieldEvidence: dedupeFieldEvidence([
      ...metadataFieldEvidence("TMDB", tmdb),
      ...metadataFieldEvidence("OMDb", omdb),
      ...metadataFieldEvidence("MergedEngine", base, {
        confidence: 0.76,
        priority: 190,
      }),
    ]),
  };

  return preferRequestedDisplayTitle(merged, name);
}
