import axios from "axios";
import { decode as decodeHTMLEntities } from "html-entities";
import levenshtein from "fast-levenshtein";
import { convertXML } from "simple-xml-to-json";
import {
  METADATA_OBSERVATION_SCHEMA_VERSION,
  observationsFromMetadataResult,
} from "@/lib/metadataObservations";

import type {
  MetadataAttachment,
  MetadataFact,
  MetadataResult,
} from "@/types/metadataProvider";
import { pickBestCoverFromAttachments } from "@/lib/attachmentDisplayScore";
import { formatBoardGamePlayerCount } from "@/lib/boardGamePlayers";
import { mapBggLanguageToAttachmentRole } from "@/lib/localePreference";

export interface BGGChild {
  name?: { type: string; value: string };
  description?: { content: string };
  yearpublished?: { value: string };
  minplayers?: { value: string };
  maxplayers?: { value: string };
  playingtime?: { value: string };
  minplaytime?: { value: string };
  maxplaytime?: { value: string };
  minage?: { value: string };
  image?: { content: string };
  link?: { type: string; id: string; value: string };
  statistics?: { children?: any[] };
  versions?: {
    children?: Array<{
      item?: {
        children?: BGGChild[];
      };
    }>;
  };
}

interface BGGItem {
  item: {
    type: string;
    id: string;
    children: BGGChild[];
  };
}

export interface BGGResponse {
  items?: {
    children?: BGGItem[];
  };
}

function getBGGRatingsNode(game: { children?: BGGChild[] }) {
  const statistics = game.children?.find(
    (child) => child.statistics,
  )?.statistics;
  return statistics?.children?.find((child: any) => child.ratings)?.ratings;
}

function getBGGRankValue(game: { children?: BGGChild[] }): string | undefined {
  const ratings = getBGGRatingsNode(game);
  const ranks = ratings?.children?.find((child: any) => child.ranks)?.ranks;
  const rankEntries = ranks?.children || [];
  for (const entry of rankEntries) {
    const rank = entry.rank;
    if (rank?.name === "boardgame" && rank?.value) {
      return String(rank.value);
    }
  }
  return undefined;
}

function getBGGRatingValue(
  game: { children?: BGGChild[] },
  key: string,
): string | undefined {
  const ratings = getBGGRatingsNode(game);
  const rating = ratings?.children?.find((child: any) => child[key])?.[key];
  return rating?.value;
}

function getBGGPollSummaries(game: {
  children?: BGGChild[];
}): Map<string, Record<string, string>> {
  const summaries = new Map<string, Record<string, string>>();
  for (const child of game.children || []) {
    const pollSummary = (child as BGGChild & Record<string, unknown>)[
      "poll-summary"
    ] as
      | {
          name?: string;
          children?: Array<{ result?: { name?: string; value?: string } }>;
        }
      | undefined;
    if (!pollSummary?.name) continue;

    const results: Record<string, string> = {};
    for (const entry of pollSummary.children || []) {
      const result = entry.result;
      if (result?.name && result?.value) {
        results[result.name] = result.value;
      }
    }
    summaries.set(pollSummary.name, results);
  }
  return summaries;
}

// Community language-dependence levels (BGG `language_dependence` poll) → short FR.
const BGG_LANGUAGE_DEPENDENCE_FR: Record<string, string> = {
  "1": "Aucun texte nécessaire",
  "2": "Texte limité (facile à mémoriser)",
  "3": "Texte modéré (aide de jeu utile)",
  "4": "Texte important (traduction nécessaire)",
  "5": "Injouable dans une autre langue",
};

/**
 * Top community-voted result of a raw BGG `<poll>` (suggested_playerage,
 * language_dependence): `poll > results > result[numvotes]`, picking the most
 * voted entry. Returns null when the poll is absent or has no votes.
 */
function getBGGTopPollResult(
  game: { children?: BGGChild[] },
  pollName: string,
): { value: string; level?: string } | null {
  for (const child of game.children || []) {
    const poll = (child as BGGChild & Record<string, unknown>).poll as
      | {
          name?: string;
          children?: Array<{
            results?: {
              children?: Array<{
                result?: { value?: string; numvotes?: string; level?: string };
              }>;
            };
          }>;
        }
      | undefined;
    if (poll?.name !== pollName) continue;

    let best: { value: string; level?: string; votes: number } | null = null;
    for (const group of poll.children || []) {
      for (const entry of group.results?.children || []) {
        const result = entry.result;
        const votes = Number(result?.numvotes ?? 0);
        if (!result?.value || !Number.isFinite(votes) || votes <= 0) continue;
        if (!best || votes > best.votes) {
          best = { value: result.value, level: result.level, votes };
        }
      }
    }
    return best ? { value: best.value, level: best.level } : null;
  }
  return null;
}

function formatBGGComplexity(weight: string): string | null {
  const value = Number(weight);
  if (!Number.isFinite(value) || value <= 0) return null;
  return `${value.toFixed(1).replace(".", ",")} / 5`;
}

function buildBggAttachments(game: {
  children?: BGGChild[];
}): MetadataAttachment[] {
  const attachments: MetadataAttachment[] = [];
  const seenUrls = new Set<string>();

  const addCover = (url: string | undefined, role: string) => {
    if (!url || seenUrls.has(url)) return;
    seenUrls.add(url);
    attachments.push({
      type: "cover",
      url,
      role,
      source: "bgg",
    });
  };

  const mainImage = game.children?.find((child) => child.image)?.image?.content;
  addCover(mainImage, "wor");

  const versionsNode = game.children?.find((child) => child.versions)?.versions;

  for (const entry of versionsNode?.children || []) {
    const versionChildren = entry.item?.children;
    if (!versionChildren) continue;

    const image = versionChildren.find((child) => child.image)?.image?.content;
    const languages = versionChildren
      .filter((child) => child.link?.type === "language")
      .map((child) => child.link?.value || "")
      .filter(Boolean);
    const editionName = versionChildren.find(
      (child) => child.name?.type === "primary",
    )?.name?.value;
    const role = mapBggLanguageToAttachmentRole(languages[0], editionName);
    addCover(image, role);
  }

  return attachments;
}

const BGG_PROVIDER_ID = "boardgamegeek";
const BGG_SOURCE_LABELS = new Set([
  "bgg",
  "boardgamegeek",
  "board game geek",
]);

function normalizeBggSource(
  source: string | undefined,
): string | undefined {
  if (!source) return source;
  const normalized = source.trim().toLowerCase();
  return BGG_SOURCE_LABELS.has(normalized) ? BGG_PROVIDER_ID : source;
}

function buildBggObservations(
  gameId: string,
  metadata: MetadataResult,
) {
  const normalizedMetadata: MetadataResult = {
    ...metadata,
    attachments: metadata.attachments?.map((attachment) => ({
      ...attachment,
      source: normalizeBggSource(attachment.source),
    })),
    facts: metadata.facts?.map((fact) => ({
      ...fact,
      source: normalizeBggSource(fact.source),
    })),
  };

  return observationsFromMetadataResult(normalizedMetadata, {
    providerId: BGG_PROVIDER_ID,
    providerLabel: "BoardGameGeek",
    sourceDocumentRole: "reference_record",
    sourceUrl: `https://boardgamegeek.com/boardgame/${gameId}`,
    evidenceSignals: ["structured_data", "external_id"],
    titleRole: "object_title",
    aliasRole: "provider_grouped_alias",
    imageRole: "cover_front",
    factRole: "structured_fact",
    externalIdRole: "provider_record_id",
    language: "en",
  });
}

type BggResolverDeps = {
  formatScore: (value: number, scale: number) => string | null;
};

const BGG_HEADERS = {
  "User-Agent": "Placarr/1.0 (+https://github.com/clementmoine/Placarr)",
  Accept: "application/xml,text/xml,*/*",
};
let warnedMissingToken = false;

export function createBGGResolver(deps: BggResolverDeps) {
  return async function fetchFromBGG(
    name: string,
  ): Promise<MetadataResult | null> {
    const token = process.env.BGG_API_TOKEN?.trim();
    if (!token) {
      if (!warnedMissingToken) {
        warnedMissingToken = true;
        console.warn("[BGG] BGG_API_TOKEN missing — source disabled.");
      }
      return null;
    }
    const headers = {
      ...BGG_HEADERS,
      Authorization: `Bearer ${token}`,
    };

    try {
      const searchUrl = `https://boardgamegeek.com/xmlapi2/search?query=${encodeURIComponent(name)}&type=boardgame`;
      const searchRes = await axios.get(searchUrl, {
        responseType: "text",
        headers,
        timeout: 10000,
      });
      const searchText = searchRes.data;
      const searchData = convertXML(searchText) as BGGResponse;
      const items = searchData.items?.children || [];
      if (items.length === 0) return null;

      let bestMatch = items[0];
      let minDistance = levenshtein.get(
        name.toLowerCase(),
        bestMatch.item.children
          .find((child: BGGChild) => child.name?.type === "primary")
          ?.name?.value?.toLowerCase() || "",
      );

      for (const item of items) {
        const itemName =
          item.item.children
            .find((child: BGGChild) => child.name?.type === "primary")
            ?.name?.value?.toLowerCase() || "";
        const distance = levenshtein.get(name.toLowerCase(), itemName);
        if (distance < minDistance) {
          minDistance = distance;
          bestMatch = item;
        }
      }

      const gameId = bestMatch.item.id;
      if (!gameId) return null;

      const detailsUrl = `https://boardgamegeek.com/xmlapi2/thing?id=${gameId}&stats=1&versions=1`;
      const detailsRes = await axios.get(detailsUrl, {
        responseType: "text",
        headers,
        timeout: 10000,
      });
      const detailsText = detailsRes.data;
      const detailsData = convertXML(detailsText) as BGGResponse;
      const game = detailsData.items?.children?.[0]?.item;
      if (!game) return null;

      const primaryName = game.children.find(
        (child: BGGChild) => child.name?.type === "primary",
      )?.name?.value;

      const rawDescription = game.children.find(
        (child: BGGChild) => child.description,
      )?.description?.content;
      const description = rawDescription
        ? decodeHTMLEntities(rawDescription)
            .replace(/&#10;/g, "\n")
            .replace(/&ouml;/g, "ö")
            .replace(/&mdash;/g, "—")
        : undefined;

      const yearPublished = game.children.find(
        (child: BGGChild) => child.yearpublished,
      )?.yearpublished?.value;

      const minPlayers = game.children.find(
        (child: BGGChild) => child.minplayers,
      )?.minplayers?.value;
      const maxPlayers = game.children.find(
        (child: BGGChild) => child.maxplayers,
      )?.maxplayers?.value;
      const playingTime = game.children.find(
        (child: BGGChild) => child.playingtime,
      )?.playingtime?.value;
      const minPlayTime = game.children.find(
        (child: BGGChild) => child.minplaytime,
      )?.minplaytime?.value;
      const maxPlayTime = game.children.find(
        (child: BGGChild) => child.maxplaytime,
      )?.maxplaytime?.value;
      const minAge = game.children.find((child: BGGChild) => child.minage)
        ?.minage?.value;
      const averageRating = getBGGRatingValue(game, "average");
      const bayesAverage = getBGGRatingValue(game, "bayesaverage");
      const usersRated = getBGGRatingValue(game, "usersrated");
      const boardGameRank = getBGGRankValue(game);
      const averageWeight = getBGGRatingValue(game, "averageweight");
      const pollSummaries = getBGGPollSummaries(game);

      const attachments = buildBggAttachments(game);
      const imageUrl = pickBestCoverFromAttachments(attachments) || undefined;

      const designers = game.children
        .filter((child: BGGChild) => child.link?.type === "boardgamedesigner")
        .map((child: BGGChild) => ({
          name: child.link?.value || "",
        }));
      const artists = game.children
        .filter((child: BGGChild) => child.link?.type === "boardgameartist")
        .map((child: BGGChild) => child.link?.value || "")
        .filter(Boolean);

      const publishers = game.children
        .filter((child: BGGChild) => child.link?.type === "boardgamepublisher")
        .map((child: BGGChild) => ({
          name: child.link?.value || "",
        }));
      const categories = game.children
        .filter((child: BGGChild) => child.link?.type === "boardgamecategory")
        .map((child: BGGChild) => child.link?.value || "")
        .filter(Boolean);
      const mechanics = game.children
        .filter((child: BGGChild) => child.link?.type === "boardgamemechanic")
        .map((child: BGGChild) => child.link?.value || "")
        .filter(Boolean);
      const families = game.children
        .filter((child: BGGChild) => child.link?.type === "boardgamefamily")
        .map((child: BGGChild) => child.link?.value || "")
        .filter(Boolean);

      const alternateNames = game.children
        .filter((child: BGGChild) => child.name?.type === "alternate")
        .map((child: BGGChild) => child.name?.value)
        .filter(Boolean) as string[];
      const aliases = alternateNames.filter(
        (n) => n.toLowerCase().trim() !== primaryName?.toLowerCase().trim(),
      );

      const facts: MetadataFact[] = [];
      facts.push({
        kind: "external-link",
        label: "BoardGameGeek",
        value: "Fiche BGG",
        url: `https://boardgamegeek.com/boardgame/${gameId}`,
        source: "bgg",
        confidence: 0.84,
        priority: 42,
      });
      if (minPlayers && maxPlayers) {
        const players = formatBoardGamePlayerCount(minPlayers, maxPlayers);
        if (players) {
          facts.push({
            kind: "players",
            label: "Joueurs",
            value: players,
            source: "bgg",
            confidence: 0.82,
            priority: 90,
          });
        }
      }
      const durationValue =
        minPlayTime && maxPlayTime && minPlayTime !== maxPlayTime
          ? `${minPlayTime}-${maxPlayTime} min`
          : playingTime
            ? `${playingTime} min`
            : null;
      if (durationValue) {
        facts.push({
          kind: "playtime",
          label: "Durée d'une partie",
          value: durationValue,
          source: "bgg",
          confidence: 0.82,
          priority: 88,
        });
      }
      if (minAge && Number(minAge) > 0) {
        facts.push({
          kind: "age-rating",
          label: "Âge recommandé",
          value: `${minAge}+`,
          source: "bgg",
          confidence: 0.78,
          priority: 75,
        });
      }
      if (averageRating || bayesAverage) {
        const ratingNumber = bayesAverage || averageRating;
        const value = deps.formatScore(Number(ratingNumber), 10);
        if (value) {
          const count =
            usersRated && Number(usersRated) > 0
              ? ` (${new Intl.NumberFormat("fr-FR").format(Number(usersRated))} votes)`
              : "";
          facts.push({
            kind: "rating",
            label: "BoardGameGeek",
            value: `${value}${count}`,
            source: "BGG",
            confidence: bayesAverage ? 0.84 : 0.82,
            priority: 84,
          });
        }
      }
      if (boardGameRank) {
        facts.push({
          kind: "popularity",
          label: "Classement BGG",
          value: `#${new Intl.NumberFormat("fr-FR").format(Number(boardGameRank))}`,
          source: "BGG",
          confidence: 0.76,
          priority: 70,
        });
      }
      const complexityValue = averageWeight
        ? formatBGGComplexity(averageWeight)
        : null;
      if (complexityValue) {
        facts.push({
          kind: "complexity",
          label: "Complexité",
          value: complexityValue,
          source: "BGG",
          confidence: 0.8,
          priority: 72,
        });
      }
      const recommendedPlayersPoll = pollSummaries.get("suggested_numplayers");
      if (recommendedPlayersPoll) {
        const pollParts = [
          recommendedPlayersPoll.bestwith,
          recommendedPlayersPoll.recommmendedwith,
        ].filter(Boolean);
        if (pollParts.length > 0) {
          facts.push({
            kind: "recommended-players",
            label: "Joueurs recommandés",
            value: pollParts.join(" · "),
            source: "BGG",
            confidence: 0.78,
            priority: 86,
          });
        }
      }
      const suggestedAge = getBGGTopPollResult(game, "suggested_playerage");
      if (suggestedAge) {
        facts.push({
          kind: "recommended-age",
          label: "Âge conseillé (communauté)",
          value: /^\d+$/.test(suggestedAge.value)
            ? `${suggestedAge.value}+`
            : suggestedAge.value,
          source: "BGG",
          confidence: 0.74,
          priority: 60,
        });
      }
      const languageDependence = getBGGTopPollResult(
        game,
        "language_dependence",
      );
      if (languageDependence) {
        facts.push({
          kind: "language-dependence",
          label: "Dépendance à la langue",
          value:
            BGG_LANGUAGE_DEPENDENCE_FR[languageDependence.level ?? ""] ??
            languageDependence.value,
          source: "BGG",
          confidence: 0.72,
          priority: 55,
        });
      }
      if (artists.length > 0) {
        facts.push({
          kind: "artist",
          label: "Artistes",
          value: Array.from(new Set(artists)).join(", "),
          source: "BGG",
          confidence: 0.72,
          priority: 52,
        });
      }
      if (categories.length > 0) {
        facts.push({
          kind: "category",
          label: "Catégories",
          value: Array.from(new Set(categories)).slice(0, 6).join(" • "),
          source: "BGG",
          confidence: 0.74,
          priority: 58,
        });
      }
      if (mechanics.length > 0) {
        facts.push({
          kind: "mechanic",
          label: "Mécaniques",
          value: Array.from(new Set(mechanics)).slice(0, 6).join(" • "),
          source: "BGG",
          confidence: 0.74,
          priority: 57,
        });
      }
      if (families.length > 0) {
        facts.push({
          kind: "family",
          label: "Familles",
          value: Array.from(new Set(families)).slice(0, 4).join(" • "),
          source: "BGG",
          confidence: 0.7,
          priority: 49,
        });
      }

      const metadata: MetadataResult = {
        title: primaryName,
        description,
        releaseDate: yearPublished,
        imageUrl,
        authors: designers,
        publishers,
        attachments: attachments.length > 0 ? attachments : undefined,
        aliases,
        facts,
        externalIds: { bgg: String(gameId) },
      };
      return {
        ...metadata,
        observations: buildBggObservations(String(gameId), metadata),
        observationSchemaVersion: METADATA_OBSERVATION_SCHEMA_VERSION,
      };
    } catch (error: unknown) {
      const status =
        typeof error === "object" &&
        error !== null &&
        "response" in error &&
        typeof (error as { response?: { status?: number } }).response
          ?.status === "number"
          ? (error as { response?: { status?: number } }).response?.status
          : null;
      if (status === 401) {
        console.warn(
          "[BGG] Access denied (401). API temporarily unavailable in current runtime.",
        );
      } else {
        console.error("Error fetching from BGG:", error);
      }
      return null;
    }
  };
}
