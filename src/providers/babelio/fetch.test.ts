import axios from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("axios", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

const readBabelioSearchEvidence = vi.fn();
const promoteBabelioSearchEvidence = vi.fn();

vi.mock("./durableEvidence", () => ({
  babelioSearchEvidenceUrl: (term: string) => {
    const url = new URL("https://www.babelio.com/recherche.php");
    url.searchParams.set("term", term.trim());
    return url.toString();
  },
  readBabelioSearchEvidence: (...args: unknown[]) =>
    readBabelioSearchEvidence(...args),
  promoteBabelioSearchEvidence: (...args: unknown[]) =>
    promoteBabelioSearchEvidence(...args),
}));

vi.mock("@/lib/http/flareSolverr", () => ({
  flareSolverrRequestGet: vi.fn().mockResolvedValue(null),
}));

import {
  normalizeBabelioCoverUrl,
  parseBabelioAjaxHits,
  parseBabelioBookPage,
  parseBabelioHtmlSearchHits,
  resolveBabelioMetadata,
  searchBabelioHits,
} from "./fetch";
import { mapBabelioMetadata } from "./index";

const mockedPost = vi.mocked(axios.post);
const mockedGet = vi.mocked(axios.get);

const BOOK_URL =
  "https://www.babelio.com/livres/Toriyama-Dragon-Ball-Z-Cycle-1-tome-2/53653";

function bookHtml() {
  return `<!DOCTYPE html>
<html>
<head>
  <meta property="og:title" content="Dragon Ball Z - Cycle 1, tome 2 - Akira Toriyama - Babelio" />
  <meta property="og:image" content="http://ecx.images-amazon.com/images/I/519kTSXan6L._SX195_.jpg" />
  <meta property="og:description" content="Critiques de Dragon Ball Z - Cycle 1, tome 2" />
</head>
<body>
  <span itemprop="author" itemscope itemtype="https://schema.org/Person">
    <a href="/auteur/Akira-Toriyama/9033" itemprop="url" class="livre_auteurs">
      <span itemprop="name">Akira <b>Toriyama</b></span>
    </a>
  </span>
  <a href="/serie/Dragon-Ball-Z-Cycle-1/3098"><b>Dragon Ball Z - Cycle 1</b></a> tome 2 sur 5
  <br>
  <div class="livre_refs grey_light">
    9782723457903 <br />
    176 pages <br />
    21/05/2008 <br>
    <a href="/editeur/830/Glenat" class="tiny_links dark">Glénat</a>
  </div>
  <div itemprop="description" class="livre_resume">
    Goku a perdu la vie au cours de son combat contre Raditz.
    <span style="color:#FF9D38;"><a href="javascript:void(0);" onclick="voir_plus_a('#d_bio',1,1);">Voir plus</a></span>
  </div>
  Âge de lecture : <b><a href="/livres/">à partir de 12 ans</a></b>
  <p class="tags">
    <a rel="tag" class="tag_t21" href="/livres-/aventure/33"> aventure  </a>
    <a rel="tag" class="tag_t27" href="/livres-/manga/12"> manga  </a>
    <a rel="tag" class="tag_t19" href="/livres-/shonen/8715"> shonen  </a>
  </p>
  <div itemprop="aggregateRating" itemscope itemtype="https://schema.org/AggregateRating">
    <span itemprop="ratingValue">3,72</span>
    <span itemprop="bestRating">5</span>
    <span>21</span> notes
    <meta itemprop="reviewCount" content="2" />
    <span class="item" style="display:none"><span itemprop="ratingCount">21</span></span>
  </div>
  <div class="livre_con">
    <img src="/couv/cvt_Dragon-Ball-Z-Cycle-1-tome-2_8015.jpg" />
  </div>
</body>
</html>`;
}

function ajaxHits() {
  return [
    {
      type: "series",
      id: "3098",
      nom: "Dragon Ball Z - Cycle 1",
      url: "/serie/Dragon-Ball-Z-Cycle-1/3098",
    },
    {
      type: "livres",
      id: "53653",
      id_oeuvre: "53653",
      titre: "Dragon Ball Z - Cycle 1, tome 2",
      prenoms: "Akira",
      nom: "Toriyama",
      couverture: "http://ecx.images-amazon.com/images/I/519kTSXan6L._SX95_.jpg",
      url: "/livres/Toriyama-Dragon-Ball-Z-Cycle-1-tome-2/53653",
      ca_copies: 114,
      ca_note: "3.72",
    },
    {
      type: "livres",
      id: "999",
      id_oeuvre: "999",
      titre: "Dragon Ball, tome 2",
      prenoms: "Akira",
      nom: "Toriyama",
      url: "/livres/Toriyama-Dragon-Ball-tome-2/999",
      ca_copies: 50,
    },
  ];
}

function htmlSearchPage() {
  return `
<div class="cr_cartes">
  <a href="/livres/Toriyama-Dragon-Ball-Z-Cycle-1-tome-2/53653" class="titre1">Dragon Ball Z - Cycle 1, tome 2</a>
  <a href="/livres/Toriyama-Dragon-Ball-tome-2/999" class="titre1">Dragon Ball, tome 2</a>
</div>`;
}

function mockSearchPosts() {
  mockedPost.mockImplementation(async (url: string) => {
    if (String(url).includes("aj_recherche")) {
      return { status: 200, data: ajaxHits() };
    }
    return {
      status: 200,
      data: Buffer.from(htmlSearchPage(), "latin1"),
    };
  });
}

describe("babelio fetch", () => {
  beforeEach(() => {
    mockedPost.mockReset();
    mockedGet.mockReset();
    readBabelioSearchEvidence.mockReset();
    promoteBabelioSearchEvidence.mockReset();
    readBabelioSearchEvidence.mockResolvedValue(null);
    promoteBabelioSearchEvidence.mockResolvedValue(undefined);
  });

  it("normalise les miniatures Amazon en HTTPS plus large", () => {
    expect(
      normalizeBabelioCoverUrl(
        "http://ecx.images-amazon.com/images/I/519kTSXan6L._SX95_.jpg",
      ),
    ).toBe(
      "https://ecx.images-amazon.com/images/I/519kTSXan6L._SX500_.jpg",
    );
    expect(normalizeBabelioCoverUrl("/couv/cvt_foo.jpg")).toBe(
      "https://www.babelio.com/couv/cvt_foo.jpg",
    );
  });

  it("parse les hits AJAX livres (ignore les séries)", () => {
    const hits = parseBabelioAjaxHits(ajaxHits());
    expect(hits).toHaveLength(2);
    expect(hits[0]).toMatchObject({
      id: "53653",
      title: "Dragon Ball Z - Cycle 1, tome 2",
      authors: ["Akira Toriyama"],
      copies: 114,
      ratingValue: 3.72,
    });
    expect(hits[0].url).toContain(
      "/livres/Toriyama-Dragon-Ball-Z-Cycle-1-tome-2/53653",
    );
  });

  it("parse les hits HTML recherche", () => {
    const hits = parseBabelioHtmlSearchHits(htmlSearchPage());
    expect(hits.map((hit) => hit.id)).toEqual(["53653", "999"]);
  });

  it("parse la fiche microdata (note /5, tags, ISBN evidence, série)", () => {
    const book = parseBabelioBookPage(bookHtml(), BOOK_URL);
    expect(book).toMatchObject({
      id: "53653",
      title: "Dragon Ball Z - Cycle 1, tome 2",
      authors: ["Akira Toriyama"],
      publisher: "Glénat",
      seriesName: "Dragon Ball Z - Cycle 1",
      seriesPosition: 2,
      barcode: "9782723457903",
      pageCount: 176,
      releaseDate: "2008-05-21",
      readingAge: "à partir de 12 ans",
      ratingValue: 3.72,
      ratingCount: 21,
      reviewCount: 2,
    });
    expect(book?.tags).toEqual(["aventure", "manga", "shonen"]);
    expect(book?.description).toContain("Raditz");
    expect(book?.imageUrl).toContain("babelio.com/couv/");
  });

  it("mappe rating / tags sans promouvoir l'ISBN en barcode résultat", () => {
    const metadata = mapBabelioMetadata(
      parseBabelioBookPage(bookHtml(), BOOK_URL),
    );
    expect(metadata?.title).toBe("Dragon Ball Z - Cycle 1, tome 2");
    expect(metadata?.barcode).toBeUndefined();
    expect(metadata?.externalIds).toEqual({ babelio: "53653" });
    expect(metadata?.facts?.find((f) => f.kind === "rating")?.value).toBe(
      "3,72/5 (21 notes)",
    );
    expect(
      metadata?.facts?.filter((f) => f.kind === "tag").map((f) => f.value),
    ).toEqual(
      expect.arrayContaining([
        "aventure",
        "manga",
        "shonen",
        "à partir de 12 ans",
      ]),
    );
    expect(
      metadata?.facts?.find((f) => f.kind === "identifier")?.value,
    ).toBe("9782723457903");
  });

  it("rejette la série classique quand Dragon Ball Z est demandé", async () => {
    mockSearchPosts();
    mockedGet.mockResolvedValue({
      status: 200,
      data: Buffer.from(bookHtml(), "latin1"),
      headers: { "content-type": "text/html; charset=ISO-8859-1" },
      request: { res: { responseUrl: BOOK_URL } },
    });

    const book = await resolveBabelioMetadata({
      name: "Dragon Ball Z - Tome 2",
    });
    expect(book?.title).toBe("Dragon Ball Z - Cycle 1, tome 2");

    const classicOnly = await resolveBabelioMetadata({
      name: "Dragon Ball - Tome 2",
    });
    expect(classicOnly).toBeNull();
  });

  it("n'accepte pas un ISBN Babelio sans titre aligné", async () => {
    mockSearchPosts();
    mockedGet.mockResolvedValue({
      status: 200,
      data: Buffer.from(bookHtml(), "latin1"),
    });

    await expect(
      resolveBabelioMetadata({ barcode: "9782723457903" }),
    ).resolves.toBeNull();

    const aligned = await resolveBabelioMetadata({
      name: "Dragon Ball Z - Cycle 1, tome 2",
      barcode: "9782723457903",
    });
    expect(aligned?.title).toBe("Dragon Ball Z - Cycle 1, tome 2");
  });

  it("aligne un titre d'album sans tome sur le sous-titre Babelio", async () => {
    const asterixHtml = `<!DOCTYPE html>
<html><head>
  <meta property="og:title" content="Astérix, tome 6 : Astérix et Cléopâtre - René Goscinny - Babelio" />
</head><body>
  <span itemprop="author"><span itemprop="name">René Goscinny</span></span>
  <div itemprop="description" class="livre_resume">Résumé Astérix.</div>
  <div itemprop="aggregateRating"><span itemprop="ratingValue">4,28</span>
  <span itemprop="ratingCount">100</span></div>
</body></html>`;

    mockedPost.mockImplementation(async (url: string) => {
      if (String(url).includes("aj_recherche")) {
        return {
          status: 200,
          data: [
            {
              type: "livres",
              id: "17541",
              id_oeuvre: "17541",
              titre: "Astérix, tome 6 : Astérix et Cléopâtre",
              url: "/livres/Goscinny-Asterix-tome-6--Asterix-et-Cleopatre/17541",
            },
            {
              type: "livres",
              id: "1847624",
              id_oeuvre: "1847624",
              titre: "Astérix et Cléopâtre - La Boîte des Irréductibles",
              url: "/livres/Goscinny-Asterix-et-Cleopatre-La-Boite/1847624",
            },
          ],
        };
      }
      return {
        status: 200,
        data: Buffer.from(
          `<a href="/livres/Goscinny-Asterix-tome-6--Asterix-et-Cleopatre/17541" class="titre1">Astérix, tome 6 : Astérix et Cléopâtre</a>
           <a href="/livres/Goscinny-Asterix-et-Cleopatre-La-Boite/1847624" class="titre1">Astérix et Cléopâtre - La Boîte des Irréductibles</a>`,
          "latin1",
        ),
      };
    });
    mockedGet.mockResolvedValue({
      status: 200,
      data: Buffer.from(asterixHtml, "latin1"),
    });

    const book = await resolveBabelioMetadata({
      name: "Astérix et Cléopâtre",
    });
    expect(book?.title).toBe("Astérix, tome 6 : Astérix et Cléopâtre");
  });

  it("refuse un tome Wakfu au mauvais sous-titre", async () => {
    const wrongHtml = `<!DOCTYPE html>
<html><head>
  <meta property="og:title" content="Wakfu, tome 3 : Shak Shaka - Babelio" />
</head><body>
  <div itemprop="description" class="livre_resume">Mauvais tome.</div>
</body></html>`;
    const rightHtml = `<!DOCTYPE html>
<html><head>
  <meta property="og:title" content="Wakfu, tome 3 : Les mines de Lamororia - Babelio" />
</head><body>
  <div itemprop="description" class="livre_resume">Bon tome.</div>
</body></html>`;

    mockedPost.mockImplementation(async (url: string) => {
      if (String(url).includes("aj_recherche")) {
        return {
          status: 200,
          data: [
            {
              type: "livres",
              id: "1",
              titre: "Wakfu, tome 3 : Shak Shaka",
              url: "/livres/Wakfu-tome-3-Shak-Shaka/1",
            },
            {
              type: "livres",
              id: "2",
              titre: "Wakfu, tome 3 : Les mines de Lamororia",
              url: "/livres/Wakfu-tome-3-Les-mines-de-Lamororia/2",
            },
          ],
        };
      }
      return {
        status: 200,
        data: Buffer.from(
          `<a href="/livres/Wakfu-tome-3-Shak-Shaka/1" class="titre1">Wakfu, tome 3 : Shak Shaka</a>
           <a href="/livres/Wakfu-tome-3-Les-mines-de-Lamororia/2" class="titre1">Wakfu, tome 3 : Les mines de Lamororia</a>`,
          "latin1",
        ),
      };
    });
    mockedGet.mockImplementation(async (url: string) => {
      const html = String(url).includes("Shak") ? wrongHtml : rightHtml;
      return { status: 200, data: Buffer.from(html, "latin1") };
    });

    const book = await resolveBabelioMetadata({
      name: "WAKFU 3 Les Mines de Lamororia",
    });
    expect(book?.title).toBe("Wakfu, tome 3 : Les mines de Lamororia");
  });

  it("reuses SearchYield evidence without POSTs", async () => {
    readBabelioSearchEvidence.mockResolvedValueOnce([
      {
        id: "53653",
        title: "Dragon Ball Z - Cycle 1, tome 2",
        url: "https://www.babelio.com/livres/Toriyama-Dragon-Ball-Z-Cycle-1-tome-2/53653",
      },
    ]);

    const hits = await searchBabelioHits("Dragon Ball Z");
    expect(hits).toHaveLength(1);
    expect(hits[0]?.id).toBe("53653");
    expect(mockedPost).not.toHaveBeenCalled();
    expect(promoteBabelioSearchEvidence).not.toHaveBeenCalled();
  });

  it("promotes SearchYield after dual-POST search", async () => {
    mockSearchPosts();
    await searchBabelioHits("Dragon Ball Z");
    expect(promoteBabelioSearchEvidence).toHaveBeenCalledWith(
      "https://www.babelio.com/recherche.php?term=Dragon+Ball+Z",
      expect.arrayContaining([
        expect.objectContaining({ id: "53653" }),
      ]),
    );
  });

  it("searchBabelioHits fusionne HTML puis AJAX", async () => {
    mockSearchPosts();
    const hits = await searchBabelioHits("Dragon Ball Z");
    expect(mockedPost).toHaveBeenCalledWith(
      "https://www.babelio.com/aj_recherche.php",
      expect.objectContaining({ term: "Dragon Ball Z" }),
      expect.any(Object),
    );
    expect(mockedPost).toHaveBeenCalledWith(
      "https://www.babelio.com/recherche.php",
      expect.any(String),
      expect.any(Object),
    );
    expect(hits[0]?.id).toBe("53653");
    expect(hits).toHaveLength(2);
  });
});
