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
    displayName: "x",
    edition: null,
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

/**
 * Régression "jeu de société classé en jeu vidéo". Code-barres 3421272109517 =
 * "Mille Sabords" (Gigamic). En scan sans type, un match jeu vidéo coïncident
 * pouvait l'emporter sur le jeu de société. Le signal board-game extrait des
 * annonces ("jeu de société", éditeur Gigamic) doit promouvoir `boardgames` et
 * pénaliser `games`.
 */
describe("scoreTypeCandidate — signal jeu de société", () => {
  const barcode = "3421272109517";

  // Un match jeu vidéo coïncident : plateforme détectée (+0.25) sur du bruit.
  const gamesResult = makeResult({
    platformKey: "switch",
    match: {
      evidence: makeEvidence({
        providers: ["PriceCharting", "PicClick"],
        canonicalProviders: [],
        canonicalCount: 0,
        marketplaceCount: 3,
        hasCover: true,
        confidence: 0.7,
      }),
    },
  });

  // Le jeu de société ancré par un retailer de confiance (Philibert).
  const boardgamesResult = makeResult({
    platformKey: null,
    match: {
      evidence: makeEvidence({
        providers: ["Philibert", "AchatMoinsCher"],
        trustedRetailerProviders: ["Philibert"],
        trustedRetailerCount: 1,
        marketplaceCount: 2,
        hasCover: true,
        confidence: 0.6,
      }),
    },
  });

  it("sans signal, le match jeu vidéo (avec plateforme) peut l'emporter", () => {
    const gamesScore = scoreTypeCandidate("games", gamesResult, barcode);
    const boardScore = scoreTypeCandidate(
      "boardgames",
      boardgamesResult,
      barcode,
    );
    expect(gamesScore).toBeGreaterThan(boardScore);
  });

  it("avec un signal board-game, le jeu de société l'emporte", () => {
    const gamesScore = scoreTypeCandidate("games", gamesResult, barcode, 1);
    const boardScore = scoreTypeCandidate(
      "boardgames",
      boardgamesResult,
      barcode,
      1,
    );
    expect(boardScore).toBeGreaterThan(gamesScore);
  });

  it("le signal pénalise `games` et promeut `boardgames`", () => {
    expect(scoreTypeCandidate("games", gamesResult, barcode, 1)).toBeLessThan(
      scoreTypeCandidate("games", gamesResult, barcode, 0),
    );
    expect(
      scoreTypeCandidate("boardgames", boardgamesResult, barcode, 1),
    ).toBeGreaterThan(
      scoreTypeCandidate("boardgames", boardgamesResult, barcode, 0),
    );
  });
});

/**
 * Régression "jeu vidéo classé en musique". Code-barres 3307210117168 = le jeu
 * "Tom Clancy's Ghost Recon". ScreenScraper le mappe à tort sur "Ghost Recon 2"
 * (déclassé), donc `games` repose sur le consensus marchand. Aucun vrai provider
 * musique ne matche : le fallback base de données fabrique pourtant un faux album
 * canonique ("Ghost Recon — Classics", conf 0.98) qui faisait gagner le type
 * `musics`. Le signal jeu-vidéo (plateforme console "Xbox" dans les annonces)
 * doit promouvoir `games` et écraser `musics`.
 */
describe("scoreTypeCandidate — signal jeu vidéo", () => {
  const barcode = "3307210117168";

  // Le jeu, canonique déclassé → consensus marchand (plateforme Xbox détectée).
  const gamesResult = makeResult({
    platformKey: "xbox",
    match: {
      evidence: makeEvidence({
        providers: ["PicClick", "ChasseAuxLivres"],
        canonicalProviders: [],
        canonicalCount: 0,
        trustedRetailerCount: 4,
        marketplaceCount: 4,
        hasCover: true,
        confidence: 0.77,
      }),
    },
  });

  // Faux album fabriqué par le seul fallback base de données.
  const musicsResult = makeResult({
    platformKey: null,
    match: {
      evidence: makeEvidence({
        providers: ["DatabaseResolver", "PicClick"],
        canonicalProviders: ["DatabaseResolver"],
        canonicalCount: 1,
        marketplaceCount: 1,
        hasCover: true,
        confidence: 0.98,
      }),
    },
  });

  it("sans signal, le faux album peut hijacker le type", () => {
    const gamesScore = scoreTypeCandidate("games", gamesResult, barcode);
    const musicsScore = scoreTypeCandidate("musics", musicsResult, barcode);
    expect(musicsScore).toBeGreaterThan(gamesScore);
  });

  it("avec un signal jeu vidéo, le jeu l'emporte sur le faux album", () => {
    const gamesScore = scoreTypeCandidate(
      "games",
      gamesResult,
      barcode,
      0,
      0,
      1,
    );
    const musicsScore = scoreTypeCandidate(
      "musics",
      musicsResult,
      barcode,
      0,
      0,
      1,
    );
    expect(gamesScore).toBeGreaterThan(musicsScore);
  });

  it("le signal promeut `games` et pénalise `musics`/`movies`", () => {
    expect(
      scoreTypeCandidate("games", gamesResult, barcode, 0, 0, 1),
    ).toBeGreaterThan(
      scoreTypeCandidate("games", gamesResult, barcode, 0, 0, 0),
    );
    expect(
      scoreTypeCandidate("musics", musicsResult, barcode, 0, 0, 1),
    ).toBeLessThan(
      scoreTypeCandidate("musics", musicsResult, barcode, 0, 0, 0),
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
