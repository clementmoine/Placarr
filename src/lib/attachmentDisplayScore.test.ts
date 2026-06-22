import { describe, expect, it } from "vitest";

import { parseRegionFromRole } from "@/lib/localePreference";

import {
  explainAttachmentScoreForDisplay,
  pickBestCoverFromAttachments,
  rankAttachmentsForDisplay,
  rankCoversForDisplay,
} from "./attachmentDisplayScore";

describe("attachmentDisplayScore", () => {
  it("priorise les covers ScreenScraper, qui sont des scans de vraies boîtes", () => {
    const steamGridCover = {
      type: "cover" as const,
      source: "steamgriddb",
      role: "grid-vertical",
      url: "/uploads/steamgrid.png",
    };
    const screenScraperCover = {
      type: "cover" as const,
      source: "screenscraper",
      role: "uk",
      url: "/uploads/screenscraper.jpg",
    };
    const metrics = new Map([
      [steamGridCover.url, { width: 600, height: 900, format: "png" }],
      [screenScraperCover.url, { width: 486, height: 606, format: "jpg" }],
    ]);

    expect(
      rankAttachmentsForDisplay(
        [steamGridCover, screenScraperCover],
        metrics,
      )[0],
    ).toBe(screenScraperCover);
  });

  it("documente le bonus de source vraie boîte pour ScreenScraper", () => {
    const details = explainAttachmentScoreForDisplay({
      type: "cover",
      source: "screenscraper",
      url: "/uploads/cover.jpg",
    });

    expect(details.signals).toContain("+220 real box cover source");
  });

  it("ne penalise pas media= dans les URLs ScreenScraper", () => {
    const details = explainAttachmentScoreForDisplay({
      type: "cover",
      source: "screenscraper",
      role: "eu",
      url: "https://api.screenscraper.fr/api2/mediaJeu.php?systemeid=32&jeuid=14835&media=box-2D(eu)",
    });

    expect(details.signals.some((signal) => signal.includes("back/disc"))).toBe(
      false,
    );
  });

  it("priorise ScreenScraper EU sur TheGamesDB quand les deux sont disponibles", () => {
    const screenScraperCover = {
      type: "cover" as const,
      source: "screenscraper",
      role: "eu",
      url: "https://api.screenscraper.fr/api2/mediaJeu.php?systemeid=32&jeuid=14835&media=box-2D(eu)",
    };
    const theGamesDbCover = {
      type: "cover" as const,
      source: "thegamesdb",
      role: "wor",
      url: "https://cdn.thegamesdb.net/images/original/boxart/front/23520-1.jpg",
    };

    expect(
      pickBestCoverFromAttachments([theGamesDbCover, screenScraperCover]),
    ).toBe(screenScraperCover.url);
  });

  it("traite LaunchBox Europe au même niveau que ScreenScraper eu", () => {
    const launchboxCover = {
      type: "cover" as const,
      source: "launchbox",
      role: "europe",
      url: "https://images.launchbox-app.com/cover-eu.jpg",
    };
    const screenScraperCover = {
      type: "cover" as const,
      source: "screenscraper",
      role: "eu",
      url: "https://api.screenscraper.fr/api2/mediaJeu.php?systemeid=32&jeuid=14835&media=box-2D(eu)",
    };

    expect(parseRegionFromRole("europe")).toBe("eu");
    expect(
      explainAttachmentScoreForDisplay(launchboxCover).signals,
    ).toContain("+220 real box cover source");
    expect(
      pickBestCoverFromAttachments([launchboxCover, screenScraperCover]),
    ).toBeTruthy();
  });

  it("priorise une cover FR locale même si une cover EU a une meilleure résolution", () => {
    const metrics = new Map([
      ["/uploads/eu-hires.jpg", { width: 754, height: 1355, format: "jpeg" }],
      ["/uploads/fr-small.jpg", { width: 312, height: 822, format: "jpeg" }],
    ]);

    expect(
      pickBestCoverFromAttachments(
        [
          {
            type: "cover",
            source: "bgg",
            role: "eu",
            url: "/uploads/eu-hires.jpg",
          },
          {
            type: "cover",
            source: "bgg",
            role: "fr",
            url: "/uploads/fr-small.jpg",
          },
        ],
        metrics,
      ),
    ).toBe("/uploads/fr-small.jpg");
  });

  it("exclut un dos LaunchBox legacy (role europe + title Box - Back)", () => {
    expect(
      pickBestCoverFromAttachments([
        {
          type: "cover",
          source: "launchbox",
          role: "eu",
          title: "Box - Front",
          url: "https://images.launchbox-app.com/front-eu.jpg",
        },
        {
          type: "image",
          source: "launchbox",
          role: "europe",
          title: "Box - Back",
          url: "https://images.launchbox-app.com/back-eu.jpg",
        },
      ]),
    ).toBe("https://images.launchbox-app.com/front-eu.jpg");
  });

  it("ignore le disque ScreenScraper quand aucune jaquette boîte FR n'existe", () => {
    const metrics = new Map([
      ["/uploads/disc.jpg", { width: 1200, height: 1200, format: "jpeg" }],
      ["/uploads/box-eu.jpg", { width: 754, height: 1355, format: "jpeg" }],
    ]);

    expect(
      pickBestCoverFromAttachments(
        [
          {
            type: "image",
            source: "screenscraper",
            role: "disc-fr",
            url: "/uploads/disc.jpg",
          },
          {
            type: "cover",
            source: "screenscraper",
            role: "eu",
            url: "/uploads/box-eu.jpg",
          },
        ],
        metrics,
      ),
    ).toBe("/uploads/box-eu.jpg");
  });

  it("priorise une cover 2D Europe sur une cover 3D France", () => {
    const eu2dCover = {
      type: "cover" as const,
      source: "screenscraper",
      role: "eu",
      url: "/uploads/eu-2d.jpg",
    };
    const fr3dCover = {
      type: "cover" as const,
      source: "screenscraper",
      role: "3d-fr",
      url: "/uploads/fr-3d.jpg",
    };

    expect(
      pickBestCoverFromAttachments([eu2dCover, fr3dCover]),
    ).toBe(eu2dCover.url);
  });

  it("priorise une cover 3D France ou une cover 2D classique sur une jaquette complète (full wrap) CoverProject", () => {
    const coverProjectCover = {
      type: "cover" as const,
      source: "coverproject",
      role: "eu",
      url: "/uploads/coverproject.jpg",
    };
    const fr3dCover = {
      type: "cover" as const,
      source: "screenscraper",
      role: "3d-fr",
      url: "/uploads/fr-3d.jpg",
    };
    const us2dCover = {
      type: "cover" as const,
      source: "thegamesdb",
      role: "us",
      url: "/uploads/us-2d.jpg",
    };

    // La cover 3D France (localeRank: 0 + 2 = 2) doit battre la cover complète de CoverProject (localeRank: 1)
    // car CoverProject est pénalisé par son format double cover
    expect(
      pickBestCoverFromAttachments([coverProjectCover, fr3dCover]),
    ).toBe(fr3dCover.url);

    // Une cover 2D classique USA (localeRank: 2) doit également battre la jaquette complète de CoverProject (localeRank: 1)
    expect(
      pickBestCoverFromAttachments([coverProjectCover, us2dCover]),
    ).toBe(us2dCover.url);
  });

  it("fusionne les métadonnées (comme le rôle) en cas de doublons d'URL", () => {
    const withRole = {
      type: "cover" as const,
      source: "launchbox",
      role: "us",
      url: "/uploads/duplicate.jpg",
    };
    const withoutRole = {
      type: "cover" as const,
      source: "launchbox",
      url: "/uploads/duplicate.jpg",
      role: undefined as string | undefined,
    };

    const ranked = rankAttachmentsForDisplay([withRole, withoutRole]);
    expect(ranked).toHaveLength(1);
    expect(ranked[0].role).toBe("us");
  });

  it("priorise une cover 2D USA sur une cover 3D France", () => {
    const us2dCover = {
      type: "cover" as const,
      source: "screenscraper",
      role: "us",
      url: "/uploads/us-2d.jpg",
    };
    const fr3dCover = {
      type: "cover" as const,
      source: "screenscraper",
      role: "3d-fr",
      url: "/uploads/fr-3d.jpg",
    };

    expect(
      pickBestCoverFromAttachments([us2dCover, fr3dCover]),
    ).toBe(us2dCover.url);
  });

  it("sorts back covers (and other non-front covers) at the very bottom, even with preferred regions", () => {
    const usBackCover = {
      type: "cover" as const,
      source: "thegamesdb",
      role: "back-us",
      url: "/uploads/us-back.jpg",
    };
    const jpFrontCover = {
      type: "cover" as const,
      source: "screenscraper",
      role: "jp",
      url: "/uploads/jp-front.jpg",
    };
    const fr3dFrontCover = {
      type: "cover" as const,
      source: "screenscraper",
      role: "3d-fr",
      url: "/uploads/fr-3d.jpg",
    };
    const fr2dFrontCover = {
      type: "cover" as const,
      source: "screenscraper",
      role: "fr",
      url: "/uploads/fr-2d.jpg",
    };

    const ranked = rankCoversForDisplay([
      usBackCover,
      jpFrontCover,
      fr3dFrontCover,
      fr2dFrontCover,
    ]);

    // Expected order:
    // 1. fr2dFrontCover (typeRank = 0, regionRankValue = 0)
    // 2. jpFrontCover (typeRank = 0, regionRankValue = 6)
    // 3. fr3dFrontCover (typeRank = 1, regionRankValue = 0)
    // 4. usBackCover (typeRank = 3, regionRankValue = 5)
    expect(ranked[0]).toBe(fr2dFrontCover);
    expect(ranked[1]).toBe(jpFrontCover);
    expect(ranked[2]).toBe(fr3dFrontCover);
    expect(ranked[3]).toBe(usBackCover);
  });

  it("favorise une image identique partagée par plusieurs sources (consensus)", () => {
    const shared = (source: string) => ({
      type: "screenshot" as const,
      source,
      url: "/shots/same.jpg",
    });
    const solo = {
      type: "screenshot" as const,
      source: "steam",
      url: "/shots/solo.jpg",
    };

    // `solo` est en tête de liste (index 0) : sans consensus il gagnerait le
    // départage à score égal. Les 3 sources distinctes le font passer derrière.
    const ranked = rankAttachmentsForDisplay([
      solo,
      shared("igdb"),
      shared("rawg"),
      shared("screenscraper"),
    ]);

    expect(ranked).toHaveLength(2); // l'image partagée est dédupliquée
    expect(ranked[0].url).toBe("/shots/same.jpg");
  });

  it("ne compte pas deux fois la même source dans le consensus", () => {
    const ranked = rankAttachmentsForDisplay([
      { type: "screenshot" as const, source: "rawg", url: "/shots/b.jpg" },
      { type: "screenshot" as const, source: "igdb", url: "/shots/a.jpg" },
      { type: "screenshot" as const, source: "igdb", url: "/shots/a.jpg" },
      { type: "screenshot" as const, source: "igdb", url: "/shots/a.jpg" },
    ]);

    // a.jpg vient 3x de la même source => 1 source distincte => aucun bonus,
    // donc b.jpg (index 0) reste devant à score égal.
    expect(ranked[0].url).toBe("/shots/b.jpg");
  });

  it("départage des covers comparables par consensus multi-sources", () => {
    const shared = (source: string) => ({
      type: "cover" as const,
      source,
      role: "eu",
      url: "/c/shared.jpg",
    });
    const solo = {
      type: "cover" as const,
      source: "launchbox",
      role: "eu",
      url: "/c/solo.jpg",
    };

    // Même type (2D front) et même région => seul le consensus les départage.
    const ranked = rankCoversForDisplay([
      solo,
      shared("screenscraper"),
      shared("thegamesdb"),
    ]);

    expect(ranked[0].url).toBe("/c/shared.jpg");
  });
});

