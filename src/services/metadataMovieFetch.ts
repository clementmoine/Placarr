import {
  pickBestLocalizedDescription,
  pickBestRegionalTitle,
} from "@/lib/localePreference";
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

export async function fetchFromAllMovieSources(
  name: string,
  barcode?: string | null,
  platform?: string | null,
): Promise<MetadataResult | null> {
  const [tmdb, omdb] = await Promise.all([
    metadataProviderResolverMap
      .get("tmdb")
      ?.resolve({ name, barcode, platform }),
    metadataProviderResolverMap
      .get("omdb")
      ?.resolve({ name, barcode, platform }),
  ]);

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
