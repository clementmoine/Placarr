import { describe, expect, it } from "vitest";

import {
  normalizeHdjvUrl,
  parseHdjvFichePage,
  parseHdjvGalleryPage,
  parseHdjvSearchResults,
  pickBestHdjvSearchHit,
  upgradeHdjvImageUrl,
} from "./fetch";

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
    expect(disc.items[0]?.role).toBeUndefined();

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
