import { describe, expect, it } from "vitest";
import type { DetailFact } from "./playerFacts";
import {
  consolidateTagLikeFactsByKind,
  dedupeTagLikeFacts,
  extractProviderLinkFacts,
  filterRedundantDisplayFacts,
  parseAgeFromFactValue,
  providerLinkDisplayLabel,
  sortProviderLinkFacts,
} from "./displayFacts";

describe("displayFacts", () => {
  describe("parseAgeFromFactValue", () => {
    it("extracts numeric age from rating strings", () => {
      expect(parseAgeFromFactValue("12+")).toBe(12);
      expect(parseAgeFromFactValue("8 ans et plus")).toBe(8);
    });
  });

  describe("extractProviderLinkFacts", () => {
    it("keeps only external links with urls", () => {
      const facts: DetailFact[] = [
        {
          kind: "external-link",
          label: "Philibert",
          value: "Voir",
          url: "https://www.philibertnet.com",
        },
        { kind: "external-link", label: "BGG", value: "Voir" },
        { kind: "players", label: "Joueurs", value: "2-4" },
      ];

      expect(extractProviderLinkFacts(facts)).toHaveLength(1);
    });

    it("dedupes provider aliases for the same storefront", () => {
      const facts: DetailFact[] = [
        {
          kind: "external-link",
          label: "BoardGameGeek",
          value: "Fiche BGG",
          url: "https://boardgamegeek.com/boardgame/18803",
          source: "boardgamegeek",
          providerLabel: "BoardGameGeek",
          priority: 303,
        },
        {
          kind: "external-link",
          label: "BoardGameGeek",
          value: "Voir la fiche",
          url: "https://boardgamegeek.com/boardgame/18803",
          source: "bgg",
          providerLabel: "BoardGameGeek",
          priority: 42,
        },
      ];

      expect(extractProviderLinkFacts(facts)).toHaveLength(1);
      expect(extractProviderLinkFacts(facts)[0]?.priority).toBe(303);
    });

    it("keeps distinct labels such as Wikipedia and Wikidata", () => {
      const facts: DetailFact[] = [
        {
          kind: "external-link",
          label: "Wikidata",
          value: "Voir",
          url: "https://www.wikidata.org/wiki/Q123",
          source: "wikidata",
        },
        {
          kind: "external-link",
          label: "Wikipedia",
          value: "Voir",
          url: "https://en.wikipedia.org/wiki/LittleBigPlanet",
          source: "wikidata",
        },
      ];

      expect(extractProviderLinkFacts(facts)).toHaveLength(2);
    });

    it("keeps PriceCharting EUR and US chips despite shared providerLabel", () => {
      const facts: DetailFact[] = [
        {
          kind: "external-link",
          label: "PriceCharting (EUR)",
          value: "Voir la fiche",
          url: "https://www.pricecharting.com/game/pal-xbox-360/xbox-360-slim-250gb",
          source: "pricecharting",
          providerLabel: "PriceCharting",
          priority: 44,
        },
        {
          kind: "external-link",
          label: "PriceCharting (US)",
          value: "Voir la fiche",
          url: "https://www.pricecharting.com/game/xbox-360/xbox-360-slim-console-250gb",
          source: "pricecharting",
          providerLabel: "PriceCharting",
          priority: 42,
        },
      ];

      const links = extractProviderLinkFacts(facts);
      expect(links).toHaveLength(2);
      expect(links.map((fact) => fact.label).sort()).toEqual([
        "PriceCharting (EUR)",
        "PriceCharting (US)",
      ]);
    });
  });

  describe("filterRedundantDisplayFacts", () => {
    it("drops noisy facts and duplicate recommended age", () => {
      const facts: DetailFact[] = [
        { kind: "price", label: "Philibert", value: "12 €" },
        { kind: "review", label: "Avis", value: "Super jeu" },
        { kind: "popularity", label: "Classement BGG", value: "#4801" },
        { kind: "age-rating", label: "Âge", value: "12+" },
        { kind: "recommended-age", label: "Âge communauté", value: "12+" },
        {
          kind: "external-link",
          label: "BGG",
          value: "Voir",
          url: "https://boardgamegeek.com",
        },
      ];

      const filtered = filterRedundantDisplayFacts(facts);
      expect(filtered.map((fact) => fact.kind)).toEqual(["age-rating"]);
    });

    it("hides BGG recommended-players poll text", () => {
      const facts: DetailFact[] = [
        { kind: "players", label: "Joueurs", value: "2-99" },
        {
          kind: "recommended-players",
          label: "Joueurs recommandés",
          value: "Best with 4–6 players · Recommended with 3–11 players",
        },
      ];

      expect(
        filterRedundantDisplayFacts(facts).map((fact) => fact.kind),
      ).toEqual(["players"]);
    });

    it("merges category facts from different providers into one row", () => {
      const facts: DetailFact[] = [
        {
          kind: "category",
          label: "Catégories",
          value: "Humour • Party",
          source: "bgg",
          providerLabel: "BoardGameGeek",
          priority: 58,
        },
        {
          kind: "category",
          label: "Thèmes",
          value: "Humour • Déduction",
          source: "philibert",
          providerLabel: "Philibert",
          priority: 52,
        },
        {
          kind: "category",
          label: "Catégories",
          value: "Party",
          source: "okkazeo",
          providerLabel: "Okkazeo",
          priority: 50,
        },
      ];

      const filtered = filterRedundantDisplayFacts(facts);
      expect(filtered).toHaveLength(1);
      expect(filtered[0]?.label).toBe("Catégories");
      expect(filtered[0]?.value).toBe("Humour • Party • Déduction");
      expect(filtered[0]?.sourceCount).toBe(3);
    });

    it("merges duplicate tag values across sources", () => {
      const facts: DetailFact[] = [
        {
          kind: "category",
          label: "Catégorie",
          value: "Humour",
          source: "bgg",
          providerLabel: "BoardGameGeek",
        },
        {
          kind: "category",
          label: "Category",
          value: "Humour",
          source: "philibert",
          providerLabel: "Philibert",
        },
      ];

      const filtered = filterRedundantDisplayFacts(facts);
      expect(filtered).toHaveLength(1);
      expect(filtered[0]?.sourceCount).toBe(2);
    });

    it("hides catalog price facts from the detail table", () => {
      const facts: DetailFact[] = [
        {
          kind: "price",
          label: "Estimation",
          value: "de 5 à 10 euros",
          source: "bedetheque",
          providerLabel: "Bédéthèque",
        },
        {
          kind: "price",
          label: "Occasion dès",
          value: "11,00 €",
          source: "booknode",
        },
        {
          kind: "genre",
          label: "Genre",
          value: "Humour",
          source: "bedetheque",
        },
      ];

      const filtered = filterRedundantDisplayFacts(facts);
      expect(filtered).toHaveLength(1);
      expect(filtered[0]).toMatchObject({
        kind: "tag",
        label: "Thème",
        value: "Humour",
      });
    });

    it("keeps TCG collector numbers (format) while hiding raw identifiers", () => {
      const facts: DetailFact[] = [
        {
          kind: "identifier",
          label: "Référence",
          value: "Winterspell · 34 P3",
          source: "lorcanajson",
        },
        {
          kind: "format",
          label: "Numéro",
          value: "34/P3",
          source: "lorcanajson",
        },
        {
          kind: "series",
          label: "Extension",
          value: "Winterspell",
          source: "lorcanajson",
        },
      ];

      const filtered = filterRedundantDisplayFacts(facts);
      expect(filtered).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ kind: "format", label: "Numéro", value: "34/P3" }),
          expect.objectContaining({
            kind: "series",
            label: "Extension",
            value: "Winterspell",
          }),
        ]),
      );
      expect(filtered.some((fact) => fact.kind === "identifier")).toBe(false);
    });

    it("merges booknode tags and bedetheque genres into one theme row", () => {
      const facts: DetailFact[] = [
        {
          kind: "genre",
          label: "Thèmes Booknode",
          value: "Humour • Walt Disney",
          source: "booknode",
          providerLabel: "Booknode",
        },
        {
          kind: "tag",
          label: "Thème",
          value: "Europe - Jeunesse",
          source: "bedetheque",
          providerLabel: "Bédéthèque",
        },
      ];

      const filtered = filterRedundantDisplayFacts(facts);
      expect(filtered).toHaveLength(1);
      expect(filtered[0]).toMatchObject({
        kind: "tag",
        label: "Thème",
        value: "Humour • Walt Disney • Europe - Jeunesse",
        sourceCount: 2,
      });
    });
  });

  describe("consolidateTagLikeFactsByKind", () => {
    it("merges distinct tag values for the same kind", () => {
      const facts: DetailFact[] = [
        { kind: "mechanic", label: "Mécaniques", value: "Bluff", priority: 57 },
        {
          kind: "mechanic",
          label: "Mécanismes",
          value: "Déduction",
          priority: 50,
        },
      ];

      const consolidated = consolidateTagLikeFactsByKind(facts);
      expect(consolidated).toHaveLength(1);
      expect(consolidated[0]?.value).toBe("Bluff • Déduction");
      expect(consolidated[0]?.label).toBe("Mécaniques");
    });
  });

  describe("dedupeTagLikeFacts", () => {
    it("preserves distinct values for the same kind", () => {
      const facts: DetailFact[] = [
        { kind: "mechanic", label: "Mécanique", value: "Bluff" },
        { kind: "mechanic", label: "Mécanique", value: "Déduction" },
      ];

      expect(dedupeTagLikeFacts(facts)).toHaveLength(2);
    });
  });

  describe("providerLinkDisplayLabel", () => {
    it("prefers providerLabel when present", () => {
      const fact: DetailFact = {
        kind: "external-link",
        label: "BGG",
        value: "Voir",
        providerLabel: "BoardGameGeek",
      };
      expect(providerLinkDisplayLabel(fact)).toBe("BoardGameGeek");
    });
  });

  describe("extractProviderLinkFacts", () => {
    it("hides leaked __cached_fiche__ source chips", () => {
      const facts: DetailFact[] = [
        {
          kind: "external-link",
          label: "__cached_fiche__",
          value: "Voir la fiche",
          url: "https://www.pricecharting.com/game/wii/white-nintendo-wii-system",
          source: "__cached_fiche__",
        },
        {
          kind: "external-link",
          label: "PriceCharting",
          value: "Voir la fiche",
          url: "https://www.pricecharting.com/game/wii/white-nintendo-wii-system",
          source: "pricecharting",
          providerLabel: "PriceCharting",
        },
      ];
      const links = extractProviderLinkFacts(facts);
      expect(links).toHaveLength(1);
      expect(providerLinkDisplayLabel(links[0]!)).toBe("PriceCharting");
    });
  });

  describe("sortProviderLinkFacts", () => {
    it("sorts links alphabetically by display label", () => {
      const facts: DetailFact[] = [
        {
          kind: "external-link",
          label: "Z",
          value: "Z",
          url: "https://z.test",
        },
        {
          kind: "external-link",
          label: "A",
          value: "A",
          url: "https://a.test",
          providerLabel: "Alpha Shop",
        },
      ];

      expect(
        sortProviderLinkFacts(facts).map(providerLinkDisplayLabel),
      ).toEqual(["Alpha Shop", "Z"]);
    });
  });
});
