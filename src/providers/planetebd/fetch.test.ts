import { beforeEach, describe, expect, it, vi } from "vitest";
import axios from "axios";

import {
  parsePlanetebdAlbumPage,
  parsePlanetebdSearchHits,
  planetebdSearchUrl,
} from "./fetch";
import { mapPlanetebdMetadata } from "./index";

vi.mock("axios", () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock("@/lib/http/flareSolverr", () => ({
  flareSolverrRequestGet: vi.fn().mockResolvedValue(null),
}));

const mockedGet = vi.mocked(axios.get);

function searchHtml() {
  return `
<article class="featured article">
  <a href="/bd/albert-rene/asterix/asterix-en-lusitanie/58791.html#image"
     title=" Astérix T41 : Astérix en Lusitanie (0), bd chez Albert René de Fabcaro, Conrad">
    <img src="https://static.planetebd.com/dynamicImages/album/cover/normal/58/79/album-cover-normal-58791.jpg" />
  </a>
  <div class="rating">
    <img src="/styles/originalversion/frontend/img/ico_star_y.png" />
    <img src="/styles/originalversion/frontend/img/ico_star_y.png" />
    <img src="/styles/originalversion/frontend/img/ico_star_y.png" />
    <img src="/styles/originalversion/frontend/img/ico_star_y.png" />
  </div>
</article>`;
}

function albumHtml() {
  return `<!DOCTYPE html><html><head>
  <title>Astérix T41 : Astérix en Lusitanie (0), bd chez Albert René de Fabcaro, Conrad</title>
  <meta property="og:title" content="Astérix T41 chez Albert René" />
  <meta property="og:image" content="https://static.planetebd.com/dynamicImages/album/cover/normal/58/79/album-cover-normal-58791.jpg" />
  <meta property="og:description" content="Astérix et Obélix en Lusitanie." />
  <meta property="og:isbn" content="9782017253709" />
</head><body>
  <a href="/bd/series/asterix/1132.html">Astérix</a>
  <div class="album-details">
    <meta itemprop="datePublished" content="2025-10-23" />
    <span itemprop="editor">Albert René</span>
    <a itemprop="genre" href="/recherche/genre/humour.html">Humour</a>
    <meta itemprop="name" content="Astérix en Lusitanie Astérix T41" />
    <h1>Astérix T41</h1>
    <h2 class="album-title">Astérix en Lusitanie</h2>
    <h2 itemprop="description">Astérix et Obélix tentent de démêler un kompromat.</h2>
    <div class="mark-information"><h2>CHEF D'ŒUVRE</h2></div>
    <img src="/styles/originalversion/frontend/img/ico_star_y.png" />
    <img src="/styles/originalversion/frontend/img/ico_star_y.png" />
    <img src="/styles/originalversion/frontend/img/ico_star_y.png" />
    <img src="/styles/originalversion/frontend/img/ico_star_y.png" />
  </div>
</body></html>`;
}

describe("planetebd", () => {
  beforeEach(() => mockedGet.mockReset());

  it("construit l'URL mot-clef", () => {
    expect(planetebdSearchUrl("Astérix")).toContain("mot-clef=Ast%C3%A9rix");
  });

  it("parse les résultats de recherche", () => {
    const hits = parsePlanetebdSearchHits(searchHtml());
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({
      id: "58791",
      title: "Astérix T41 : Astérix en Lusitanie",
      ratingStars: 4,
    });
  });

  it("parse la fiche album", () => {
    const album = parsePlanetebdAlbumPage(
      albumHtml(),
      "https://www.planetebd.com/bd/albert-rene/asterix/asterix-en-lusitanie/58791.html",
    );
    expect(album).toMatchObject({
      id: "58791",
      title: "Astérix T41 : Astérix en Lusitanie",
      publisher: "Albert René",
      seriesName: "Astérix",
      barcode: "9782017253709",
      releaseDate: "2025-10-23",
      ratingLabel: "CHEF D'ŒUVRE",
    });
    expect(album?.genres).toContain("Humour");
    expect(album?.authors).toEqual(
      expect.arrayContaining(["Fabcaro", "Conrad"]),
    );
  });

  it("mappe rating / série / ISBN", () => {
    const metadata = mapPlanetebdMetadata(
      parsePlanetebdAlbumPage(
        albumHtml(),
        "https://www.planetebd.com/bd/albert-rene/asterix/asterix-en-lusitanie/58791.html",
      ),
    );
    expect(metadata?.externalIds).toEqual({ planetebd: "58791" });
    expect(metadata?.facts?.find((f) => f.kind === "rating")?.value).toContain(
      "CHEF D'ŒUVRE",
    );
    expect(metadata?.barcode).toBe("9782017253709");
  });
});
