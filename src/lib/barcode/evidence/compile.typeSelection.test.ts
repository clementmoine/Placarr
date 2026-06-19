import { describe, expect, it } from "vitest";

import { scoreTypeCandidate } from "./compile";
import { buildProductEvidence } from "./parse";
import type {
  CompiledResult,
  MatchEvidenceSummary,
  ResolvedMatch,
} from "./types";

/**
 * Régression "jeu homonyme d'un film". Code-barres 023272327521 = le jeu Xbox
 * "Star Wars Episode III : La Revanche des Sith". TMDB matche le FILM du même
 * nom (par recherche de nom, pas par code-barres) et renvoie des dizaines
 * d'alias localisés. Sans garde-fou, le type "movies" écrasait "games" et
 * l'item héritait d'un titre étranger (hongrois) sans étagère jeu.
 */

function makeEvidence(
  partial: Partial<MatchEvidenceSummary>,
): MatchEvidenceSummary {
  return {
    providers: [],
    canonicalProviders: [],
    trustedRetailerProviders: [],
    rawCount: 0,
    canonicalCount: 0,
    trustedRetailerCount: 0,
    marketplaceCount: 0,
    hasCover: false,
    confidence: 0.98,
    reasons: [],
    ...partial,
  };
}

function makeResult(
  partial: Partial<CompiledResult> & { match: Partial<ResolvedMatch> },
): CompiledResult {
  const { match, ...rest } = partial;
  const resolved: ResolvedMatch = {
    name: "x",
    suggestions: [],
    coverUrl: null,
    confidence: match.evidence?.confidence ?? 0.98,
    evidence: makeEvidence({}),
    ...match,
  };
  return {
    provider: "",
    rawNames: [],
    cleanName: "x",
    suggestions: [],
    matches: [resolved],
    platformKey: null,
    ...rest,
  };
}

describe("scoreTypeCandidate — jeu vs film homonyme", () => {
  const barcode = "023272327521";

  const gamesResult = makeResult({
    platformKey: "xbox",
    match: {
      evidence: makeEvidence({
        providers: ["ChasseAuxLivres", "PicClick"],
        canonicalProviders: [],
        canonicalCount: 0,
        marketplaceCount: 4,
        hasCover: true,
        confidence: 0.98,
      }),
    },
  });

  // Un seul provider canonique (TMDB) mais 76 lignes d'alias localisés.
  const moviesResult = makeResult({
    platformKey: null,
    match: {
      evidence: makeEvidence({
        providers: ["TMDB", "ChasseAuxLivres", "PicClick"],
        canonicalProviders: ["TMDB"],
        canonicalCount: 76,
        marketplaceCount: 5,
        hasCover: true,
        confidence: 0.98,
      }),
    },
  });

  it("le jeu (avec plateforme) doit l'emporter sur le film homonyme", () => {
    const gamesScore = scoreTypeCandidate("games", gamesResult, barcode);
    const moviesScore = scoreTypeCandidate("movies", moviesResult, barcode);
    expect(gamesScore).toBeGreaterThan(moviesScore);
  });

  it("la corroboration canonique est plafonnée par provider distinct (pas par ligne)", () => {
    // 76 alias d'un seul provider ne doivent pas peser plus que 2 alias :
    // seul `canonicalCount` change, tout le reste est identique.
    const fewAliases = makeResult({
      platformKey: null,
      match: {
        evidence: makeEvidence({
          providers: ["TMDB", "ChasseAuxLivres", "PicClick"],
          canonicalProviders: ["TMDB"],
          canonicalCount: 2,
          marketplaceCount: 5,
          hasCover: true,
          confidence: 0.98,
        }),
      },
    });
    expect(scoreTypeCandidate("movies", moviesResult, barcode)).toBe(
      scoreTypeCandidate("movies", fewAliases, barcode),
    );
  });
});

describe("buildProductEvidence — plateforme depuis une annonce marketplace", () => {
  it("détecte xbox même quand le suffixe plateforme est nettoyé du titre", () => {
    const evidence = buildProductEvidence("PicClick", {
      name: "Star Wars Episode Iii 3 La Revanche Des Sith - Xbox - Fr - En Boite",
    });

    // Le titre d'affichage perd "Xbox" (suffixe nettoyé)…
    expect(evidence?.cleanName.toLowerCase()).not.toContain("xbox");
    // …mais le signal plateforme est conservé via le nom brut.
    expect(evidence?.parsed.platformKey).toBe("xbox");
  });
});
