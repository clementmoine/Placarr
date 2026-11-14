import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("axios", () => ({ default: { get: vi.fn() } }));

const readHdjvSearchEvidence = vi.fn();
const promoteHdjvSearchEvidence = vi.fn();

vi.mock("./durableEvidence", () => ({
  readHdjvSearchEvidence: (...args: unknown[]) =>
    readHdjvSearchEvidence(...args),
  promoteHdjvSearchEvidence: (...args: unknown[]) =>
    promoteHdjvSearchEvidence(...args),
}));

import axios from "axios";

import {
  normalizeHdjvUrl,
  parseHdjvFichePage,
  parseHdjvGalleryPage,
  parseHdjvSearchResults,
  pickBestHdjvSearchHit,
  searchHdjv,
  upgradeHdjvImageUrl,
} from "./fetch";

const mockedGet = vi.mocked(axios.get);

beforeEach(() => {
  mockedGet.mockReset();
  readHdjvSearchEvidence.mockReset();
  promoteHdjvSearchEvidence.mockReset();
  readHdjvSearchEvidence.mockResolvedValue(null);
  promoteHdjvSearchEvidence.mockResolvedValue(undefined);
});

const SEARCH_FIXTURE = [
  {
    label: "Le Parrain 2 (Xbox 360)",
    value: "Le Parrain 2",
    support: "Xbox 360",
    url: "//www.HISTORIQUEDESJEUXVIDEO.COM/fiches/Xbox 360/le-parrain-2.html",
    code: "12852",
  },
  {
    label: "Le Parrain 2 (PS3)",
    value: "Le Parrain 2",
    support: "PS3",
    url: "//www.HISTORIQUEDESJEUXVIDEO.COM/fiches/PS3/le-parrain-2.html",
    code: "12860",
  },
];

const FICHE_FIXTURE = `
<title>Le Parrain 2 sur Xbox 360 Jeu Video</title>
<a href="//www.HISTORIQUEDESJEUXVIDEO.COM/galerie_jeu.php?page=0&code=12852">
<TR>
  <TD id="texte_a_propos_gauche">Support</TD>
  <TD id="texte_a_propos_droite"><a href="/jeux-Xbox 360.html">Xbox 360</a></TD>
</TR>
<TR>
  <TD id="texte_a_propos_gauche">Développeur</TD>
  <TD id="texte_a_propos_droite"><a href="/catalogue/developpeur/electronic-arts/21.html">Electronic Arts</a></TD>
</TR>
<TR>
  <TD id="texte_a_propos_gauche">Sortie officielle</TD>
  <TD id="texte_a_propos_droite"><a href="/catalogue/annee_parution/2009.html">Apr 2009</a></TD>
</TR>
<TR>
  <TD id="texte_a_propos_gauche">Joueurs max</TD>
  <TD id="texte_a_propos_droite">16</TD>
</TR>
<TR>
  <TD id="texte_a_propos_gauche">Titre alternatif</TD>
  <TD id="texte_a_propos_droite">Le Parrain II</TD>
</TR>
<TR>
  <TD id="texte_a_propos_gauche">UPC/EAN</TD>
  <TD id="texte_a_propos_droite">5030931066214</TD>
</TR>
`;

const GALLERY_PAGE_FIXTURE = `
<TR><td id="texte_galerie" align="center"><b>&nbsp 1</b> &nbsp <a href="galerie_jeu.php?page=1&code=12852">2</a></TD></TR>
<TR><TD id="texte_galerie" align="center">Recto de la pochette</TD></TR><TR><TD id="texte_galerie" align="center"><img border="1" src="//www.HISTORIQUEDESJEUXVIDEO.COM/bdd/jeu/img/XBox-360/1943.jpg"></TD></TR>
`;

const GALLERY_VERSO_FIXTURE = `
<TR><td id="texte_galerie" align="center"><a href="galerie_jeu.php?page=0&code=12852">1</a><b>&nbsp 2</b></TD></TR>
<TR><TD id="texte_galerie" align="center">Verso de la pochette</TD></TR><TR><TD id="texte_galerie" align="center"><img border="1" src="//www.HISTORIQUEDESJEUXVIDEO.COM/bdd/jeu/img/XBox-360/1944.jpg"></TD></TR>
`;

const GALLERY_DISC_FIXTURE = `
<TR><td id="texte_galerie" align="center"><a href="galerie_jeu.php?page=0&code=9299">1</a> <a href="galerie_jeu.php?page=1&code=9299">2</a><b>&nbsp 3</b></TD></TR>
<TR><TD id="texte_galerie" align="center">Media du jeu</TD></TR><TR><TD id="texte_galerie" align="center"><img border="1" src="//www.HISTORIQUEDESJEUXVIDEO.COM/bdd/jeu/img/XBox-360/1859.jpg"></TD></TR>
`;

const GALLERY_DISQUE_LABEL_FIXTURE = `
<TR><TD id="texte_galerie" align="center">Disque du jeu</TD></TR><TR><TD id="texte_galerie" align="center"><img border="1" src="//www.HISTORIQUEDESJEUXVIDEO.COM/bdd/jeu/img/XBox-360/1860.jpg"></TD></TR>
`;

describe("hdjv fetch", () => {
  it("parses ajax search results", () => {
    const hits = parseHdjvSearchResults(SEARCH_FIXTURE);
    expect(hits).toHaveLength(2);
    expect(hits[0]?.gameCode).toBe("12852");
    expect(hits[0]?.ficheUrl).toContain("le-parrain-2.html");
  });

  it("picks the platform-aligned search hit", () => {
    const hits = parseHdjvSearchResults(SEARCH_FIXTURE);
    const best = pickBestHdjvSearchHit(hits, ["Le Parrain 2"], "xbox360");
    expect(best?.gameCode).toBe("12852");
    expect(best?.support).toBe("Xbox 360");
  });

  it("parses fiche metadata and barcode", () => {
    const fiche = parseHdjvFichePage(
      FICHE_FIXTURE,
      "https://www.historiquedesjeuxvideo.com/fiches/Xbox%20360/le-parrain-2.html",
    );
    expect(fiche?.title).toBe("Le Parrain 2");
    expect(fiche?.gameCode).toBe("12852");
    expect(fiche?.platformLabel).toBe("Xbox 360");
    expect(fiche?.barcode).toBe("5030931066214");
    expect(fiche?.developer).toBe("Electronic Arts");
    expect(fiche?.releaseDate).toBe("Apr 2009");
    expect(fiche?.players).toBe("16");
    expect(fiche?.alternateTitle).toBe("Le Parrain II");
  });

  it("parses gallery pages with full-size image URLs", () => {
    const recto = parseHdjvGalleryPage(GALLERY_PAGE_FIXTURE);
    expect(recto.items).toHaveLength(1);
    expect(recto.items[0]?.label).toBe("Recto de la pochette");
    expect(recto.items[0]?.role).toBe("fr");
    expect(recto.items[0]?.url).toBe(
      "https://www.historiquedesjeuxvideo.com/bdd/jeu/img/XBox-360/1943.jpg",
    );
    expect(recto.pageCount).toBe(2);

    const verso = parseHdjvGalleryPage(GALLERY_VERSO_FIXTURE);
    expect(verso.items[0]?.role).toBe("back-fr");

    const disc = parseHdjvGalleryPage(GALLERY_DISC_FIXTURE);
    expect(disc.items).toHaveLength(1);
    expect(disc.items[0]?.label).toBe("Media du jeu");
    expect(disc.items[0]?.type).toBe("image");
    expect(disc.items[0]?.role).toBe("disc-fr");

    const disque = parseHdjvGalleryPage(GALLERY_DISQUE_LABEL_FIXTURE);
    expect(disque.items[0]?.role).toBe("disc-fr");
  });

  it("normalizes protocol-relative URLs and upgrades miniatures", () => {
    expect(
      normalizeHdjvUrl("//www.HISTORIQUEDESJEUXVIDEO.COM/fiches/PS3/game.html"),
    ).toBe("https://www.historiquedesjeuxvideo.com/fiches/PS3/game.html");
    expect(
      upgradeHdjvImageUrl(
        "//www.historiquedesjeuxvideo.com/bdd/jeu/img/XBox-360/miniature/1943.jpg",
      ),
    ).toBe(
      "https://www.historiquedesjeuxvideo.com/bdd/jeu/img/XBox-360/1943.jpg",
    );
  });
});

describe("searchHdjv", () => {
  it("réutilise ProviderEvidence SearchYield sans HTTP", async () => {
    const hits = [
      {
        label: "Le Parrain 2 (Xbox 360)",
        title: "Le Parrain 2",
        support: "Xbox 360",
        ficheUrl:
          "https://www.historiquedesjeuxvideo.com/fiches/Xbox%20360/le-parrain-2.html",
        gameCode: "12852",
      },
    ];
    readHdjvSearchEvidence.mockResolvedValueOnce(hits);

    await expect(searchHdjv("Le Parrain 2", "5")).resolves.toEqual(hits);
    expect(mockedGet).not.toHaveBeenCalled();
    expect(promoteHdjvSearchEvidence).not.toHaveBeenCalled();
  });

  it("promotes SearchYield after a live search GET", async () => {
    mockedGet.mockResolvedValueOnce({
      status: 200,
      data: SEARCH_FIXTURE,
    } as never);

    const hits = await searchHdjv("Le Parrain 2", "5");
    expect(hits).toHaveLength(2);
    expect(promoteHdjvSearchEvidence).toHaveBeenCalledWith(
      expect.stringMatching(/ajax_recherche_jeu\.php\?.*q=Le\+Parrain\+2/),
      expect.arrayContaining([
        expect.objectContaining({ gameCode: "12852", support: "Xbox 360" }),
      ]),
    );
    expect(promoteHdjvSearchEvidence.mock.calls[0]?.[0]).toContain("support=5");
  });
});
