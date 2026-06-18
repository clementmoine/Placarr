import axios from "axios";
import { decode as decodeHTMLEntities } from "html-entities";
import levenshtein from "fast-levenshtein";
import { convertXML } from "simple-xml-to-json";

import type { MetadataFact, MetadataResult } from "@/services/metadata";

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

function getBGGRatingValue(
  game: { children?: BGGChild[] },
  key: string,
): string | undefined {
  const statistics = game.children?.find(
    (child) => child.statistics,
  )?.statistics;
  const ratings = statistics?.children?.find(
    (child: any) => child.ratings,
  )?.ratings;
  const rating = ratings?.children?.find((child: any) => child[key])?.[key];
  return rating?.value;
}

type BggResolverDeps = {
  formatScore: (value: number, scale: number) => string | null;
};

export function createBGGResolver(deps: BggResolverDeps) {
  return async function fetchFromBGG(name: string): Promise<MetadataResult | null> {
    try {
      const searchUrl = `https://boardgamegeek.com/xmlapi2/search?query=${encodeURIComponent(name)}&type=boardgame`;
      const searchRes = await axios.get(searchUrl, { responseType: "text" });
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

      const detailsUrl = `https://boardgamegeek.com/xmlapi2/thing?id=${gameId}&stats=1`;
      const detailsRes = await axios.get(detailsUrl, { responseType: "text" });
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

      const minPlayers = game.children.find((child: BGGChild) => child.minplayers)
        ?.minplayers?.value;
      const maxPlayers = game.children.find((child: BGGChild) => child.maxplayers)
        ?.maxplayers?.value;
      const playingTime = game.children.find(
        (child: BGGChild) => child.playingtime,
      )?.playingtime?.value;
      const minPlayTime = game.children.find(
        (child: BGGChild) => child.minplaytime,
      )?.minplaytime?.value;
      const maxPlayTime = game.children.find(
        (child: BGGChild) => child.maxplaytime,
      )?.maxplaytime?.value;
      const minAge = game.children.find((child: BGGChild) => child.minage)?.minage
        ?.value;
      const averageRating = getBGGRatingValue(game, "average");

      const image = game.children.find((child: BGGChild) => child.image)?.image
        ?.content;

      const designers = game.children
        .filter((child: BGGChild) => child.link?.type === "boardgamedesigner")
        .map((child: BGGChild) => ({
          name: child.link?.value || "",
        }));

      const publishers = game.children
        .filter((child: BGGChild) => child.link?.type === "boardgamepublisher")
        .map((child: BGGChild) => ({
          name: child.link?.value || "",
        }));

      const alternateNames = game.children
        .filter((child: BGGChild) => child.name?.type === "alternate")
        .map((child: BGGChild) => child.name?.value)
        .filter(Boolean) as string[];
      const aliases = alternateNames.filter(
        (n) => n.toLowerCase().trim() !== primaryName?.toLowerCase().trim(),
      );

      const facts: MetadataFact[] = [];
      if (minPlayers && maxPlayers) {
        facts.push({
          kind: "players",
          label: "Joueurs",
          value:
            minPlayers === maxPlayers
              ? minPlayers
              : `${minPlayers}-${maxPlayers}`,
          source: "bgg",
          confidence: 0.82,
          priority: 90,
        });
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
      if (minAge) {
        facts.push({
          kind: "age-rating",
          label: "Âge recommandé",
          value: `${minAge}+`,
          source: "bgg",
          confidence: 0.78,
          priority: 75,
        });
      }
      if (averageRating) {
        const value = deps.formatScore(Number(averageRating), 10);
        if (value) {
          facts.push({
            kind: "rating",
            label: "BoardGameGeek",
            value,
            source: "BGG",
            confidence: 0.82,
            priority: 84,
          });
        }
      }

      return {
        title: primaryName,
        description,
        releaseDate: yearPublished,
        imageUrl: image,
        authors: designers,
        publishers,
        attachments: image
          ? [
              {
                type: "cover",
                url: image,
                source: "bgg",
              },
            ]
          : [],
        aliases,
        facts,
      };
    } catch (error) {
      console.error("Error fetching from BGG:", error);
      return null;
    }
  };
}
