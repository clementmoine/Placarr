import { describe, expect, it } from "vitest";
import {
  consolidatePlayerFacts,
  consolidateGeneralFacts,
  isMaxPlayersFact,
  parsePlayerFactRange,
  formatDetailFactSourceToken,
  parseFactSourceList,
  DetailFact,
} from "./playerFacts";

describe("playerFacts", () => {
  describe("formatDetailFactSourceToken", () => {
    it("prefers stamped providerLabel for a single-source fact", () => {
      const fact: DetailFact = {
        kind: "rating",
        label: "BGG",
        value: "8",
        source: "bgg",
        providerLabel: "BoardGameGeek",
      };
      expect(formatDetailFactSourceToken(fact, "bgg")).toBe("BoardGameGeek");
    });

    it("formats How Long to Beat platform suffixes", () => {
      const fact: DetailFact = {
        kind: "time-to-beat",
        label: "Main",
        value: "12 h",
        source: "How Long to Beat · PC",
        isHowLongToBeatSource: true,
      };
      expect(formatDetailFactSourceToken(fact, "How Long to Beat · PC")).toBe(
        "How Long to Beat · PC",
      );
    });

    it("keeps pre-formatted sourceNames from the API unchanged", () => {
      const fact: DetailFact = {
        kind: "estimated-value",
        label: "Valeur",
        value: "12 €",
        sourceNames: ["PriceCharting", "LeDénicheur"],
      };
      expect(formatDetailFactSourceToken(fact, "PriceCharting")).toBe(
        "PriceCharting",
      );
    });
  });

  describe("isMaxPlayersFact", () => {
    it("should identify max players facts", () => {
      expect(
        isMaxPlayersFact({ kind: "players", label: "Max players", value: "4" }),
      ).toBe(true);
      expect(
        isMaxPlayersFact({ kind: "players", label: "Joueurs max", value: "2" }),
      ).toBe(true);
      expect(
        isMaxPlayersFact({
          kind: "players",
          label: "Maximum players",
          value: "1",
        }),
      ).toBe(true);
      expect(
        isMaxPlayersFact({ kind: "players", label: "Players", value: "4" }),
      ).toBe(false);
      expect(
        isMaxPlayersFact({
          kind: "duration",
          label: "Max players",
          value: "4",
        }),
      ).toBe(false);
    });
  });

  describe("parsePlayerFactRange", () => {
    it("should parse range values", () => {
      expect(
        parsePlayerFactRange({
          kind: "players",
          label: "Players",
          value: "1-4",
        }),
      ).toEqual({ min: 1, max: 4, maxOnly: false });

      expect(
        parsePlayerFactRange({
          kind: "players",
          label: "Players",
          value: "1 à 2",
        }),
      ).toEqual({ min: 1, max: 2, maxOnly: false });
    });

    it("should parse single values", () => {
      expect(
        parsePlayerFactRange({ kind: "players", label: "Players", value: "1" }),
      ).toEqual({ min: 1, max: 1, maxOnly: false });

      expect(
        parsePlayerFactRange({
          kind: "players",
          label: "Max players",
          value: "1",
        }),
      ).toEqual({ min: null, max: 1, maxOnly: true });
    });

    it("should return null for invalid values", () => {
      expect(
        parsePlayerFactRange({
          kind: "players",
          label: "Players",
          value: "invalid",
        }),
      ).toBeNull();
    });
  });

  describe("consolidatePlayerFacts", () => {
    it("should filter out maxOnly facts and merge their sources", () => {
      const facts: DetailFact[] = [
        {
          kind: "players",
          label: "Players",
          value: "1",
          sourceNames: ["IGDB"],
        },
        {
          kind: "players",
          label: "Max players",
          value: "1",
          sourceNames: ["LaunchBox"],
        },
      ];

      const consolidated = consolidatePlayerFacts(facts);
      expect(consolidated).toEqual([
        {
          kind: "players",
          label: "Players",
          value: "1",
          sourceNames: ["IGDB", "LaunchBox"],
          sourceCount: 2,
          source: undefined,
        },
      ]);
    });

    it("should merge source arrays if they are already present", () => {
      const facts: DetailFact[] = [
        {
          kind: "players",
          label: "Players",
          value: "1",
          sourceNames: ["IGDB", "RAWG"],
        },
        {
          kind: "players",
          label: "Max players",
          value: "1",
          sourceNames: ["LaunchBox"],
        },
      ];

      const consolidated = consolidatePlayerFacts(facts);
      expect(consolidated).toEqual([
        {
          kind: "players",
          label: "Players",
          value: "1",
          sourceNames: ["IGDB", "RAWG", "LaunchBox"],
          sourceCount: 3,
          source: undefined,
        },
      ]);
    });

    it("should merge explicit and maxOnly facts into a single union fact", () => {
      const facts: DetailFact[] = [
        {
          kind: "players",
          label: "Players",
          value: "1-2",
          sourceNames: ["IGDB"],
        },
        {
          kind: "players",
          label: "Max players",
          value: "4",
          sourceNames: ["LaunchBox"],
        },
      ];

      const consolidated = consolidatePlayerFacts(facts);
      expect(consolidated).toEqual([
        {
          kind: "players",
          label: "Players",
          value: "1-2|4 max",
          sourceNames: ["IGDB", "LaunchBox"],
          sourceCount: 2,
          source: undefined,
        },
      ]);
    });

    it("should merge multiple maxOnly facts into a single union fact with highest max", () => {
      const facts: DetailFact[] = [
        {
          kind: "players",
          label: "Max players",
          value: "2",
          sourceNames: ["LaunchBox"],
        },
        {
          kind: "players",
          label: "Max players",
          value: "4",
          sourceNames: ["IGDB"],
        },
      ];

      const consolidated = consolidatePlayerFacts(facts);
      expect(consolidated).toEqual([
        {
          kind: "players",
          label: "Max players",
          value: "2 max|4 max",
          sourceNames: ["LaunchBox", "IGDB"],
          sourceCount: 2,
          source: undefined,
        },
      ]);
    });

    it("should pick the consensus choice when supported by more sources", () => {
      const facts: DetailFact[] = [
        {
          kind: "players",
          label: "Max players",
          value: "2",
          sourceNames: ["LaunchBox"],
        },
        {
          kind: "players",
          label: "Max players",
          value: "4",
          sourceNames: ["IGDB"],
        },
        {
          kind: "players",
          label: "Max players",
          value: "4",
          sourceNames: ["SS"],
        },
      ];

      const consolidated = consolidatePlayerFacts(facts);
      expect(consolidated).toEqual([
        {
          kind: "players",
          label: "Max players",
          value: "4",
          sourceNames: ["LaunchBox", "IGDB", "SS"],
          sourceCount: 3,
          source: undefined,
        },
      ]);
    });
  });

  describe("consolidateGeneralFacts", () => {
    it("should merge simple duplicate facts of same value", () => {
      const facts: DetailFact[] = [
        {
          kind: "duration",
          label: "Durée",
          value: "7 h 46",
          sourceNames: ["LaunchBox"],
        },
        {
          kind: "duration",
          label: "Durée",
          value: "7 h 46",
          sourceNames: ["SS"],
        },
      ];
      const consolidated = consolidateGeneralFacts(facts);
      expect(consolidated).toEqual([
        {
          kind: "duration",
          label: "Durée",
          value: "7 h 46",
          sourceNames: ["LaunchBox", "SS"],
          sourceCount: 2,
          source: undefined,
        },
      ]);
    });

    it("should choose the fact with higher consensus (more sources)", () => {
      const facts: DetailFact[] = [
        {
          kind: "duration",
          label: "Durée",
          value: "7 h 46",
          sourceNames: ["LaunchBox"],
        },
        {
          kind: "duration",
          label: "Durée",
          value: "8 h 15",
          sourceNames: ["SS"],
        },
        {
          kind: "duration",
          label: "Durée",
          value: "8 h 15",
          sourceNames: ["IGDB"],
        },
      ];
      const consolidated = consolidateGeneralFacts(facts);
      expect(consolidated).toEqual([
        {
          kind: "duration",
          label: "Durée",
          value: "8 h 15",
          sourceNames: ["LaunchBox", "SS", "IGDB"],
          sourceCount: 3,
          source: undefined,
        },
      ]);
    });

    it("should produce a tie-broken value if consensus count is equal", () => {
      const facts: DetailFact[] = [
        {
          kind: "duration",
          label: "Durée",
          value: "8 h 15",
          sourceNames: ["SS"],
        },
        {
          kind: "duration",
          label: "Durée",
          value: "7 h 46",
          sourceNames: ["LaunchBox"],
        },
      ];
      const consolidated = consolidateGeneralFacts(facts);
      expect(consolidated).toEqual([
        {
          kind: "duration",
          label: "Durée",
          value: "7 h 46|8 h 15",
          sourceNames: ["SS", "LaunchBox"],
          sourceCount: 2,
          source: undefined,
        },
      ]);
    });

    it("should sort tie-broken values naturally/numerically", () => {
      const facts: DetailFact[] = [
        {
          kind: "pages",
          label: "Pages",
          value: "320",
          sourceNames: ["SS"],
        },
        {
          kind: "pages",
          label: "Pages",
          value: "80",
          sourceNames: ["LaunchBox"],
        },
      ];
      const consolidated = consolidateGeneralFacts(facts);
      expect(consolidated).toEqual([
        {
          kind: "pages",
          label: "Pages",
          value: "80|320",
          sourceNames: ["SS", "LaunchBox"],
          sourceCount: 2,
          source: undefined,
        },
      ]);
    });
  });
});
