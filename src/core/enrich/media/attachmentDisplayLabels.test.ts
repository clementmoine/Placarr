import { describe, expect, it } from "vitest";

import { getAttachmentGalleryLabels } from "./attachmentDisplayLabels";

describe("attachmentDisplayLabels", () => {
  it("normalise ScreenScraper back/eu (chip = registry label propagée)", () => {
    expect(
      getAttachmentGalleryLabels({
        type: "image",
        role: "back-eu",
        source: "screenscraper",
        providerLabel: "ScreenScraper",
      }),
    ).toMatchObject({
      provider: "ScreenScraper",
      kind: "Dos",
      region: "Europe",
      detail: "Dos · Europe",
    });
  });

  it("affiche Face + langue pour les rôles TCG standardisés (pas le seau région)", () => {
    expect(
      getAttachmentGalleryLabels({
        type: "cover",
        role: "lorcana-face-de-art",
        source: "lorcanajson",
        providerLabel: "LorcanaJSON",
      }),
    ).toMatchObject({
      kind: "Face",
      region: "Allemand",
      detail: "Face · Allemand",
    });
    expect(
      getAttachmentGalleryLabels({
        type: "cover",
        role: "pokemon-face-en-live",
        source: "tcgdex",
        providerLabel: "TCGdex",
      }),
    ).toMatchObject({
      kind: "Face",
      region: "Anglais",
      detail: "Face · Anglais · Live",
    });
    expect(
      getAttachmentGalleryLabels({
        type: "cover",
        role: "naruto-face-fr-carddass",
        source: "narutocarddass",
        providerLabel: "Naruto Carddass",
      }),
    ).toMatchObject({
      kind: "Face",
      region: "Français",
      detail: "Face · Français · Carddass",
    });
  });

  it("garde la langue d'un role ISO nu (legacy Lorcana) hors du seau région Europe", () => {
    // Older Lorcana rows used bare ISO as role (`de` / `en` / `it`). The region
    // alias map folds `de`→Europe for German *game boxes*; on a card printing
    // that would hide the actual language.
    expect(
      getAttachmentGalleryLabels({
        type: "cover",
        role: "de",
        source: "lorcanajson",
        providerLabel: "LorcanaJSON",
      }),
    ).toMatchObject({
      kind: "Jaquette",
      region: "Allemand",
      detail: "Jaquette · Allemand",
    });
    expect(
      getAttachmentGalleryLabels({
        type: "cover",
        role: "en",
        source: "lorcanajson",
        providerLabel: "LorcanaJSON",
      }),
    ).toMatchObject({
      region: "Anglais",
      detail: "Jaquette · Anglais",
    });
  });

  it("garde les rôles région composés (back-eu) hors des labels langue", () => {
    expect(
      getAttachmentGalleryLabels({
        type: "image",
        role: "back-eu",
        source: "screenscraper",
        providerLabel: "ScreenScraper",
      }),
    ).toMatchObject({
      kind: "Dos",
      region: "Europe",
      detail: "Dos · Europe",
    });
  });

  it("affiche langue + rôle flyer / face TCG (Mythos)", () => {
    expect(
      getAttachmentGalleryLabels({
        type: "cover",
        role: "mythos-proof-flyer-fr",
        title: "Annonce promo Mythos (flyer FR)",
        source: "narutomythos",
        providerLabel: "Naruto Mythos",
      }),
    ).toMatchObject({
      kind: "Flyer",
      region: "Français",
      detail: "Flyer · Français",
    });
    expect(
      getAttachmentGalleryLabels({
        type: "cover",
        role: "mythos-face-en-promo",
        source: "narutomythos",
        providerLabel: "Naruto Mythos",
      }),
    ).toMatchObject({
      kind: "Face",
      region: "Anglais",
      detail: "Face · Anglais · Promo",
    });
    expect(
      getAttachmentGalleryLabels({
        type: "cover",
        url: "/assets/naruto/mythos/prints/ks1promo-0133-vv2-fr/face",
        source: "narutomythos",
        providerLabel: "Naruto Mythos",
      }),
    ).toMatchObject({
      kind: "Face",
      region: "Français",
      detail: "Face · Français",
    });
  });

  it("lit la langue FR depuis les chemins /cards/ Ninja Ranks (set/lang et lang/set)", () => {
    expect(
      getAttachmentGalleryLabels({
        type: "cover",
        url: "/assets/naruto/ninja-ranks/cards/ff/fr/0006/art.animecollection.jpg",
        source: "narutoranks",
        providerLabel: "Naruto Ninja Ranks",
      }),
    ).toMatchObject({
      kind: "Face",
      region: "Français",
      detail: "Face · Français",
    });
    expect(
      getAttachmentGalleryLabels({
        type: "cover",
        url: "/assets/naruto/ninja-ranks/cards/fr/nr/0001/art.coleka.webp",
        source: "narutoranks",
        providerLabel: "Naruto Ninja Ranks",
      }),
    ).toMatchObject({
      kind: "Face",
      region: "Français",
      detail: "Face · Français",
    });
  });

  it("TCG disk faces stay Face even when typed cover (all packs)", () => {
    const cases: Array<{
      url: string;
      role?: string;
      detail: string;
    }> = [
      {
        url: "https://localhost:3000/assets/naruto/ninja-ranks/cards/ff/fr/0006/art.animecollection.jpg",
        detail: "Face · Français",
      },
      {
        url: "/assets/pokemon/cards/fr/sv3-5/006/art.webp",
        detail: "Face · Français",
      },
      {
        url: "/assets/dragonball/jcc/cards/fr/part1/d0050/art.dbzcollection.jpg",
        detail: "Face · Français",
      },
      {
        url: "/assets/lorcana/prints/1-1-fr/face",
        detail: "Face · Français",
      },
      {
        url: "/assets/naruto/carddass/prints/s5-ni0229-fr/face",
        role: "naruto-face-fr-carddass",
        detail: "Face · Français · Carddass",
      },
    ];
    for (const row of cases) {
      expect(
        getAttachmentGalleryLabels({
          type: "cover",
          title: "Itachi - Sasuke",
          url: row.url,
          role: row.role,
          source: "local",
        }),
      ).toMatchObject({
        kind: "Face",
        detail: row.detail,
      });
    }
  });

  it("keeps ScreenScraper box titles as Jaquette when URL is not a TCG face", () => {
    expect(
      getAttachmentGalleryLabels({
        type: "cover",
        role: "eu",
        title: "Box - Front",
        url: "https://www.screenscraper.fr/image.php?gameid=1",
        source: "screenscraper",
      }),
    ).toMatchObject({
      kind: "Jaquette",
      detail: "Jaquette · Europe",
    });
  });

  it("affiche la région d'une jaquette ScreenScraper australienne (au → Europe)", () => {
    // Regression: a `box-2D(au)` cover was stored with role "au" and showed
    // "Jaquette" with no region because the resolver only knew the 6 canonical
    // codes. Australia is a PAL territory → Europe bucket.
    expect(
      getAttachmentGalleryLabels({
        type: "cover",
        role: "au",
        source: "screenscraper",
        providerLabel: "ScreenScraper",
      }),
    ).toMatchObject({
      provider: "ScreenScraper",
      kind: "Jaquette",
      region: "Europe",
      detail: "Jaquette · Europe",
    });
  });

  it("résout les régions ISO ScreenScraper sur les rôles composés", () => {
    expect(
      getAttachmentGalleryLabels({
        type: "image",
        role: "back-sp",
        source: "screenscraper",
        providerLabel: "ScreenScraper",
      }),
    ).toMatchObject({ kind: "Dos", region: "Europe", detail: "Dos · Europe" });

    expect(
      getAttachmentGalleryLabels({
        type: "cover",
        role: "3d-au",
        source: "screenscraper",
        providerLabel: "ScreenScraper",
      }),
    ).toMatchObject({
      kind: "Jaquette 3D",
      region: "Europe",
      detail: "Jaquette 3D · Europe",
    });

    expect(
      getAttachmentGalleryLabels({
        type: "image",
        role: "disc-br",
        source: "screenscraper",
        providerLabel: "ScreenScraper",
      }),
    ).toMatchObject({
      kind: "Disque",
      region: "États-Unis",
      detail: "Disque · États-Unis",
    });
  });

  it("normalise HDJV Media du jeu en disque", () => {
    expect(
      getAttachmentGalleryLabels({
        type: "image",
        title: "Media du jeu",
        source: "hdjv",
        providerLabel: "HDJV",
      }),
    ).toMatchObject({
      provider: "HDJV",
      kind: "Disque",
      region: null,
      detail: "Disque",
    });
  });

  it("normalise HDJV Media du jeu avec role disc-fr", () => {
    expect(
      getAttachmentGalleryLabels({
        type: "image",
        role: "disc-fr",
        title: "Media du jeu",
        source: "hdjv",
        providerLabel: "HDJV",
      }),
    ).toMatchObject({
      provider: "HDJV",
      kind: "Disque",
      region: "France",
      detail: "Disque · France",
    });
  });

  it("normalise LaunchBox Europe cover", () => {
    expect(
      getAttachmentGalleryLabels({
        type: "cover",
        role: "europe",
        title: "Box - Front",
        source: "launchbox",
        providerLabel: "LaunchBox",
      }),
    ).toMatchObject({
      provider: "LaunchBox",
      kind: "Jaquette",
      region: "Europe",
      detail: "Jaquette · Europe",
    });
  });

  it("normalise LaunchBox back from title when role is legacy", () => {
    expect(
      getAttachmentGalleryLabels({
        type: "image",
        role: "europe",
        title: "Box - Back",
        source: "launchbox",
        providerLabel: "LaunchBox",
      }),
    ).toMatchObject({
      kind: "Dos",
      region: "Europe",
      detail: "Dos · Europe",
    });
  });

  it("normalise TheGamesDB cover region", () => {
    expect(
      getAttachmentGalleryLabels({
        type: "cover",
        role: "eu",
        source: "thegamesdb",
        providerLabel: "TheGamesDB",
      }),
    ).toMatchObject({
      provider: "TheGamesDB",
      detail: "Jaquette · Europe",
    });
  });

  it("normalise PriceCharting back cover from title", () => {
    expect(
      getAttachmentGalleryLabels({
        type: "cover",
        role: "back-eu",
        title: "Back Cover (PAL)",
        source: "pricecharting",
        providerLabel: "PriceCharting",
      }),
    ).toMatchObject({
      provider: "PriceCharting",
      kind: "Dos",
      region: "Europe",
      detail: "Dos · Europe",
    });
    expect(
      getAttachmentGalleryLabels({
        type: "cover",
        role: "eu",
        title: "Cover (Back) [GER]",
        source: "pricecharting",
        providerLabel: "PriceCharting",
      }),
    ).toMatchObject({
      kind: "Dos",
      detail: "Dos · Europe",
    });
  });

  it("normalise PriceCharting spine from title", () => {
    expect(
      getAttachmentGalleryLabels({
        type: "cover",
        role: "eu",
        title: "Spine/Sides",
        source: "pricecharting",
        providerLabel: "PriceCharting",
      }),
    ).toMatchObject({
      provider: "PriceCharting",
      kind: "Tranche",
      region: "Europe",
      detail: "Tranche · Europe",
    });
  });

  it("normalise iCollect back cover from Main Image 2", () => {
    expect(
      getAttachmentGalleryLabels({
        type: "cover",
        role: "back-us",
        title: "Devil May Cry - Main Image 2",
        source: "icollect",
        providerLabel: "iCollect Everything",
      }),
    ).toMatchObject({
      provider: "iCollect Everything",
      kind: "Dos",
      region: "États-Unis",
      detail: "Dos · États-Unis",
    });
  });

  it("supports english labels", () => {
    expect(
      getAttachmentGalleryLabels(
        {
          type: "cover",
          role: "us",
          source: "igdb",
          providerLabel: "IGDB",
        },
        "en",
      ),
    ).toMatchObject({
      provider: "IGDB",
      detail: "Cover · United States",
    });
  });

  it("garde les libellés des tags synthétiques (barcode → Scan)", () => {
    expect(
      getAttachmentGalleryLabels({ type: "image", source: "barcode" }),
    ).toMatchObject({ provider: "Scan" });
  });

  it("title-case une source provider inconnue sans label propagé", () => {
    expect(
      getAttachmentGalleryLabels({ type: "cover", source: "screenscraper" }),
    ).toMatchObject({ provider: "Screenscraper" });
  });

  it("affiche les grilles SteamGridDB avec leur style", () => {
    expect(
      getAttachmentGalleryLabels({
        type: "cover",
        role: "grid-vertical",
        title: "SteamGridDB - alternate",
        source: "steamgriddb",
        providerLabel: "SteamGridDB",
        gridStyleCoverLabelsSource: true,
      }),
    ).toMatchObject({
      kind: "Grille",
      detail: "Grille · Alternate",
    });
  });

  it("affiche les grilles 3D SteamGridDB material", () => {
    expect(
      getAttachmentGalleryLabels({
        type: "cover",
        role: "3d-grid-vertical",
        title: "SteamGridDB - material",
        source: "steamgriddb",
        providerLabel: "SteamGridDB",
        gridStyleCoverLabelsSource: true,
      }),
    ).toMatchObject({
      kind: "Grille 3D",
      detail: "Grille 3D · Material",
    });
  });

  it("n'affiche pas Fusion pour une source merged orpheline", () => {
    expect(
      getAttachmentGalleryLabels({
        type: "cover",
        source: "merged",
      }),
    ).toMatchObject({
      provider: null,
      sourceNames: [],
      kind: "Jaquette",
    });
  });

  it("liste tous les contributeurs quand sourceNames est fourni", () => {
    expect(
      getAttachmentGalleryLabels({
        type: "cover",
        source: "screenscraper",
        providerLabel: "ScreenScraper",
        sourceNames: ["screenscraper", "launchbox"],
      }).sourceNames,
    ).toEqual(["ScreenScraper", "Launchbox"]);
  });

  it("n'affiche pas Perso quand un vrai provider partage le même fichier", () => {
    expect(
      getAttachmentGalleryLabels({
        type: "cover",
        source: "booknode",
        providerLabel: "Booknode",
        sourceNames: ["Perso", "Booknode"],
      }),
    ).toMatchObject({
      provider: "Booknode",
      sourceNames: ["Booknode"],
      kind: "Jaquette",
    });
  });
});
