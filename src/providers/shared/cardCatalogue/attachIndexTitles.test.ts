import { describe, expect, it } from "vitest";

import type { CardsIndexV1 } from "@/effects/cardsIndex";

import {
  applyResolvedTitle,
  attachSiblingTitlesToCardsIndex,
  attachTitlesToCardsIndex,
} from "./attachIndexTitles";

describe("applyResolvedTitle", () => {
  it("writes attested names without provenance", () => {
    const files = {};
    expect(
      applyResolvedTitle(files, { kind: "attested", name: "Ariel" }),
    ).toBe(true);
    expect(files).toEqual({ name: "Ariel" });
  });

  it("show fallback uses nameSource; hide uses nameLocaleFrom", () => {
    const show = {};
    applyResolvedTitle(show, {
      kind: "fallback",
      name: "Spidops ex",
      catalogue: "show",
      from: "en",
    });
    expect(show).toEqual({ name: "Spidops ex", nameSource: "en" });

    const hide = { nameSource: "stale" };
    applyResolvedTitle(hide, {
      kind: "fallback",
      name: "うちはサスケ",
      catalogue: "hide",
      from: "ja",
    });
    expect(hide).toEqual({ name: "うちはサスケ", nameLocaleFrom: "ja" });
  });
});

describe("attachSiblingTitlesToCardsIndex", () => {
  it("fills nameless art langs from an attested sibling with nameSource", () => {
    const index: CardsIndexV1 = {
      version: 1,
      pack: "demo",
      generatedAt: "2026-01-01T00:00:00.000Z",
      cards: {
        "demo:1": {
          set: "s1",
          card: "1",
          langs: {
            en: { name: "Guy", art: "art.en.webp" },
            fr: { art: "art.fr.webp" },
          },
        },
      },
    };
    expect(attachSiblingTitlesToCardsIndex(index)).toEqual({ named: 1 });
    expect(index.cards["demo:1"]?.langs.fr).toEqual({
      art: "art.fr.webp",
      name: "Guy",
      nameSource: "en",
    });
    expect(index.cards["demo:1"]?.langs.en?.nameSource).toBeUndefined();
  });

  it("does not overwrite attested titles", () => {
    const index: CardsIndexV1 = {
      version: 1,
      pack: "demo",
      generatedAt: "2026-01-01T00:00:00.000Z",
      cards: {
        "demo:1": {
          set: "s1",
          card: "1",
          name: "Et voici",
          langs: {
            en: { name: "Title Card" },
            fr: { name: "Et voici" },
          },
        },
      },
    };
    expect(attachSiblingTitlesToCardsIndex(index)).toEqual({ named: 0 });
    expect(index.cards["demo:1"]?.langs.fr?.name).toBe("Et voici");
  });
});

describe("attachTitlesToCardsIndex", () => {
  it("applies a pack resolver onto empty slots", () => {
    const index: CardsIndexV1 = {
      version: 1,
      pack: "demo",
      generatedAt: "2026-01-01T00:00:00.000Z",
      cards: {
        "sv1_fr_019": {
          set: "sv1",
          card: "019",
          langs: { fr: { art: "art.webp" } },
        },
      },
    };
    const { named } = attachTitlesToCardsIndex(index, (printKey, lang) => {
      if (printKey === "sv1_fr_019" && lang === "fr") {
        return {
          kind: "fallback",
          name: "Spidops ex",
          catalogue: "show",
          from: "en",
        };
      }
      return null;
    });
    expect(named).toBe(1);
    expect(index.cards.sv1_fr_019?.langs.fr).toEqual({
      art: "art.webp",
      name: "Spidops ex",
      nameSource: "en",
    });
    expect(index.cards.sv1_fr_019?.name).toBe("Spidops ex");
  });
});
