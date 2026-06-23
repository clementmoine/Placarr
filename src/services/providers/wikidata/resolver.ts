import axios from "axios";
import levenshtein from "fast-levenshtein";
import {
  METADATA_OBSERVATION_SCHEMA_VERSION,
  observationsFromMetadataResult,
} from "@/lib/metadataObservations";

import type { MetadataFact, MetadataResult } from "@/types/metadataProvider";

const USER_AGENT = "Placarr/1.0 (+https://github.com/clementmoine/Placarr)";
const WIKIDATA_API = "https://www.wikidata.org/w/api.php";
const BOARD_GAME_QID = "Q7889";

interface WikidataSearchHit {
  id: string;
  label: string;
  description?: string;
}

type WikidataClaimSnak = {
  mainsnak?: {
    datavalue?: {
      value?: string | { id?: string; time?: string };
    };
  };
};

interface WikidataEntity {
  labels?: Record<string, { value: string }>;
  descriptions?: Record<string, { value: string }>;
  sitelinks?: Record<string, { title: string }>;
  claims?: Record<string, WikidataClaimSnak[]>;
}

export function extractWikidataEntityIds(
  entity: WikidataEntity,
  property: string,
): string[] {
  return (entity.claims?.[property] || [])
    .map((claim) => claim.mainsnak?.datavalue?.value)
    .filter(
      (value): value is { id: string } =>
        typeof value === "object" &&
        value !== null &&
        "id" in value &&
        Boolean(value.id),
    )
    .map((value) => value.id);
}

async function resolveWikidataLabels(
  qids: string[],
): Promise<Map<string, string>> {
  const uniqueIds = Array.from(new Set(qids));
  if (uniqueIds.length === 0) return new Map();

  const response = await axios.get(WIKIDATA_API, {
    params: {
      action: "wbgetentities",
      ids: uniqueIds.join("|"),
      props: "labels",
      languages: "fr|en",
      format: "json",
    },
    headers: { "User-Agent": USER_AGENT },
    timeout: 10000,
  });

  const labels = new Map<string, string>();
  for (const [qid, entity] of Object.entries(
    response.data?.entities || {},
  ) as Array<[string, WikidataEntity]>) {
    const label =
      entity.labels?.fr?.value ||
      entity.labels?.en?.value ||
      Object.values(entity.labels || {})[0]?.value;
    if (label) labels.set(qid, label);
  }
  return labels;
}

export async function extractWikidataPeople(entity: WikidataEntity): Promise<{
  authors: Array<{ name: string }>;
  publishers: Array<{ name: string }>;
}> {
  const authorIds = [
    ...extractWikidataEntityIds(entity, "P287"),
    ...extractWikidataEntityIds(entity, "P178"),
    ...extractWikidataEntityIds(entity, "P170"),
  ];
  const publisherIds = extractWikidataEntityIds(entity, "P123");
  const labelMap = await resolveWikidataLabels([...authorIds, ...publisherIds]);

  const authors = authorIds
    .map((qid) => labelMap.get(qid))
    .filter(Boolean)
    .map((name) => ({ name: name! }));
  const publishers = publisherIds
    .map((qid) => labelMap.get(qid))
    .filter(Boolean)
    .map((name) => ({ name: name! }));

  return {
    authors: Array.from(
      new Map(authors.map((person) => [person.name, person])).values(),
    ),
    publishers: Array.from(
      new Map(publishers.map((person) => [person.name, person])).values(),
    ),
  };
}

function isBoardGameDescription(description?: string): boolean {
  const desc = description?.toLowerCase() || "";
  if (!desc) return false;
  if (/video game|jeu vidéo|console edition|dlc/i.test(desc)) return false;
  return /board game|jeu de société|tabletop|jeu de plateau|card game|strategic board/i.test(
    desc,
  );
}

function entityClaimsBoardGame(entity: WikidataEntity): boolean {
  const instanceIds = extractWikidataEntityIds(entity, "P31");
  if (instanceIds.includes(BOARD_GAME_QID)) return true;
  return isBoardGameDescription(
    entity.descriptions?.fr?.value || entity.descriptions?.en?.value,
  );
}

function commonsFileUrl(filename: string): string {
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(filename)}`;
}

function parseWikidataDate(time?: string): string | undefined {
  if (!time) return undefined;
  const match = time.match(/^([+-]?\d{4})/);
  if (!match) return undefined;
  const year = match[1].replace(/^\+/, "");
  return `${year.padStart(4, "0").slice(-4)}-01-01`;
}

function scoreSearchHit(name: string, hit: WikidataSearchHit): number {
  const distance = levenshtein.get(name.toLowerCase(), hit.label.toLowerCase());
  const boardGameBonus = isBoardGameDescription(hit.description) ? -5 : 10;
  return distance + boardGameBonus;
}

async function searchWikidataEntities(
  query: string,
): Promise<WikidataSearchHit[]> {
  const response = await axios.get(WIKIDATA_API, {
    params: {
      action: "wbsearchentities",
      search: query,
      language: "fr",
      format: "json",
      limit: 8,
      type: "item",
    },
    headers: { "User-Agent": USER_AGENT },
    timeout: 10000,
  });
  return response.data?.search || [];
}

async function fetchWikidataEntity(
  qid: string,
): Promise<WikidataEntity | null> {
  const response = await axios.get(
    `https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`,
    {
      headers: { "User-Agent": USER_AGENT },
      timeout: 10000,
    },
  );
  return response.data?.entities?.[qid] || null;
}

async function fetchWikipediaSummary(
  title: string,
  language: "fr" | "en",
): Promise<{ extract?: string; thumbnail?: string }> {
  const response = await axios.get(
    `https://${language}.wikipedia.org/w/api.php`,
    {
      params: {
        action: "query",
        prop: "extracts|pageimages",
        exintro: 1,
        explaintext: 1,
        piprop: "thumbnail",
        pithumbsize: 800,
        titles: title,
        format: "json",
      },
      headers: { "User-Agent": USER_AGENT },
      timeout: 10000,
    },
  );
  const page = Object.values(response.data?.query?.pages || {})[0] as
    | { extract?: string; thumbnail?: { source?: string } }
    | undefined;
  return {
    extract: page?.extract,
    thumbnail: page?.thumbnail?.source,
  };
}

function buildWikidataFacts(
  qid: string,
  entity: WikidataEntity,
  wikiTitle?: string,
): MetadataFact[] {
  const facts: MetadataFact[] = [
    {
      kind: "external-link",
      label: "Wikidata",
      value: qid,
      url: `https://www.wikidata.org/wiki/${qid}`,
      source: "wikidata",
    },
  ];

  if (wikiTitle) {
    facts.push({
      kind: "external-link",
      label: "Wikipedia",
      value: wikiTitle,
      url: `https://fr.wikipedia.org/wiki/${encodeURIComponent(wikiTitle.replace(/ /g, "_"))}`,
      source: "wikidata",
    });
  }

  const aliases = Object.values(entity.labels || {})
    .map((entry) => entry.value)
    .filter(Boolean);
  if (aliases.length > 1) {
    facts.push({
      kind: "aliases",
      label: "Alias Wikidata",
      value: aliases.slice(0, 6).join(" · "),
      source: "wikidata",
    });
  }

  return facts;
}

function buildWikidataRegionalTitles(
  entity: WikidataEntity,
  title: string | undefined,
): Array<{ region?: string; text: string }> | undefined {
  if (!title) return undefined;
  const labels = Object.entries(entity.labels || {}).flatMap(
    ([language, entry]) => {
      const text = entry.value?.trim();
      if (!text) return [];
      return [{ region: language, text }];
    },
  );

  if (labels.length === 0) return undefined;
  return Array.from(
    new Map(
      labels.map((entry) => [`${entry.region || ""}:${entry.text.toLowerCase()}`, entry]),
    ).values(),
  );
}

function buildWikidataObservations(
  qid: string,
  metadata: MetadataResult,
  language: "fr" | "en",
) {
  return observationsFromMetadataResult(
    {
      ...metadata,
      imageUrl: undefined,
    },
    {
      providerId: "wikidata",
      providerLabel: "Wikidata",
      sourceDocumentRole: "reference_record",
      sourceUrl: `https://www.wikidata.org/wiki/${qid}`,
      evidenceSignals: ["structured_data", "external_id"],
      titleRole: "object_title",
      aliasRole: "provider_grouped_alias",
      imageRole: "cover_front",
      factRole: "structured_fact",
      externalIdRole: "provider_record_id",
      language,
    },
  );
}

export function createWikidataResolver() {
  return async function fetchFromWikidata(
    name: string,
  ): Promise<MetadataResult | null> {
    const query = name.trim();
    if (!query) return null;

    try {
      const hits = await searchWikidataEntities(query);
      if (hits.length === 0) return null;

      const ranked = [...hits].sort(
        (a, b) => scoreSearchHit(query, a) - scoreSearchHit(query, b),
      );

      let selectedEntity: WikidataEntity | null = null;
      let selectedQid: string | null = null;

      for (const hit of ranked) {
        const entity = await fetchWikidataEntity(hit.id);
        if (!entity || !entityClaimsBoardGame(entity)) continue;
        selectedEntity = entity;
        selectedQid = hit.id;
        break;
      }

      if (!selectedEntity || !selectedQid) return null;

      const title =
        selectedEntity.labels?.fr?.value ||
        ranked.find((hit) => hit.id === selectedQid)?.label ||
        selectedEntity.labels?.en?.value;

      const frWikiTitle = selectedEntity.sitelinks?.frwiki?.title;
      const enWikiTitle = selectedEntity.sitelinks?.enwiki?.title;
      const wikiTitle = frWikiTitle || enWikiTitle;
      const wikiLanguage: "fr" | "en" = frWikiTitle ? "fr" : "en";

      const wikiSummary = wikiTitle
        ? await fetchWikipediaSummary(wikiTitle, wikiLanguage)
        : {};

      const description =
        wikiSummary.extract ||
        selectedEntity.descriptions?.fr?.value ||
        selectedEntity.descriptions?.en?.value;

      const imageValue =
        selectedEntity.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
      const imageFilename =
        typeof imageValue === "string" ? imageValue : undefined;
      const imageUrl =
        (imageFilename ? commonsFileUrl(imageFilename) : undefined) ||
        wikiSummary.thumbnail;

      const releaseDate = parseWikidataDate(
        (
          selectedEntity.claims?.P577?.[0]?.mainsnak?.datavalue?.value as
            | { time?: string }
            | undefined
        )?.time,
      );

      const people = await extractWikidataPeople(selectedEntity);

      const aliases = Object.values(selectedEntity.labels || {})
        .map((entry) => entry.value)
        .filter((alias) => alias && alias !== title);

      const metadata: MetadataResult = {
        title,
        description,
        releaseDate,
        authors: people.authors.length > 0 ? people.authors : undefined,
        publishers:
          people.publishers.length > 0 ? people.publishers : undefined,
        imageUrl,
        aliases: aliases.length > 0 ? Array.from(new Set(aliases)) : undefined,
        regionalTitles: buildWikidataRegionalTitles(selectedEntity, title),
        attachments: imageUrl
          ? [{ type: "cover", url: imageUrl, source: "wikidata" }]
          : undefined,
        facts: buildWikidataFacts(
          selectedQid,
          selectedEntity,
          frWikiTitle || enWikiTitle,
        ),
        externalIds: { wikidata: selectedQid },
      };
      return {
        ...metadata,
        observations: buildWikidataObservations(
          selectedQid,
          metadata,
          wikiLanguage,
        ),
        observationSchemaVersion: METADATA_OBSERVATION_SCHEMA_VERSION,
      };
    } catch (error) {
      console.error("[Wikidata] Metadata lookup failed:", error);
      return null;
    }
  };
}
